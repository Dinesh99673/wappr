import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode";
import fs from "fs/promises";
import path from "path";
import { prisma, ensureSessionRow } from "@/lib/db/prisma";

/**
 * SessionManager — owns the single live whatsapp-web.js Client instance.
 *
 * This is the ONLY module that touches the client directly. Everything else
 * (routes, the bulk worker) goes through the functions exported here. There is
 * exactly one WhatsApp session for the whole app (Session row id = 1).
 */

export type SessionStatus =
  | "UNLINKED"
  | "QR_PENDING"
  | "AUTHENTICATED"
  | "EXPIRED";

const AUTH_DIR = path.join(process.cwd(), ".wwebjs_auth");
const CLIENT_ID = "wappr";
const QR_TIMEOUT_MS = Number(process.env.QR_TIMEOUT_MS ?? 90_000);

type ManagerState = {
  client: Client | null;
  latestQr: string | null; // data URL of the most recent QR
  qrTimeout: NodeJS.Timeout | null;
  initializing: boolean;
  resumeAttempted: boolean;
};

// Persist across dev hot-reloads and route invocations within one process.
const globalForSession = globalThis as unknown as {
  __wapprSession?: ManagerState;
};

const state: ManagerState =
  globalForSession.__wapprSession ??
  (globalForSession.__wapprSession = {
    client: null,
    latestQr: null,
    qrTimeout: null,
    initializing: false,
    resumeAttempted: false,
  });

// --- internal helpers -------------------------------------------------------

async function setStatus(status: SessionStatus, phoneNumber?: string | null) {
  await ensureSessionRow();
  await prisma.session.update({
    where: { id: 1 },
    data: {
      status,
      ...(phoneNumber !== undefined ? { phoneNumber } : {}),
    },
  });
}

function clearQrTimeout() {
  if (state.qrTimeout) {
    clearTimeout(state.qrTimeout);
    state.qrTimeout = null;
  }
}

function startQrTimeout() {
  // Single overall window from the first QR — do not reset on QR refresh.
  if (state.qrTimeout) return;
  state.qrTimeout = setTimeout(async () => {
    state.qrTimeout = null;
    const s = await prisma.session.findUnique({ where: { id: 1 } });
    if (s?.status === "QR_PENDING") {
      // Never linked — tear down and return to UNLINKED (not EXPIRED).
      await destroyCurrentClient("UNLINKED");
    }
  }, QR_TIMEOUT_MS);
}

async function deleteAuthFolder() {
  await fs.rm(AUTH_DIR, { recursive: true, force: true });
}

/**
 * Runtime workaround for WhatsApp's "No LID for user" error.
 *
 * On first contact with some numbers, WhatsApp Web can't resolve an internal
 * LID and sendMessage throws. This patch (from whatsapp-web.js issue #3834,
 * community-confirmed) replaces the injected `window.WWebJS.getChat` so that,
 * when the normal chat lookup fails, it forces the LID to materialize by
 * briefly opening the chat + info panel. For already-known chats it behaves
 * identically to the original. Injected into the browser page after `ready`.
 *
 * This targets WhatsApp Web internals that Meta changes frequently, so it is
 * best-effort: any failure is swallowed. Disable with LID_WORKAROUND=off.
 */
const LID_WORKAROUND_SCRIPT = `
(() => {
  if (!window.WWebJS || !window.Store) return;
  window.WWebJS.getChat = async (chatId, { getAsModel = true } = {}) => {
    const isChannel = /@\\w*newsletter\\b/.test(chatId);
    const chatWid = window.Store.WidFactory.createWid(chatId);
    let chat;
    if (isChannel) {
      try {
        chat = window.Store.NewsletterCollection.get(chatId);
        if (!chat) {
          await window.Store.ChannelUtils.loadNewsletterPreviewChat(chatId);
          chat = await window.Store.NewsletterCollection.find(chatWid);
        }
      } catch (err) {
        chat = null;
      }
    } else {
      chat = await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid)
        .then((chat) => chat.chat)
        .catch(async () => {
          chat = window.Store.Chat.get(chatWid) || (await window.Store.Chat.find(chatWid));
          if (!chat) return;
          try {
            await window.Store.Cmd.openChatBottom(chat);
            await window.Store.Cmd.openCurrentChatInfo();
            await new Promise((resolve) => setTimeout(resolve, 500));
            await window.Store.Cmd.closeActiveChat();
            chat = await window.Store.FindOrCreateChat.findOrCreateLatestChat(chatWid);
          } catch (err) {
            return;
          }
        });
    }
    return getAsModel && chat
      ? await window.WWebJS.getChatModel(chat, { isChannel: isChannel })
      : chat;
  };
})();
`;

async function injectLidWorkaround(client: Client) {
  if (process.env.LID_WORKAROUND === "off") return;
  try {
    const page = (
      client as unknown as {
        pupPage?: { evaluate: (s: string) => Promise<unknown> };
      }
    ).pupPage;
    if (page) await page.evaluate(LID_WORKAROUND_SCRIPT);
  } catch (err) {
    console.warn(
      "[wappr] LID workaround injection failed (non-fatal):",
      (err as Error).message,
    );
  }
}

