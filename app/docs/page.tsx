"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

/* ------------------------------------------------------------------ types */

type Param = {
  name: string;
  type: string;
  required: boolean;
  desc: string;
};

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  title: string;
  desc: string;
  auth: boolean; // requires an AUTHENTICATED session (409 contract applies)
  contentTypes?: string[];
  params?: Param[];
  curl: string;
  response: string;
  responseNote?: string;
  errors?: { code: string; status: number; when: string }[];
};

type Group = { id: string; title: string; blurb: string; endpoints: Endpoint[] };

/* ------------------------------------------------------------- spec data */

const BASE = "http://localhost:3000";

const GROUPS: Group[] = [
  {
    id: "session",
    title: "Session",
    blurb:
      "Manage the single WhatsApp session. There is exactly one session — no API keys, no multi-user.",
    endpoints: [
      {
        method: "POST",
        path: "/api/session/login",
        title: "Start login",
        desc: "Starts a login. If unlinked, returns a QR code as a base64 data URL to scan with your phone. If already authenticated with a live client, this is a no-op that reports the linked state.",
        auth: false,
        curl: `curl -X POST ${BASE}/api/session/login`,
        response: `{
  "status": "QR_PENDING",
  "qr": "data:image/png;base64,iVBORw0KGgo..."
}`,
        responseNote:
          "When already linked, returns { \"status\": \"AUTHENTICATED\", \"phoneNumber\": \"9198xxxxxx\" } instead. Poll /api/session/status until it flips to AUTHENTICATED after the scan.",
      },
      {
        method: "GET",
        path: "/api/session/status",
        title: "Session status",
        desc: "Returns the current session state. Poll this while waiting for a QR scan, and before resuming paused jobs.",
        auth: false,
        curl: `curl ${BASE}/api/session/status`,
        response: `{
  "status": "AUTHENTICATED",
  "phoneNumber": "9198xxxxxx",
  "updatedAt": "2026-07-07T10:12:00.000Z"
}`,
        responseNote:
          "status is one of: UNLINKED | QR_PENDING | AUTHENTICATED | EXPIRED.",
      },
      {
        method: "POST",
        path: "/api/session/logout",
        title: "Logout",
        desc: "Tears down the client, deletes the on-disk auth session, and returns the session to UNLINKED.",
        auth: false,
        curl: `curl -X POST ${BASE}/api/session/logout`,
        response: `{ "status": "UNLINKED" }`,
      },
    ],
  },
  {
    id: "messages",
    title: "Single messages",
    blurb: "One-off sends. Both endpoints require an active session.",
    endpoints: [
      {
        method: "POST",
        path: "/api/messages/send",
        title: "Send a text message",
        desc: "Sends one text message. The number must be a full international number including country code — Wappr verifies it is registered on WhatsApp before sending.",
        auth: true,
        contentTypes: ["application/json"],
        params: [
          { name: "number", type: "string", required: true, desc: "Full international number, e.g. \"14155550123\" or \"+91 98xxx xxxxx\"." },
          { name: "message", type: "string", required: true, desc: "Message text to send." },
        ],
        curl: `curl -X POST ${BASE}/api/messages/send \\
  -H "Content-Type: application/json" \\
  -d '{ "number": "14155550123", "message": "Hello from Wappr" }'`,
        response: `{ "ok": true, "id": "true_14155550123@c.us_3EB0..." }`,
        errors: [
          { code: "INVALID_NUMBER", status: 400, when: "Number fails format validation." },
          { code: "NOT_REGISTERED", status: 400, when: "Number is not on WhatsApp." },
          { code: "SEND_FAILED", status: 500, when: "WhatsApp rejected the send." },
        ],
      },
      {
        method: "POST",
        path: "/api/messages/send-media",
        title: "Send media by URL",
        desc: "Fetches the file at attachmentUrl and sends it with an optional caption. The URL must be publicly reachable from the server.",
        auth: true,
        contentTypes: ["application/json"],
        params: [
          { name: "number", type: "string", required: true, desc: "Full international number including country code." },
          { name: "attachmentUrl", type: "string", required: true, desc: "Direct URL of the image / document / video to send." },
          { name: "message", type: "string", required: false, desc: "Optional caption." },
        ],
        curl: `curl -X POST ${BASE}/api/messages/send-media \\
  -H "Content-Type: application/json" \\
  -d '{ "number": "14155550123", "attachmentUrl": "https://example.com/flyer.jpg", "message": "Check this out" }'`,
        response: `{ "ok": true, "id": "true_14155550123@c.us_3EB0..." }`,
        errors: [
          { code: "MEDIA_FETCH_FAILED", status: 400, when: "attachmentUrl could not be fetched." },
          { code: "NOT_REGISTERED", status: 400, when: "Number is not on WhatsApp." },
          { code: "SEND_FAILED", status: 500, when: "WhatsApp rejected the send." },
        ],
      },
    ],
  },
  {
    id: "bulk",
    title: "Bulk jobs",
    blurb:
      "Every bulk endpoint accepts BOTH multipart/form-data (CSV or XLSX file upload, max 3 MB) and application/json (recipients array). Only rows with a real `number` value are used — blank/empty rows are ignored. They return 202 with a jobId immediately — poll /api/jobs/:id for progress. Recipients are sent strictly one at a time with a randomized delay.",
    endpoints: [
      {
        method: "POST",
        path: "/api/messages/bulk",
        title: "Bulk text",
        desc: "Queues a text message per recipient.",
        auth: true,
        contentTypes: ["multipart/form-data (CSV columns: number,message)", "application/json"],
        params: [
          { name: "recipients", type: "array", required: true, desc: "JSON mode: array of { number, message }." },
          { name: "file", type: "file (CSV/XLSX)", required: true, desc: "Multipart mode: CSV or XLSX with header row number,message." },
        ],
        curl: `# JSON
curl -X POST ${BASE}/api/messages/bulk \\
  -H "Content-Type: application/json" \\
  -d '{ "recipients": [
        { "number": "14155550123", "message": "Hi Alice" },
        { "number": "919812345678", "message": "Hi Bob" }
      ] }'

# CSV upload
curl -X POST ${BASE}/api/messages/bulk -F "file=@contacts.csv"`,
        response: `{ "jobId": "cmcx0a1b20000abcdef" }`,
        responseNote: "Returned with HTTP 202. The job runs in the background.",
      },
      {
        method: "POST",
        path: "/api/messages/bulk-media",
        title: "Bulk shared attachment",
        desc: "One shared attachmentUrl is sent to every recipient, with each row's message as the caption.",
        auth: true,
        contentTypes: ["multipart/form-data (CSV: number,message + attachmentUrl field)", "application/json"],
        params: [
          { name: "attachmentUrl", type: "string", required: true, desc: "Shared media URL applied to every recipient (top-level in JSON, form field in multipart)." },
          { name: "recipients", type: "array", required: true, desc: "JSON mode: array of { number, message }." },
          { name: "file", type: "file (CSV/XLSX)", required: true, desc: "Multipart mode: CSV or XLSX with header row number,message." },
        ],
        curl: `# JSON
curl -X POST ${BASE}/api/messages/bulk-media \\
  -H "Content-Type: application/json" \\
  -d '{ "attachmentUrl": "https://example.com/flyer.jpg",
        "recipients": [
          { "number": "14155550123", "message": "New offer!" }
        ] }'

# CSV upload
curl -X POST ${BASE}/api/messages/bulk-media \\
  -F "file=@contacts.csv" \\
  -F "attachmentUrl=https://example.com/flyer.jpg"`,
        response: `{ "jobId": "cmcx0a1b20000abcdef" }`,
      },
      {
        method: "POST",
        path: "/api/messages/bulk-media-custom",
        title: "Bulk custom attachment per row",
        desc: "Each recipient gets their own attachmentUrl. Rows missing attachmentUrl are marked FAILED immediately; the rest of the job still runs.",
        auth: true,
        contentTypes: ["multipart/form-data (CSV: number,message,attachmentUrl)", "application/json"],
        params: [
          { name: "recipients", type: "array", required: true, desc: "JSON mode: array of { number, message, attachmentUrl }." },
          { name: "file", type: "file (CSV/XLSX)", required: true, desc: "Multipart mode: CSV or XLSX with header row number,message,attachmentUrl." },
        ],
        curl: `# JSON
curl -X POST ${BASE}/api/messages/bulk-media-custom \\
  -H "Content-Type: application/json" \\
  -d '{ "recipients": [
        { "number": "14155550123", "message": "Your invoice", "attachmentUrl": "https://example.com/inv-1.pdf" },
        { "number": "919812345678", "message": "Your invoice", "attachmentUrl": "https://example.com/inv-2.pdf" }
      ] }'

# CSV upload
curl -X POST ${BASE}/api/messages/bulk-media-custom -F "file=@contacts.csv"`,
        response: `{ "jobId": "cmcx0a1b20000abcdef" }`,
      },
    ],
  },
  {
    id: "jobs",
    title: "Jobs",
    blurb: "Inspect, poll, resume, and export bulk jobs.",
    endpoints: [
      {
        method: "GET",
        path: "/api/jobs",
        title: "List jobs",
        desc: "All bulk jobs, most recent first.",
        auth: false,
        curl: `curl ${BASE}/api/jobs`,
        response: `{
  "jobs": [
    {
      "id": "cmcx0a1b20000abcdef",
      "type": "BULK_TEXT",
      "status": "RUNNING",
      "total": 120,
      "sent": 37,
      "failed": 2,
      "createdAt": "2026-07-07T10:00:00.000Z"
    }
  ]
}`,
        responseNote:
          "type: BULK_TEXT | BULK_MEDIA | BULK_MEDIA_CUSTOM. status: RUNNING | COMPLETED | FAILED | PAUSED.",
      },
      {
        method: "GET",
        path: "/api/jobs/:id",
        title: "Job detail",
        desc: "Full job including every recipient row. Poll this every 2–3 seconds while status is RUNNING.",
        auth: false,
        curl: `curl ${BASE}/api/jobs/cmcx0a1b20000abcdef`,
        response: `{
  "job": {
    "id": "cmcx0a1b20000abcdef",
    "type": "BULK_TEXT",
    "status": "COMPLETED",
    "total": 2, "sent": 1, "failed": 1,
    "recipients": [
      { "id": "...", "number": "14155550123", "message": "Hi", "attachmentUrl": null, "status": "SENT", "error": null },
      { "id": "...", "number": "123", "message": "Hi", "attachmentUrl": null, "status": "FAILED", "error": "Invalid number" }
    ]
  }
}`,
        errors: [{ code: "NOT_FOUND", status: 404, when: "Unknown job id." }],
      },
      {
        method: "POST",
        path: "/api/jobs/:id/resume",
        title: "Resume a paused job",
        desc: "Re-enters the send loop for recipients still PENDING. Only valid when the job is PAUSED and the session is AUTHENTICATED again.",
        auth: true,
        curl: `curl -X POST ${BASE}/api/jobs/cmcx0a1b20000abcdef/resume`,
        response: `{ "ok": true, "status": "RUNNING" }`,
        errors: [
          { code: "NOT_FOUND", status: 404, when: "Unknown job id." },
          { code: "INVALID_STATE", status: 409, when: "Job is not PAUSED." },
        ],
      },
      {
        method: "GET",
        path: "/api/jobs/:id/failed",
        title: "Export failed rows (CSV)",
        desc: "Downloads the job's FAILED recipients as a CSV (number,message,attachmentUrl,error). Columns match the bulk upload formats, so you can fix and re-submit the file directly.",
        auth: false,
        curl: `curl -OJ ${BASE}/api/jobs/cmcx0a1b20000abcdef/failed`,
        response: `number,message,attachmentUrl,error
"123","Hi","","Invalid number"`,
        responseNote: "Returned as text/csv with a Content-Disposition attachment header.",
        errors: [{ code: "NOT_FOUND", status: 404, when: "Unknown job id." }],
      },
    ],
  },
];

