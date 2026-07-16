// Polls the SPPU results portal for one seat number and pings WhatsApp (through
// Wappr's REST API) the moment the result is live.
//
// README.md documents the portal quirks this is built around — all verified
// against the live site — and why several steps look the way they do.

import { chromium } from "playwright";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(HERE, ".env") });

const DASHBOARD_URL = "https://onlineresults.unipune.ac.in/SPPU";
const ONCE = process.argv.includes("--once");

// The portal regularly takes 30-60s per request (and 503s) around a result drop,
// so every wait here is far longer than a normal site would need. Transient
// failures retry in place rather than costing a whole CHECK_INTERVAL.
const NAV_TIMEOUT = 180_000;
const LOAD_TRIES = 5;
const MODAL_TRIES = 3;
const SUBMIT_TRIES = 3;
const CAPTCHA_IMG_TRIES = 4;

const cfg = {
  courseName: process.env.COURSE_NAME ?? "B.E.(2019 PAT.) SUMMER SESSION 2026",
  seatNo: process.env.SEAT_NO ?? "",
  motherName: process.env.MOTHER_NAME ?? "",
  interval: parseDuration(process.env.CHECK_INTERVAL ?? "10m"),
  maxAttempts: Number(process.env.MAX_ATTEMPTS ?? 0),
  notifyNumber: process.env.NOTIFY_NUMBER ?? "",
  wapprBaseUrl: (process.env.WAPPR_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  wapprApiToken: process.env.WAPPR_API_TOKEN ?? "",
  attachHost: process.env.ATTACH_HOST || "127.0.0.1",
  browserChannel: process.env.BROWSER_CHANNEL || undefined,
  headless: /^true$/i.test(process.env.HEADLESS ?? "false"),
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  captchaAttempts: Number(process.env.CAPTCHA_ATTEMPTS ?? 4),
};

// ─── small helpers ───────────────────────────────────────────────────────────

/** "10m" / "90s" / "1h" / "600000" → milliseconds. */
function parseDuration(raw) {
  const m = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!m) throw new Error(`Bad duration: "${raw}". Use e.g. 30s, 10m, 1h.`);
  const mult = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[(m[2] ?? "ms").toLowerCase()];
  return Number(m[1]) * mult;
}

/** Case-insensitive, whitespace-insensitive form used for all name matching. */
const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

