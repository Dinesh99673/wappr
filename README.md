# Wappr

**A self-hosted WhatsApp bulk messaging dashboard, powered by [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).**

Wappr is an open-source, single-codebase Next.js app that lets you log in with your
own WhatsApp account and send single or bulk messages (text and media) from a simple
dashboard. Clone it, run it, scan a QR code, and go. No external services required.

```bash
git clone https://github.com/Dinesh99673/wappr.git
cd wappr
npm install && npm run build && npm start   # or, with Docker: docker compose up -d --build
```

Then open <http://localhost:3000> and scan the QR code.

> ⚠️ Built on the **unofficial** whatsapp-web.js — not affiliated with or endorsed by
> WhatsApp / Meta. Use responsibly and at your own risk.

---

## Setup

Two ways to run Wappr — **pick one.** The **manual Node path** is first; **Docker** is
below and is the easy path if you'd rather not install Chromium's system libraries
yourself.

### Requirements

- Node.js 18+ (tested on Node 22)
- A system Chromium/Chrome that Puppeteer can use. `whatsapp-web.js` pulls in Puppeteer,
  which downloads a compatible Chromium on install. On a slim server you may also need
  common headless-Chromium libs (e.g. `libnss3`, `libatk-1.0-0`, `libgbm1`,
  `libasound2`, …). *(The Docker path handles all of these for you.)*

---

### Option A — Manual setup (Node)

#### 1. Clone and install

```bash
git clone https://github.com/Dinesh99673/wappr.git
cd wappr
npm install
```

#### 2. Configure environment

Copy the example and adjust as needed:

```bash
cp .env.example .env
```

`.env.example`:

```dotenv
# SQLite database location. Path is resolved relative to the prisma/ directory,
# so "../data/app.db" places the DB at the project root's data/ folder.
DATABASE_URL="file:../data/app.db"

# Bulk send pacing is configured per-job on the Bulk page: the minimum wait
# between sends is locked at 5s and you drag a slider to set the maximum (up to
# 60s). Each send then waits a random time in that window so sending stays paced.

# QR login timeout (milliseconds). If no scan happens in this window, the pending
# login is torn down and the session returns to UNLINKED.
QR_TIMEOUT_MS=90000
```

#### 3. Create the database

```bash
npx prisma migrate deploy
```

#### 4. Build and run

```bash
npm run build
npm start
```

Open <http://localhost:3000>, click **Login to WhatsApp**, and scan the QR code with
your phone (WhatsApp → Settings → Linked Devices → Link a Device).

For local development: `npm run dev`.

---

### Option B — Docker

The easy path — every Chromium library above is already baked into the image. Requires
only Docker + Docker Compose.

```bash
git clone https://github.com/Dinesh99673/wappr.git
cd wappr
docker compose up -d --build
```

Open <http://localhost:3000>, click **Login to WhatsApp**, and scan the QR code
(WhatsApp → Settings → Linked Devices → Link a Device).

- Three named volumes (`wappr_data`, `wappr_auth`, `wappr_cache`) persist your
  SQLite database, WhatsApp login session, and web cache across restarts and
  rebuilds — so you only scan the QR once.
- Migrations run automatically on every boot (`prisma migrate deploy`).
- To enable auth, uncomment `APP_PASSWORD` / `SESSION_SECRET` (and optionally
  `API_TOKEN`) in [`docker-compose.yml`](docker-compose.yml), then re-run the
  command above.
- Logs: `docker compose logs -f`. Stop: `docker compose down` (add `-v` only if
  you truly want to wipe the volumes and re-link).

---

## ⚠️ Read this first

### 1. Unofficial client

Wappr is built on **whatsapp-web.js**, an **unofficial, reverse-engineered** client —
**not** the official WhatsApp Business API, and **not affiliated with or endorsed by
WhatsApp / Meta**. Automating messages is against WhatsApp's Terms of Service, so use
Wappr responsibly, for legitimate consent-based messaging, and at your own risk.