/* ---------------------------------------------------------------- page */

export default function DocsPage() {
  return (
    <div className="space-y-8">
      {/* Intro */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Icon name="code" className="w-[18px] h-[18px]" />
          </span>
          <div>
            <h2 className="font-semibold leading-tight">REST API</h2>
            <p className="text-xs muted">
              Everything the dashboard does is available over plain HTTP.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="card-inset p-4">
            <p className="text-xs muted mb-1">Base URL</p>
            <code className="font-mono text-[var(--accent)]">{BASE}</code>
            <p className="text-xs muted mt-1.5">
              Replace with wherever you deployed Wappr.
            </p>
          </div>
          <div className="card-inset p-4">
            <p className="text-xs muted mb-1">Authentication</p>
            <p>
              None. The API is as open as the dashboard — put Wappr behind your
              own access control before exposing it beyond localhost.
            </p>
          </div>
        </div>

        {/* Error contract */}
        <div className="card-inset p-4">
          <p className="text-sm font-medium mb-1.5">
            Session error contract{" "}
            <span className="badge text-amber-500 bg-amber-500/12 ml-1">409</span>
          </p>
          <p className="text-xs muted mb-2">
            Endpoints marked <SessionChip /> below require an active WhatsApp
            session. When there isn&apos;t one, they all return this exact body:
          </p>
          <CodeBlock
            code={`{
  "error": "SESSION_EXPIRED",
  "message": "WhatsApp session is not active. Please login again.",
  "action": { "method": "POST", "path": "/api/session/login" }
}`}
          />
        </div>

        {/* TOC */}
        <div className="flex flex-wrap gap-2 pt-1">
          {GROUPS.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="badge bg-[var(--surface-inset)] text-[var(--muted)] hover:text-[var(--accent)] transition-colors !normal-case !font-semibold"
            >
              {g.title}
            </a>
          ))}
        </div>
      </div>

      {/* Groups */}
      {GROUPS.map((group) => (
        <section key={group.id} id={group.id} className="space-y-4 scroll-mt-6">
          <div>
            <h2 className="text-lg font-bold">{group.title}</h2>
            <p className="text-sm muted mt-0.5 max-w-3xl">{group.blurb}</p>
          </div>
          {group.endpoints.map((ep) => (
            <EndpointCard key={ep.method + ep.path} ep={ep} />
          ))}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ components */

function SessionChip() {
  return (
    <span className="badge text-emerald-500 bg-emerald-500/12 !normal-case">
      session required
    </span>
  );
}

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={`badge font-mono ${
        method === "GET"
          ? "text-blue-500 bg-blue-500/12"
          : "text-emerald-500 bg-emerald-500/12"
      }`}
    >
      {method}
    </span>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  return (
    <div className="card p-5 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <MethodBadge method={ep.method} />
        <code className="font-mono text-sm font-semibold break-all">{ep.path}</code>
        {ep.auth && <SessionChip />}
      </div>
      <div>
        <p className="font-medium text-sm">{ep.title}</p>
        <p className="text-sm muted mt-0.5 max-w-3xl">{ep.desc}</p>
      </div>

      {ep.contentTypes && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs muted">Accepts:</span>
          {ep.contentTypes.map((ct) => (
            <code
              key={ct}
              className="text-[11px] font-mono px-2 py-0.5 rounded-md"
              style={{ background: "var(--surface-inset)" }}
            >
              {ct}
            </code>
          ))}
        </div>
      )}

      {/* Params */}
      {ep.params && ep.params.length > 0 && (
        <div className="card-inset overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="px-4 py-2 text-xs font-medium muted uppercase tracking-wide">Field</th>
                  <th className="px-4 py-2 text-xs font-medium muted uppercase tracking-wide">Type</th>
                  <th className="px-4 py-2 text-xs font-medium muted uppercase tracking-wide">Required</th>
                  <th className="px-4 py-2 text-xs font-medium muted uppercase tracking-wide">Description</th>
                </tr>
              </thead>
              <tbody>
                {ep.params.map((p) => (
                  <tr key={p.name} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-4 py-2 font-mono text-[13px] whitespace-nowrap">{p.name}</td>
                    <td className="px-4 py-2 muted whitespace-nowrap">{p.type}</td>
                    <td className="px-4 py-2">
                      {p.required ? (
                        <span className="text-amber-500 text-xs font-semibold">required</span>
                      ) : (
                        <span className="muted text-xs">optional</span>
                      )}
                    </td>
                    <td className="px-4 py-2 muted">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Example request / response */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold muted uppercase tracking-wide mb-1.5">Example request</p>
          <CodeBlock code={ep.curl} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold muted uppercase tracking-wide mb-1.5">Example response</p>
          <CodeBlock code={ep.response} />
          {ep.responseNote && (
            <p className="text-xs muted mt-1.5">{ep.responseNote}</p>
          )}
        </div>
      </div>

      {/* Errors */}
      {ep.errors && ep.errors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ep.errors.map((e) => (
            <span
              key={e.code}
              className="text-[11px] rounded-lg px-2.5 py-1.5"
              style={{ background: "var(--surface-inset)" }}
              title={e.when}
            >
              <span className="font-mono font-semibold text-red-500">{e.status}</span>{" "}
              <span className="font-mono">{e.code}</span>
              <span className="muted"> — {e.when}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden group"
      style={{ background: "var(--side)", border: "1px solid var(--side-border)" }}
    >
      <button
        type="button"
        onClick={copy}
        aria-label="Copy to clipboard"
        className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        style={{ background: "rgba(255,255,255,0.08)", color: copied ? "#34d399" : "#94a3b8" }}
      >
        <Icon name={copied ? "check" : "copy"} className="w-3.5 h-3.5" />
      </button>
      <pre className="p-4 pr-10 overflow-x-auto text-[12.5px] leading-relaxed font-mono" style={{ color: "#c4cfe0" }}>
        {code}
      </pre>
    </div>
  );
}