function humanize(ms) {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

// ─── config validation ───────────────────────────────────────────────────────

function validateConfig() {
  const missing = [];
  if (!cfg.seatNo) missing.push("SEAT_NO");
  if (!cfg.motherName) missing.push("MOTHER_NAME");
  if (!cfg.anthropicKey) missing.push("ANTHROPIC_API_KEY");
  if (missing.length) {
    console.error(
      `\nMissing required config: ${missing.join(", ")}\n` +
        `Copy .env.example to .env in ${HERE} and fill it in.\n`,
    );
    process.exit(1);
  }
  if (!cfg.notifyNumber) {
    log("NOTIFY_NUMBER is blank — will save artifacts but send no WhatsApp message.");
  }
}

// ─── step 1: dashboard + exact row match ─────────────────────────────────────

/**
 * Loads the dashboard, retrying the portal's frequent 503/504s in place — far
 * cheaper than falling out to the caller's multi-minute CHECK_INTERVAL.
 */
async function loadDashboard(page) {
  for (let i = 1; i <= LOAD_TRIES; i++) {
    try {
      const res = await page.goto(DASHBOARD_URL, { waitUntil: "commit", timeout: NAV_TIMEOUT });
      const status = res?.status() ?? 0;
      if (status === 200) {
        // The table is a better readiness signal than any load event here: the
        // page needs minutes to fully settle, but the rows arrive with the HTML.
        await page.locator("#tblRVList tbody tr").first().waitFor({
          state: "attached",
          timeout: NAV_TIMEOUT,
        });
        return;
      }
      log(`Dashboard returned HTTP ${status} (try ${i}/${LOAD_TRIES}) — retrying.`);
    } catch (err) {
      log(`Dashboard load failed (try ${i}/${LOAD_TRIES}): ${err.message.split("\n")[0]}`);
    }
    if (i < LOAD_TRIES) await sleep(15_000);
  }
  throw new Error(`Dashboard did not load in ${LOAD_TRIES} tries.`);
}

/**
 * Loads the dashboard and clicks "Go for Result" in the row whose Course Name
 * matches cfg.courseName exactly (ignoring case/whitespace). Never uses row index.
 * @returns {Promise<boolean>} false when the course is not published yet.
 */
async function openResultForm(page) {
  log("Loading dashboard (portal is slow on result day — this can take a minute)…");
  await loadDashboard(page);

  const rows = page.locator("#tblRVList tbody tr");
  const count = await rows.count();
  if (count === 0) throw new Error("Dashboard table loaded but has no rows.");
  log(`Dashboard table loaded — ${count} published results.`);

  const target = norm(cfg.courseName);
  let match = null;

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const cell = await row.locator("td").nth(1).innerText();
    if (norm(cell) === target) {
      match = row;
      log(`Matched row ${i + 1}: "${cell.trim()}"`);
      break;
    }
  }

  if (!match) {
    log(`Course "${cfg.courseName}" is not on the dashboard yet.`);
    return false;
  }

  const btn = match.locator('input[value="Go for Result"]');
  await btn.waitFor({ state: "visible", timeout: 30_000 });

  // No navigation happens here: Enterdetails() jQuery-loads the form into a
  // modal, and that XHR 503s as readily as anything else, so re-click on miss.
  for (let i = 1; i <= MODAL_TRIES; i++) {
    await btn.click();
    try {
      await page.locator("#SeatNo").waitFor({ state: "visible", timeout: 60_000 });
      log("Result search form opened.");
      return true;
    } catch {
      log(`Result form did not open (try ${i}/${MODAL_TRIES}) — portal likely 503'd.`);
      if (i < MODAL_TRIES) await sleep(10_000);
    }
  }
  throw new Error("Result form never opened.");
}

// ─── step 2: fill the form, including captcha ────────────────────────────────

const INTERACTIVE_CAPTCHA = [
  'iframe[src*="recaptcha"]',
  ".g-recaptcha",
  'iframe[src*="hcaptcha"]',
  ".h-captcha",
  'iframe[src*="challenges.cloudflare.com"]',
  ".cf-turnstile",
].join(", ");

/** True when a real anti-bot widget is present, which we never try to solve. */
async function hasInteractiveCaptcha(page) {
  return (await page.locator(INTERACTIVE_CAPTCHA).count()) > 0;
}

/** Blocks until a human fills the captcha box in the visible browser. */
async function waitForManualCaptcha(page) {
  console.log(
    "\n" +
      "─".repeat(64) +
      "\n  INTERACTIVE CAPTCHA DETECTED — please solve it in the browser window.\n" +
      "  Execution resumes automatically once it is filled in.\n" +
      "─".repeat(64) +
      "\n",
  );
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#CaptchaText");
      if (el && el.value.trim().length >= 5) return true;
      const rc = document.querySelector('[name="g-recaptcha-response"]');
      return !!(rc && rc.value.length > 0);
    },
    null,
    { timeout: 0, polling: 1000 },
  );
  log("Captcha solved — resuming.");
}

const CAPTCHA_LEN = 5; // the portal's own check() requires exactly 5 chars
let anthropic = null;

/** Current captcha image, or null while the src is still the placeholder "#". */
async function currentCaptchaImage(page) {
  const src = await page.locator("#captcha_img").getAttribute("src");
  const m = /^data:image\/(jpe?g|png);base64,(.+)$/.exec(src ?? "");
  return m ? { mediaType: m[1].startsWith("jp") ? "image/jpeg" : "image/png", data: m[2] } : null;
}

