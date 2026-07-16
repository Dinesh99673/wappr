# sppu-watch

Polls the [SPPU online results portal](https://onlineresults.unipune.ac.in/SPPU) for
**one seat number** and sends you a WhatsApp message — through the Wappr instance in
this repo — the moment your result is published.

It is a standalone script with its own `package.json`. It talks to Wappr only over the
public REST API, so it adds nothing to the main app's dependencies.

## Prerequisites

- **Node.js 18+** (needs the built-in `fetch`).
- **A running, logged-in Wappr** — only if you want the WhatsApp message. Start it from
  the repo root (`npm run dev`) and scan the QR code first. Without it the script still
  runs and still saves your result to `artifacts/`; it just can't send anything.
- **An Anthropic API key** from [console.anthropic.com](https://console.anthropic.com/settings/keys).
  Required — the portal's captcha is an image that has to be read (see
  [The captcha](#the-captcha)). Expect a handful of cheap calls per attempt.
- **A browser.** `BROWSER_CHANNEL=chrome` uses the Chrome you already have. Leave it
  blank and run `npx playwright install chromium` instead (~150 MB download).

## Setup

```bash
cd scripts/sppu-watch
npm install
cp .env.example .env
```

Then open `.env` and fill in, at minimum:

- `SEAT_NO` and `MOTHER_NAME` — your own credentials for the result form.
- `ANTHROPIC_API_KEY` — your key.
- `COURSE_NAME` — must match the dashboard's Course Name column. The default is
  `B.E.(2019 PAT.) SUMMER SESSION 2026`; change it for any other course. Matching
  ignores case and collapses whitespace, but the text must otherwise be exact, so
  copy it from the portal's table rather than typing it from memory.
- `NOTIFY_NUMBER` — full international number, no `+` (e.g. `919876543210`). Leave it
  blank to save artifacts and send nothing.

`.env` is gitignored. **Never put the real key in `.env.example`** — that file *is*
committed.

## Running

```bash
npm run once     # one pass; use this first to confirm the setup works
npm run watch    # poll every CHECK_INTERVAL until the result appears, then stop
```

`npm run once` is the one to start with. It does a single attempt and exits, so you
find out immediately whether your seat number, mother's name and Wappr connection are
right — rather than discovering it wrong hours into a long poll.

With `HEADLESS=false` (the default) a browser window opens and you can watch it work.
Leave it running; `npm run watch` exits on its own once the result is captured and sent.

## Configuration

Everything lives in `.env`.

| Var | Default | Notes |
| --- | --- | --- |
| `SEAT_NO` | — | **Required.** Your seat number. |
| `MOTHER_NAME` | — | **Required.** As registered with the university. |
| `ANTHROPIC_API_KEY` | — | **Required.** Reads the captcha image. |
| `COURSE_NAME` | `B.E.(2019 PAT.) SUMMER SESSION 2026` | Matched against the dashboard's Course Name column, case- and whitespace-insensitive. |
| `NOTIFY_NUMBER` | blank | Full international number, no `+`. Blank = save artifacts, send nothing. |
| `WAPPR_BASE_URL` | `http://localhost:3000` | Wappr must be running and logged in. |
| `WAPPR_API_TOKEN` | blank | Only if you set `API_TOKEN` in Wappr's `.env`. |
| `ATTACH_HOST` | `127.0.0.1` | How Wappr reaches this script to pull the attachment. Use `host.docker.internal` if Wappr is in Docker. |
| `CHECK_INTERVAL` | `10m` | Accepts `30s` / `10m` / `1h`. Please don't go below ~5m — see [A note on load](#a-note-on-load). |
| `MAX_ATTEMPTS` | `0` | Give up after this many attempts. `0` = never give up. |
| `CAPTCHA_ATTEMPTS` | `4` | Captcha reads per attempt before giving up and waiting for the next cycle. |
| `BROWSER_CHANNEL` | `chrome` | `chrome` / `msedge` use your installed browser. Blank uses Playwright's Chromium. |
| `HEADLESS` | `false` | `false` so you can watch it work. |

## What you get

On success, a timestamped folder under `artifacts/` containing `result.pdf` (the
university's own marksheet, captured byte-for-byte off the wire) and `result.png` (that
PDF rendered to an image). The WhatsApp message carries the **PNG**, so it shows inline
in the chat instead of being a document to tap. Then the script stops.

`artifacts/` is gitignored — captured results contain personal data.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Missing required config: …` | `.env` is absent or a required var is blank. |
| `Portal says the seat number is invalid` | Fix `SEAT_NO`. This is fatal — the script stops rather than poll a wrong number for days. |
| `Portal says the mother's name does not match` | Fix `MOTHER_NAME`. Also fatal. |
| `Course "…" is not on the dashboard yet` | Normal before results drop. It keeps polling. If it persists after publication, your `COURSE_NAME` doesn't match the portal's text. |
| `WhatsApp notification FAILED` | Wappr isn't running at `WAPPR_BASE_URL`, isn't logged in, or `WAPPR_API_TOKEN` is wrong. The result is still saved to `artifacts/`. |
| `Media send failed … falling back to text-only` | Wappr couldn't fetch the attachment — usually `ATTACH_HOST` is wrong for your setup (Docker vs. local). |
| An `artifacts/<timestamp>_UNKNOWN/` folder appears | The portal returned something unrecognised. See [Result classification](#result-classification). |
| Lots of `503` / `Portal gateway error` | Expected on result day. Every step retries in place. |

## How it works

The portal is unusual enough that the details matter. All of this was verified against
the live site:

- **The dashboard row order and count change between loads.** Observed the target
  course at row 7, then 9, then 19, with the row count going 412 → 424 as results
  published. So every row is read and compared by name; the index is never trusted,
  and the "Go for Result" button is scoped to the matched row (1 of 400+ on the page).
- **"Go for Result" does not navigate.** It calls `Enterdetails()`, which jQuery
  `.load()`s a form into `#divShowDocument` and shows it as a Bootstrap modal.
- **Images, fonts and CSS are blocked while reading the dashboard.** The page needs
  ~200s to settle with them and ~120s without. Scripts and XHR stay, because the
  button goes through jQuery. Styling is restored before the result is captured, so
  the screenshot and PDF look right.
- **The seat number and mother's name are filled last**, immediately before submit.
  The dashboard's scripts are still running while we work and will wipe fields typed
  earlier — that produced a "Please enter Seat No" alert on a filled form. The values
  are read back and re-filled if they didn't stick.
- **The submit click is dispatched directly if intercepted**, because the modal
  backdrop sits over the button and Playwright's actionability check never clears.
- **The portal 503s constantly** on result day (roughly half of all requests, plus
  504s). Every step — dashboard load, modal open, captcha fetch — retries in place
  rather than burning a whole `CHECK_INTERVAL`, and each attempt runs in a fresh
  browser so a crash can't wedge a multi-day run.

### The captcha

The form's hidden `#hdOrgCaptchaText` looks like it holds the answer, but it doesn't —
it's an encrypted token (e.g. `6cMwS3bCvhOWiHgEdSgmAA==`, 24 chars) that only the
server can compare against. The form requires exactly 5 characters, so the image has
to actually be read.

So: the captcha image is an inline data URI in the DOM, it's sent to Claude to
transcribe, and — this is the useful part — the guess is checked against the portal's
own validator (`/Result/Dashboard/VALCHCT`, the same call the page makes on keyup)
*before* spending a submit on it. A misread just refreshes the captcha and retries,
up to `CAPTCHA_ATTEMPTS` times.

If the validator is unreachable (it 503s too), the guess is submitted anyway rather
than thrown away; a wrong one costs one retry. If an *interactive* captcha ever
appears (reCAPTCHA, hCaptcha, Turnstile), the script does not attempt it — it prints
a message, waits for you to solve it in the visible browser, and resumes. That is why
`HEADLESS` defaults to `false`.

### A note on load

This hits a public university server that is already struggling on result day. The
default 10-minute interval is deliberate; tightening it mainly produces more 503s.
It looks up one seat number — yours — and does not enumerate others. Please keep it
that way.

## Result classification

**A declared result is returned as a PDF, not a web page.** The POST to
`/SPPU ONLINE RESULT DISPLAY` responds with `application/pdf`, and Chrome hands it
to its built-in viewer — which leaves an empty DOM (`<body></body>` plus
`pdf_embedder.css`) and plugin content that cannot be screenshotted.
`page.screenshot()` on a declared result returns a **blank grey rectangle**, so
"just screenshot the result" is not an option here, ever.

Two consequences worth knowing:

- The bytes are read from the HTTP response, via a `page.route()` interception that
  fetches the request itself. Reading it any later is too late: once Chrome gives the
  response to the PDF plugin, `response.body()` returns the *viewer's* shell HTML
  (~536 bytes starting `<!doctype html>`), not the document. That shell is a
  convincing fake — it arrives with `content-type: application/pdf` and would sail
  through a naive check straight onto your phone as a broken file. Hence `isPdf()`
  checks the actual `%PDF-` magic bytes before anything is saved or sent.
- The image you get on WhatsApp is that PDF **rasterised** (`pdf-to-png-converter`),
  not a screenshot. If rendering ever fails, the PDF itself is sent instead so the
  result still reaches you.

That gives a clean discriminator:

- **response is a PDF** → result available. Saved and sent.
- **response is HTML** → an outcome to read: not yet declared, invalid seat number,
  wrong mother's name, captcha failed, or (very often) a 503.

The HTML wordings are still **inferred** — the portal has never returned anything but
PDFs and 503s here. Unrecognised responses are classified `UNKNOWN`, snapshotted to
`artifacts/<timestamp>_UNKNOWN/`, and polling continues. If you get an `UNKNOWN`
folder, the wording in it is what `PATTERNS` in `watch.mjs` needs to match.

Note `SERVER_ERROR` deliberately does not match a bare `503`: subject codes on a real
marksheet look like that, and a false match there would silently poll past a declared
result forever.