### 2. This does **NOT** run on Vercel

Wappr needs a **persistent, always-on Node.js process** (to keep the Puppeteer-based
WhatsApp client alive) and a **persistent filesystem** (for the SQLite database and the
WhatsApp auth session). Vercel's serverless functions and ephemeral filesystem are
incompatible with **both** requirements.

**Deploy instead on:**

- **Railway**
- **Render** — with a **persistent disk** attached
- A **VPS** (DigitalOcean, Hetzner, EC2, …)
- **Docker** on any host

### 3. Authentication is optional and off by default

Out of the box Wappr has **no login or password protection** — anyone who can reach it
can send messages from your linked WhatsApp account. This is fine on `localhost`, but
**not** for any networked deployment.

**Turn on the built-in auth** by setting env vars (see `.env.example`):

| Var | Purpose |
| --- | --- |
| `APP_PASSWORD` | Enables auth and sets the dashboard login password. |
| `SESSION_SECRET` | Random 32+ byte secret that signs the login cookie. **Required** once `APP_PASSWORD` is set. |
| `API_TOKEN` | Optional bearer token for the REST API (`Authorization: Bearer <API_TOKEN>`). |

Once enabled, a single middleware guards **every** page and API route — a request must
carry a valid login session (browser) or a valid bearer token (scripts), or it is
redirected to `/login` / rejected with `401`.

> ⚠️ **This is only meaningful over HTTPS.** A password sent over plain HTTP can be
> intercepted. The built-in auth is **defense in depth**, not a substitute for putting
> the app behind HTTPS and keeping it off the open internet. For anything sensitive,
> still front it with a reverse proxy / VPN / firewall.

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## How it works

- **Single codebase** — Next.js (App Router) serves both the dashboard UI and the API.
- **Single WhatsApp session** — Wappr manages exactly one logged-in account. No
  multi-user, no API keys.
- **SQLite via Prisma** — job/recipient state persists to `./data/app.db`.
- **In-process bulk worker** — no Redis, no queue service. Recipients are sent strictly
  one at a time, with a randomized delay between each, and the session is re-checked
  before every send. If the session drops mid-job, the job **pauses** and can be
  **resumed** after you log back in.

---

## Using the dashboard

- **Dashboard (`/`)** — log in / out, see your linked number and session status.
- **Send (`/send`)** — one-off text message, or a message with an attachment URL.
- **Bulk (`/bulk`)** — upload a CSV and run one of three job types (below). Watch live
  progress, then download failed rows as a CSV.
- **Jobs (`/jobs`)** — history of every bulk job with per-recipient results.

### Bulk CSV formats

| Job type | Endpoint | CSV columns | Notes |
| --- | --- | --- | --- |
| **Bulk Text** | `/api/messages/bulk` | `number,message` | — |
| **Bulk Shared Attachment** | `/api/messages/bulk-media` | `number,message` | Plus one shared `attachmentUrl` form field applied to every recipient |
| **Bulk Custom Attachment** | `/api/messages/bulk-media-custom` | `number,message,attachmentUrl` | Per-row URL; rows missing it are marked FAILED (the rest still run) |

**File formats:** uploads can be **`.csv` (UTF-8, BOM-safe) or `.xlsx`**, up to **3 MB**.
The first row is the header; only rows with a real `number` value are used, so the
blank trailing rows Excel loves to add are ignored automatically.

**Numbers must include the country code** (e.g. `14155550123`, no `+` needed).
Attachments are always referenced **by URL** and fetched at send time — Wappr does not
store uploaded files.

---

## API contract notes