/**
 * Gets a captcha image, re-asking when the RFCTLN call 503s (it often does, and
 * then the src just stays "#" forever — no image ever appears on its own).
 */
async function readCaptchaImage(page) {
  for (let i = 1; i <= CAPTCHA_IMG_TRIES; i++) {
    try {
      await page.waitForFunction(
        () => (document.querySelector("#captcha_img")?.src ?? "").startsWith("data:image"),
        null,
        { timeout: 30_000 },
      );
      const img = await currentCaptchaImage(page);
      if (img) return img;
    } catch {}
    log(`Captcha image not delivered (try ${i}/${CAPTCHA_IMG_TRIES}) — requesting a new one.`);
    await page.evaluate(() => window.Refreshcaptcha?.());
    await sleep(6000);
  }
  throw new Error("Captcha image never arrived — portal is refusing requests.");
}

/** Reads the captcha with Claude. The image bytes come straight from the DOM. */
async function ocrCaptcha(img) {
  if (!cfg.anthropicKey) throw new Error("ANTHROPIC_API_KEY is required to read the captcha.");
  if (!anthropic) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
  }
  const res = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
          {
            type: "text",
            text:
              `This is a ${CAPTCHA_LEN}-character alphanumeric captcha. Transcribe it exactly, ` +
              `preserving upper/lower case. Reply with ONLY those ${CAPTCHA_LEN} characters.`,
          },
        ],
      },
    ],
  });
  const text = (res.content.find((b) => b.type === "text")?.text ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (!text) throw new Error("Claude returned no captcha text.");
  return text;
}

/**
 * Checks a guess against the portal's own validator (the same call the page makes
 * on keyup), so a misread costs one cheap request instead of a failed submit.
 * #hdOrgCaptchaText holds an encrypted token, not the answer — only the server
 * can compare, which is why the image has to be read in the first place.
 *
 * @returns {Promise<"valid"|"invalid"|"unknown">} "unknown" when the validator
 * itself is down (it 503s constantly under load) — which must not be mistaken
 * for a wrong guess, or we'd discard a good answer.
 */
async function checkCaptchaGuess(page, guess) {
  return page.evaluate(async (g) => {
    const hct = document.querySelector("#hdOrgCaptchaText")?.value ?? "";
    if (!hct) return "unknown";
    try {
      const res = await fetch("/Result/Dashboard/VALCHCT", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: new URLSearchParams({ ctxt: g, hct }),
      });
      if (!res.ok) return "unknown";
      return String(await res.text()).replace(/"/g, "").trim() === "1" ? "valid" : "invalid";
    } catch {
      return "unknown";
    }
  }, guess);
}

async function solveCaptcha(page) {
  for (let i = 1; i <= cfg.captchaAttempts; i++) {
    const img = await readCaptchaImage(page);
    const guess = await ocrCaptcha(img);

    if (guess.length !== CAPTCHA_LEN) {
      log(`Captcha read "${guess}" (${guess.length} chars, expected ${CAPTCHA_LEN}) — refreshing.`);
    } else {
      const verdict = await checkCaptchaGuess(page, guess);
      if (verdict === "valid") {
        await page.locator("#CaptchaText").fill(guess);
        log(`Captcha solved on try ${i}: "${guess}" (verified).`);
        return true;
      }
      if (verdict === "unknown") {
        // Validator is down. The guess is probably fine and the submit re-checks
        // it server-side anyway, so try it rather than throw it away.
        await page.locator("#CaptchaText").fill(guess);
        log(`Captcha "${guess}" could not be pre-verified (validator down) — submitting anyway.`);
        return true;
      }
      log(`Captcha guess "${guess}" rejected — refreshing.`);
    }

    if (i < cfg.captchaAttempts) {
      // A refresh that 503s leaves the old image up; re-reading it would just
      // reproduce the same wrong guess, so wait for the picture to actually change.
      await page.evaluate(() => window.Refreshcaptcha?.());
      try {
        await page.waitForFunction(
          (old) => {
            const s = document.querySelector("#captcha_img")?.src ?? "";
            return s.startsWith("data:image") && !s.endsWith(old);
          },
          img.data.slice(-48),
          { timeout: 30_000 },
        );
      } catch {
        log("Captcha refresh did not take — backing off.");
        await sleep(8000);
      }
    }
  }
  return false;
}