function buildClient(): Client {
  return new Client({
    authStrategy: new LocalAuth({ clientId: CLIENT_ID, dataPath: AUTH_DIR }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  });
}

/**
 * Fully tears down the current client: destroys the browser, deletes the
 * on-disk auth session, sets the given final DB status, and frees the in-memory
 * reference so Chromium memory is released.
 */
export async function destroyCurrentClient(
  finalStatus: SessionStatus = "EXPIRED",
) {
  clearQrTimeout();
  const client = state.client;
  state.client = null;
  state.latestQr = null;
  state.initializing = false;

  if (client) {
    try {
      await client.destroy();
    } catch {
      // Browser may already be gone — ignore.
    }
  }
  try {
    await deleteAuthFolder();
  } catch {
    // Folder may not exist — ignore.
  }
  await setStatus(finalStatus, finalStatus === "AUTHENTICATED" ? undefined : null);
}

// --- public API -------------------------------------------------------------

/**
 * Starts (or reports) a login. Returns the current status and, when a QR is
 * needed, its data URL. Behavior when already authenticated with a live client:
 * this is a NO-OP that simply reports the linked state.
 */
export async function startLogin(): Promise<{
  status: SessionStatus;
  qr?: string;
  phoneNumber?: string | null;
}> {
  await ensureSessionRow();
  const current = await prisma.session.findUnique({ where: { id: 1 } });

  // Already linked with a live client → no-op.
  if (state.client && current?.status === "AUTHENTICATED") {
    return { status: "AUTHENTICATED", phoneNumber: current.phoneNumber };
  }

  // A login is already in flight — return whatever QR we have.
  if (state.initializing) {
    return { status: "QR_PENDING", qr: state.latestQr ?? undefined };
  }

  // Tear down any stale/leftover client before starting fresh.
  if (state.client) {
    await destroyCurrentClient("UNLINKED");
  }

  state.initializing = true;
  const client = buildClient();
  state.client = client;

  const result = await new Promise<{
    status: SessionStatus;
    qr?: string;
    phoneNumber?: string | null;
  }>((resolve) => {
    let settled = false;
    const finishQr = () => {
      if (settled) return;
      settled = true;
      resolve({ status: "QR_PENDING", qr: state.latestQr ?? undefined });
    };
    const finishReady = (phoneNumber: string | null) => {
      if (settled) return;
      settled = true;
      resolve({ status: "AUTHENTICATED", phoneNumber });
    };

    // These listeners live for the whole client lifetime.
    client.on("qr", async (qr: string) => {
      try {
        state.latestQr = await qrcode.toDataURL(qr);
      } catch {
        state.latestQr = null;
      }
      await setStatus("QR_PENDING");
      startQrTimeout();
      finishQr();
    });

    client.on("ready", async () => {
      clearQrTimeout();
      await injectLidWorkaround(client);
      const number = client.info?.wid?.user ?? null;
      await setStatus("AUTHENTICATED", number);
      state.latestQr = null;
      finishReady(number);
    });

    client.on("authenticated", () => {
      clearQrTimeout();
    });

    client.on("auth_failure", async () => {
      await destroyCurrentClient("EXPIRED");
      finishQr();
    });

    // Fired any time later, even long after ready — session died.
    client.on("disconnected", async () => {
      await destroyCurrentClient("EXPIRED");
    });

    // Safety net so the HTTP request never hangs if initialize stalls.
    setTimeout(() => finishQr(), 45_000);

    client.initialize().catch(async () => {
      await destroyCurrentClient("UNLINKED");
      finishQr();
    });
  });

  state.initializing = false;
  return result;
}

/**
 * Explicit user-triggered logout. Full teardown, returns to UNLINKED.
 */
export async function logout() {
  await destroyCurrentClient("UNLINKED");
}

/**
 * Returns the current Session row. Lazily attempts a one-time resume if the DB
 * says AUTHENTICATED but no client is live (e.g. after a process restart).
 */
export async function getStatus() {
  await ensureSessionRow();
  void resumeIfPersisted();
  const s = await prisma.session.findUnique({ where: { id: 1 } });
  return {
    status: (s?.status ?? "UNLINKED") as SessionStatus,
    phoneNumber: s?.phoneNumber ?? null,
    updatedAt: s?.updatedAt ?? null,
  };
}

/**
 * Returns the live client only when the session is authenticated and running.
 * Returns null otherwise — callers must treat null as SESSION_EXPIRED.
 */
export async function getClient(): Promise<Client | null> {
  const s = await prisma.session.findUnique({ where: { id: 1 } });
  if (!state.client || s?.status !== "AUTHENTICATED") return null;
  return state.client;
}

/**
 * After a process restart the in-memory client is gone but LocalAuth data may
 * still be on disk. This tries to silently restore the session once. If the
 * persisted session is dead (whatsapp emits a fresh QR), it is torn down and
 * marked EXPIRED rather than showing a QR to nobody.
 */
async function resumeIfPersisted() {
  if (state.resumeAttempted) return;
  state.resumeAttempted = true;

  const s = await prisma.session.findUnique({ where: { id: 1 } });
  if (!s || s.status !== "AUTHENTICATED" || state.client) return;

  try {
    await fs.access(AUTH_DIR);
  } catch {
    await setStatus("EXPIRED", null);
    return;
  }

  const client = buildClient();
  state.client = client;

  client.on("qr", async () => {
    // Persisted session is no longer valid — needs a fresh link.
    await destroyCurrentClient("EXPIRED");
  });
  client.on("ready", async () => {
    await injectLidWorkaround(client);
    const number = client.info?.wid?.user ?? null;
    await setStatus("AUTHENTICATED", number);
  });
  client.on("disconnected", async () => {
    await destroyCurrentClient("EXPIRED");
  });
  client.on("auth_failure", async () => {
    await destroyCurrentClient("EXPIRED");
  });

  client.initialize().catch(async () => {
    await destroyCurrentClient("EXPIRED");
  });
}
