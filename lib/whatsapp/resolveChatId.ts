import type { Client } from "whatsapp-web.js";
import { normalizeNumber } from "@/lib/whatsapp/normalizeNumber";

export type ResolveResult =
  | { ok: true; chatId: string }
  | { ok: false; reason: "INVALID_FORMAT" | "NOT_REGISTERED"; message: string };

/**
 * Resolves a raw phone number to the chat id WhatsApp actually wants.
 *
 * Rather than blindly constructing `<digits>@c.us`, we ask WhatsApp whether the
 * number is registered via `getNumberId` and use the id it returns. This:
 *   - rejects numbers that aren't on WhatsApp with a clear error instead of a
 *     cryptic internal crash, and
 *   - hands sendMessage the exact id WhatsApp expects.
 *
 * Note: this does NOT by itself resolve the "No LID for user" error, which is a
 * WhatsApp-side LID-migration issue triggered on first contact — see the
 * runtime workaround in sessionManager.ts.
 */
export async function resolveChatId(
  client: Client,
  raw: string,
): Promise<ResolveResult> {
  const normalized = normalizeNumber(raw);
  if (!normalized) {
    return {
      ok: false,
      reason: "INVALID_FORMAT",
      message:
        "Number is not valid. Use a full international number including country code.",
    };
  }

  const digits = normalized.replace(/@c\.us$/, "");
  try {
    const numberId = await client.getNumberId(digits);
    if (!numberId) {
      return {
        ok: false,
        reason: "NOT_REGISTERED",
        message: "This number is not registered on WhatsApp.",
      };
    }
    return { ok: true, chatId: numberId._serialized };
  } catch {
    // getNumberId itself failed (transient) — fall back to the constructed id
    // rather than blocking the send.
    return { ok: true, chatId: normalized };
  }
}