/** Reads back what the page actually holds — the portal's check() sees this. */
async function formState(page) {
  return page.evaluate(() => ({
    seatCount: document.querySelectorAll("#SeatNo").length,
    seat: document.querySelector("#SeatNo")?.value ?? null,
    mother: document.querySelector("#MotherName")?.value ?? null,
    captcha: document.querySelector("#CaptchaText")?.value ?? null,
  }));
}

async function fillForm(page) {
  // Captcha first: OCR takes ~15s, and anything we type before it can be wiped
  // by the dashboard's still-running scripts. Text fields go in last, so the
  // gap between filling them and submitting is as small as possible.
  if (await hasInteractiveCaptcha(page)) {
    await waitForManualCaptcha(page);
  } else if (!(await solveCaptcha(page))) {
    return false;
  }

  await page.locator("#SeatNo").fill(cfg.seatNo);
  await page.locator("#MotherName").fill(cfg.motherName);

  // The portal reads these with jQuery at submit time; make sure they survived.
  let s = await formState(page);
  if (!s.seat || !s.mother) {
    log(`Fields did not stick (${JSON.stringify(s)}) — re-filling.`);
    await page.locator("#SeatNo").fill(cfg.seatNo);
    await page.locator("#MotherName").fill(cfg.motherName);
    s = await formState(page);
  }
  log(
    `Pre-submit: seat="${s.seat}" mother="${s.mother ? "set" : "EMPTY"}" ` +
      `captcha="${s.captcha}" (#SeatNo elements: ${s.seatCount})`,
  );
  return Boolean(s.seat && s.mother && s.captcha);
}

// ─── step 3: submit + classify ───────────────────────────────────────────────

const PATTERNS = [
  ["CAPTCHA_FAILED", /invalid\s*captcha|captcha.*(incorrect|not\s*match|failed)/i],
  ["INVALID_SEAT", /(seat\s*(no|number)[^.]{0,40}(invalid|not\s*(found|exist|valid))|invalid\s*seat)/i],
  ["WRONG_MOTHER_NAME", /mother[^.]{0,40}(not\s*match|incorrect|invalid|wrong)/i],
  ["NOT_DECLARED", /(result[^.]{0,40}(not\s*(yet\s*)?(declar|publish|avail)|withheld|awaited)|not\s*declared)/i],
  // Deliberately not a bare /503/ — subject codes on a real marksheet look like
  // that, and a false match here would silently poll past a declared result.
  [
    "SERVER_ERROR",
    /(service\s*unavailable|gateway\s*time-?out|runtime\s*error|server\s*error in|\bhttp\s*(500|502|503|504)\b)/i,
  ],
];

/** Success needs a positive marks/grade signal, not just absence of errors. */
const SUCCESS = /\b(sgpa|cgpa|total\s*credit|grade\s*point|result\s*:\s*(pass|fail)|marks\s*obtained)\b/i;

function classify(text) {
  for (const [status, re] of PATTERNS) if (re.test(text)) return status;
  if (SUCCESS.test(text) && norm(text).includes(norm(cfg.seatNo))) return "RESULT_AVAILABLE";
  return "UNKNOWN";
}

/**
 * Real PDF bytes, not Chrome's viewer shell. Checked before anything is saved or
 * sent: the shell arrives with content-type: application/pdf and would otherwise
 * sail through as a "marksheet".
 */
function isPdf(buf) {
  return (
    Buffer.isBuffer(buf) && buf.length > 1024 && buf.subarray(0, 5).toString("latin1") === "%PDF-"
  );
}