**Full interactive API reference lives in the dashboard at [`/docs`](http://localhost:3000/docs)** —
every endpoint with payload schemas, curl examples, and error codes.

Every messaging endpoint checks the session first. When there is no active session it
returns **HTTP 409** with this exact body, so any consumer can react programmatically:

```json
{
  "error": "SESSION_EXPIRED",
  "message": "WhatsApp session is not active. Please login again.",
  "action": { "method": "POST", "path": "/api/session/login" }
}
```

- Bulk endpoints return **HTTP 202** with `{ "jobId": "..." }` immediately and process
  in the background. Poll `GET /api/jobs/:id` for live progress.
- Bulk endpoints accept **both** `multipart/form-data` (CSV upload, dashboard flow) and
  **`application/json`** with a `recipients` array (API-consumer flow):

```bash
curl -X POST http://localhost:3000/api/messages/bulk \
  -H "Content-Type: application/json" \
  -d '{ "recipients": [ { "number": "14155550123", "message": "Hi" } ] }'
```

- `GET /api/jobs/:id/failed` downloads a job's failed recipients as CSV
  (`number,message,attachmentUrl,error`) — fix and re-submit directly.

---

## Deploying

For a full run, use the **Docker** path in [Setup → Option B](#option-b--docker) — the
repo ships a production [`Dockerfile`](Dockerfile) and
[`docker-compose.yml`](docker-compose.yml) with the Chromium libraries and persistent
volumes already configured.

Whatever host you choose:

- Set your `.env` variables (and enable auth — `APP_PASSWORD` + `SESSION_SECRET` — before
  exposing it to a network, behind HTTPS / a reverse proxy / VPN / firewall).
- Run `npx prisma migrate deploy` on deploy, then `npm run build && npm start`
  (the Docker image does this for you).
- On **Render**, attach a **persistent disk** and point `data/` and `.wwebjs_auth/` at
  it — the default ephemeral filesystem will lose your session on every deploy.

---

## Troubleshooting

### `Error: No LID for user` when sending

This is a **WhatsApp-side issue**, not a Wappr bug. WhatsApp is migrating to a new
internal identifier (**LID**) that replaces phone-number addressing. On the **first-ever
message to a number** (or a number that isn't actually on WhatsApp), WhatsApp Web can
fail to resolve a LID and `sendMessage` throws `No LID for user`. Meta changes this
behavior server-side frequently. (See whatsapp-web.js issues
[#3834](https://github.com/pedroslopez/whatsapp-web.js/issues/3834) /
[#5750](https://github.com/pedroslopez/whatsapp-web.js/issues/5750).)

Wappr mitigates this two ways:

1. **Number resolution** — before sending, Wappr calls `getNumberId` to confirm the
   number is registered and to use the exact id WhatsApp expects. Numbers not on
   WhatsApp now fail with a clear *"not registered on WhatsApp"* message instead of a
   cryptic crash.
2. **LID workaround** — on login, Wappr injects a community-confirmed patch that forces
   the LID to materialize (by briefly opening the chat) when the normal lookup fails.
   It targets WhatsApp Web internals, so it's best-effort; disable it with
   `LID_WORKAROUND=off` in your `.env`.

If you still hit it for a specific number: open a normal chat with that number once in
the official WhatsApp app (or the linked device), then retry — once a conversation
exists, the LID resolves and sends succeed.

## Project layout

```
app/                       # UI pages + API route handlers
  api/session/*            # login / status / logout
  api/messages/*           # send, send-media, bulk, bulk-media, bulk-media-custom
  api/jobs/*               # list, detail, resume
lib/
  whatsapp/                # SessionManager, guard, number normalizer
  jobs/                    # CSV parser, bulk job creation, sequential worker
  db/                      # Prisma client + singleton session seeding
prisma/schema.prisma       # Session, BulkJob, BulkJobRecipient
components/JobView.tsx      # shared live-progress + detail view
data/                      # SQLite db (gitignored, created at runtime)
.wwebjs_auth/              # WhatsApp session (gitignored, created at runtime)
```

## License

MIT — see [LICENSE](LICENSE). Clone it, deploy it, modify it; just keep the
copyright notice.
