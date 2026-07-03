"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

type Result = { ok: boolean; message: string };

export default function SendPage() {
  return (
    <div className="space-y-5">
      <p className="text-sm muted -mt-1">
        One-off sends. Numbers must include the country code (e.g.{" "}
        <span className="font-mono">14155550123</span>).
      </p>
      <div className="grid lg:grid-cols-2 gap-5">
        <TextForm />
        <MediaForm />
      </div>
    </div>
  );
}

function TextForm() {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, message }),
      });
      const data = await res.json();
      setResult({ ok: res.ok, message: res.ok ? "Message sent." : data.message ?? "Failed." });
      if (res.ok) setMessage("");
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title="Text message" icon="send" onSubmit={submit}>
      <Field label="Number">
        <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="14155550123" required />
      </Field>
      <Field label="Message">
        <textarea className="input min-h-28 resize-y" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Your message…" required />
      </Field>
      <SubmitRow busy={busy} label="Send text" result={result} />
    </FormCard>
  );
}

function MediaForm() {
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/messages/send-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, message, attachmentUrl }),
      });
      const data = await res.json();
      setResult({ ok: res.ok, message: res.ok ? "Media sent." : data.message ?? "Failed." });
      if (res.ok) setMessage("");
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title="Message with attachment" icon="download" onSubmit={submit}>
      <Field label="Number">
        <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="14155550123" required />
      </Field>
      <Field label="Attachment URL">
        <input className="input" value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} placeholder="https://example.com/image.jpg" required />
      </Field>
      <Field label="Caption (optional)">
        <textarea className="input min-h-20 resize-y" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Optional caption…" />
      </Field>
      <SubmitRow busy={busy} label="Send media" result={result} />
    </FormCard>
  );
}

/* -------------------------------------------------------------- shared UI */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function FormCard({
  title,
  icon,
  onSubmit,
  children,
}: {
  title: string;
  icon: "send" | "download";
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-4">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </form>
  );
}

function SubmitRow({ busy, label, result }: { busy: boolean; label: string; result: Result | null }) {
  return (
    <div className="flex items-center gap-3 flex-wrap pt-1">
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? <><Icon name="spinner" className="w-4 h-4 animate-spin" /> Sending…</> : <><Icon name="send" className="w-4 h-4" /> {label}</>}
      </button>
      {result && (
        <span className={`text-sm flex items-center gap-1.5 ${result.ok ? "text-emerald-500" : "text-red-500"}`}>
          {result.ok && <Icon name="check" className="w-4 h-4" />}
          {result.message}
        </span>
      )}
    </div>
  );
}