/**
 * Posts the result form from inside the page and returns the raw response.
 *
 * Deliberately not a click. Letting the browser navigate hands a PDF response to
 * Chrome's plugin, after which the bytes are unreachable — response.body() yields
 * the viewer's shell HTML and the DOM is empty. Re-issuing the POST from
 * Playwright's own request stack does get the bytes, but drew a wall of 504s while
 * the identical submit by hand kept working. An in-page fetch is both: the
 * browser's real session, cookies and HTTP stack, so the request looks exactly like
 * a manual submit, but the reply arrives as an ArrayBuffer we can read.
 */
async function postForm(page) {
  const res = await page.evaluate(async () => {
    const form = document.querySelector("#SeatNo")?.closest("form");
    if (!form) return { error: "the form disappeared" };
    try {
      const r = await fetch(form.action, {
        method: "POST",
        body: new FormData(form), // matches the form's multipart enctype
        credentials: "include",
      });
      const bytes = new Uint8Array(await r.arrayBuffer());
      // Chunked, because apply() on a whole marksheet overflows the stack.
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return {
        status: r.status,
        ctype: (r.headers.get("content-type") ?? "").toLowerCase(),
        redirected: r.redirected,
        url: r.url,
        data: btoa(bin),
      };
    } catch (e) {
      return { error: String(e?.message ?? e) };
    }
  });
  if (res.error) throw new Error(`Form POST failed: ${res.error}`);
  return { ...res, body: Buffer.from(res.data, "base64") };
}

async function submitAndClassify(page) {
  let seen = null;
  for (let i = 1; i <= SUBMIT_TRIES; i++) {
    seen = await postForm(page);
    log(`Submit responded ${seen.status} (${seen.ctype || "no content-type"}, ${seen.body.length} b).`);

    // 502/503/504 is the backend falling over, not an answer about the result. A
    // gateway error never reached the app, so the captcha token is still good and
    // the same form can simply be posted again.
    if (seen.status < 500) break;
    if (i < SUBMIT_TRIES) {
      log(`Portal gateway error — re-posting the same form in 15s (try ${i}/${SUBMIT_TRIES}).`);
      await sleep(15_000);
    }
  }

  if (seen.status >= 500) return { status: "SERVER_ERROR", text: "", pdf: null };

  // fetch() follows redirects, so a bounce back to the dashboard shows up as a
  // 200 of the wrong page. That's the portal discarding the submission (stale
  // captcha token, dropped session) rather than an answer — go around again.
  if (seen.redirected && !/RESULT(%20|\s|\+)DISPLAY/i.test(seen.url)) {
    log(`Submit was redirected to ${seen.url} — the portal discarded it.`);
    return { status: "SUBMIT_REJECTED", text: "", pdf: null };
  }

  if (isPdf(seen.body)) {
    log(`Result returned as a PDF (${(seen.body.length / 1024).toFixed(1)} KB).`);
    return { status: "RESULT_AVAILABLE", text: "", pdf: seen.body };
  }

  if (seen.ctype.includes("pdf")) {
    log(`Portal sent application/pdf but the body is not a PDF (${seen.body.length} bytes).`);
    return { status: "UNKNOWN", text: "", pdf: null };
  }

  const text = seen.body.toString("utf8").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  return { status: classify(text), text, pdf: null };
}

// ─── step 4: artifacts ───────────────────────────────────────────────────────

/**
 * Renders the marksheet to a PNG. The result arrives as a PDF inside Chrome's
 * plugin viewer, which page.screenshot() cannot see into (it returns a blank grey
 * rectangle), so the only way to get an image is to rasterise the bytes.
 * @returns {Promise<string|null>} path to the PNG, or null if rendering failed.
 */
async function renderPdfToPng(pdf, dir) {
  try {
    const { pdfToPng } = await import("pdf-to-png-converter");
    const pages = await pdfToPng(pdf, { viewportScale: 2.0, pagesToProcess: [1] });
    if (!pages.length) throw new Error("renderer produced no pages");
    const file = path.join(dir, "result.png");
    await fs.writeFile(file, pages[0].content);
    log(`Result rendered to PNG (${(pages[0].content.length / 1024).toFixed(0)} KB).`);
    return file;
  } catch (err) {
    log(`Could not render the PDF to an image (${err.message.split("\n")[0]}).`);
    return null;
  }
}

/**
 * @param {Buffer|null} pdf The marksheet straight off the wire, when the portal
 * returned one. Saved as-is *and* rendered to a PNG, since WhatsApp shows an image
 * inline where a PDF would just be a document to tap.
 */
async function saveArtifacts(page, status, pdf = null) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(HERE, "artifacts", `${stamp}_${status}`);
  await fs.mkdir(dir, { recursive: true });

  if (pdf) {
    const pdfFile = path.join(dir, "result.pdf");
    await fs.writeFile(pdfFile, pdf);
    log(`Result PDF saved to ${pdfFile}`);

    const png = await renderPdfToPng(pdf, dir);
    return png
      ? { dir, attachment: png, contentType: "image/png" }
      : { dir, attachment: pdfFile, contentType: "application/pdf" };
  }

  // HTML response (an error or an unrecognised page): capture what's on screen.
  const png = path.join(dir, "result.png");
  await page.screenshot({ path: png, fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(dir, "result.html"), await page.content(), "utf8").catch(() => {});
  log(`Snapshot saved to ${dir}`);
  return { dir, attachment: png, contentType: "image/png" };
}

// ─── step 5: notify through Wappr ────────────────────────────────────────────

/**
 * Serves one file on a random loopback port; Wappr fetches the URL server-side
 * (its /send-media takes a URL, not bytes). The filename in the URL matters —
 * whatsapp-web.js derives the attachment's name and type from it.
 */
async function serveFile(filePath, contentType) {
  const buf = await fs.readFile(filePath);
  const name = path.basename(filePath);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": buf.length });
    res.end(buf);
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const { port } = server.address();
  return {
    url: `http://${cfg.attachHost}:${port}/${name}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

async function wapprPost(endpoint, body) {
  const headers = { "Content-Type": "application/json" };
  if (cfg.wapprApiToken) headers.Authorization = `Bearer ${cfg.wapprApiToken}`;
  const res = await fetch(`${cfg.wapprBaseUrl}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${endpoint} → ${res.status} ${json.error ?? ""} ${json.message ?? ""}`);
  return json;
}

/** @returns {Promise<boolean>} whether a message actually went out. */
async function notify(message, attachment, contentType) {
  if (!cfg.notifyNumber) return false;

  // Try with the marksheet attached; fall back to text so the alert still lands.
  if (attachment) {
    let served;
    try {
      served = await serveFile(attachment, contentType);
      await wapprPost("/api/messages/send-media", {
        number: cfg.notifyNumber,
        message,
        attachmentUrl: served.url,
      });
      log(`WhatsApp notification sent with ${path.basename(attachment)}.`);
      return true;
    } catch (err) {
      log(`Media send failed (${err.message}); falling back to text-only.`);
    } finally {
      await served?.close();
    }
  }

  try {
    await wapprPost("/api/messages/send", { number: cfg.notifyNumber, message });
    log("WhatsApp notification sent (text only).");
    return true;
  } catch (err) {
    log(`WhatsApp notification FAILED: ${err.message}`);
    log("Is Wappr running at " + cfg.wapprBaseUrl + " and logged in to WhatsApp?");
    return false;
  }
}

// ─── main loop ───────────────────────────────────────────────────────────────

const SUCCESS_MESSAGE =
  "🎉 Your SPPU B.E. (2019 PAT.) Summer Session 2026 result is available.";

/**
 * One full attempt, in its own browser. This may poll for days, so each pass gets
 * a fresh process rather than nursing one long-lived browser through crashes.
 * Returns true only when the result was found and notified.
 */
async function attempt() {
  const browser = await chromium.launch({
    headless: cfg.headless,
    channel: cfg.browserChannel,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Images and fonts are the bulk of this page's load time; stylesheets are small
  // and must stay, or the Bootstrap modal lays out wrong. Scripts and XHR stay —
  // the row button uses jQuery. The captcha is an inline data URI, so blocking
  // network images can't hide it.
  await page.route("**/*", (route) =>
    ["image", "font", "media"].includes(route.request().resourceType())
      ? route.abort()
      : route.continue(),
  );

  // The portal uses window.alert for validation errors; auto-dismiss and record.
  const alerts = [];
  page.on("dialog", async (d) => {
    alerts.push(d.message());
    log(`Portal alert: "${d.message()}"`);
    await d.dismiss().catch(() => {});
  });

  try {
    if (!(await openResultForm(page))) return false;

    if (!(await fillForm(page))) {
      log(`Could not solve the captcha in ${cfg.captchaAttempts} tries — will retry later.`);
      return false;
    }

    const { status, text, pdf } = await submitAndClassify(page);

    // check() blocks its own submit with an alert and never posts; that isn't a
    // result page, so don't try to classify whatever is still on screen.
    if (alerts.some((a) => /please enter|invalid captcha/i.test(a))) {
      log("Portal blocked the submit before it posted — will retry.");
      return false;
    }

    switch (status) {
      case "RESULT_AVAILABLE": {
        log("✅ RESULT IS AVAILABLE.");
        const { dir, attachment, contentType } = await saveArtifacts(page, "RESULT", pdf);
        const sent = await notify(SUCCESS_MESSAGE, attachment, contentType);
        log(
          sent
            ? "Done — result captured and sent to WhatsApp."
            : `Done — result saved to ${dir}, but the WhatsApp message did NOT go out.`,
        );
        return true;
      }
      case "NOT_DECLARED":
        log("Result not declared for this seat number yet.");
        return false;
      case "INVALID_SEAT":
        throw new Error("Portal says the seat number is invalid — fix SEAT_NO in .env.");
      case "WRONG_MOTHER_NAME":
        throw new Error("Portal says the mother's name does not match — fix MOTHER_NAME in .env.");
      case "CAPTCHA_FAILED":
        log("Captcha rejected — will retry.");
        return false;
      case "SUBMIT_REJECTED":
        log("Portal redirected the submit back to the dashboard — will retry.");
        return false;
      case "SERVER_ERROR":
        log("Portal returned a server error — will retry.");
        return false;
      default: {
        // Don't guess: keep a snapshot so the patterns can be tuned.
        log("Could not classify the response — saving a snapshot for inspection.");
        await saveArtifacts(page, "UNKNOWN", pdf);
        log(`Page text began: ${text.replace(/\s+/g, " ").trim().slice(0, 300)}`);
        return false;
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  validateConfig();
  log(`Watching for: "${cfg.courseName}"`);
  log(`Seat ${cfg.seatNo} · every ${humanize(cfg.interval)}${ONCE ? " · --once (single pass)" : ""}`);

  let attempts = 0;
  for (;;) {
    attempts++;
    log(`── Attempt ${attempts} ──`);
    try {
      if (await attempt()) return;
    } catch (err) {
      // Config errors are fatal; anything else (timeout, 503, crash) is retryable.
      if (/fix (SEAT_NO|MOTHER_NAME)/.test(err.message)) throw err;
      log(`Attempt failed: ${err.message.split("\n")[0]}`);
    }

    if (ONCE) return log("--once given; stopping without a result.");
    if (cfg.maxAttempts > 0 && attempts >= cfg.maxAttempts) {
      return log(`Reached MAX_ATTEMPTS (${cfg.maxAttempts}); stopping.`);
    }
    log(`Next check in ${humanize(cfg.interval)}.`);
    await sleep(cfg.interval);
  }
}

main().catch((err) => {
  console.error(`\nFatal: ${err.message}\n`);
  process.exit(1);
});
