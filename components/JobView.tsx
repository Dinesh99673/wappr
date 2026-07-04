"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type Recipient = {
  id: string;
  number: string;
  message: string | null;
  attachmentUrl: string | null;
  status: "PENDING" | "SENT" | "FAILED";
  error: string | null;
};

type Job = {
  id: string;
  type: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
  recipients: Recipient[];
};

type SessionStatus = "UNLINKED" | "QR_PENDING" | "AUTHENTICATED" | "EXPIRED";

export default function JobView({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [resuming, setResuming] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const jobStatusRef = useRef<Job["status"] | null>(null);

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    const data = await res.json();
    jobStatusRef.current = data.job?.status ?? null;
    setJob(data.job);
    return data.job as Job;
  }, [jobId]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/session/status", { cache: "no-store" });
      const data = await res.json();
      setSessionStatus(data.status);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Async fetches — setState runs after an await, not synchronously on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchJob();
    void fetchSession();
    const id = setInterval(() => {
      const s = jobStatusRef.current;
      if (s === null || s === "RUNNING" || s === "PAUSED") {
        void fetchJob();
        void fetchSession();
      }
    }, 2500);
    return () => clearInterval(id);
  }, [fetchJob, fetchSession]);

  const handleResume = async () => {
    setResuming(true);
    try {
      await fetch(`/api/jobs/${jobId}/resume`, { method: "POST" });
      await fetchJob();
    } finally {
      setResuming(false);
    }
  };

  const downloadFailed = () => {
    // Server-side export — same endpoint external API consumers use.
    window.location.href = `/api/jobs/${jobId}/failed`;
  };

  if (notFound) {
    return (
      <div className="card p-8 text-center">
        <Icon name="warning" className="w-8 h-8 mx-auto text-amber-500 mb-2" />
        <p className="text-sm muted">Job not found.</p>
      </div>
    );
  }
  if (!job) {
    return (
      <div className="card p-8 text-center text-sm muted flex items-center justify-center gap-2">
        <Icon name="spinner" className="w-4 h-4 animate-spin" /> Loading job…
      </div>
    );
  }

  const done = job.sent + job.failed;
  const pct = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
  const finished = job.status === "COMPLETED" || job.status === "PAUSED";
  const hasFailed = job.recipients.some((r) => r.status === "FAILED");

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="card p-6 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Icon name="layers" className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{prettyType(job.type)}</span>
                <StatusBadge status={job.status} />
              </div>
              <p className="text-[11px] muted font-mono mt-0.5">{job.id}</p>
            </div>
          </div>
          {finished && hasFailed && (
            <button onClick={downloadFailed} className="btn btn-ghost">
              <Icon name="download" className="w-4 h-4" /> Failed rows CSV
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div
            className="h-2.5 w-full rounded-full overflow-hidden"
            style={{ background: "var(--surface-inset)" }}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="muted">{pct}% processed</span>
            <span className="flex gap-3">
              <span className="text-emerald-500 font-semibold">{job.sent} sent</span>
              <span className="text-red-500 font-semibold">{job.failed} failed</span>
              <span className="muted">{job.total} total</span>
            </span>
          </div>
        </div>

        {job.status === "PAUSED" && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <Icon name="warning" className="w-5 h-5 text-amber-500 shrink-0" />
            <p className="text-sm flex-1">
              Session expired mid-job. Log in again, then resume — remaining recipients are still queued.
            </p>
            <button
              onClick={handleResume}
              disabled={resuming || sessionStatus !== "AUTHENTICATED"}
              className="btn btn-primary shrink-0"
            >
              {resuming ? "Resuming…" : sessionStatus === "AUTHENTICATED" ? "Resume" : "Login to resume"}
            </button>
          </div>
        )}
      </div>

      {/* Recipients */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide">Number</th>
                <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide">Detail</th>
              </tr>
            </thead>
            <tbody>
              {job.recipients.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-5 py-2.5 font-mono">{r.number}</td>
                  <td className="px-5 py-2.5">
                    <RecipientStatus status={r.status} />
                  </td>
                  <td className="px-5 py-2.5 muted max-w-xs truncate">
                    {r.status === "FAILED" ? r.error ?? "—" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function prettyType(type: string): string {
  switch (type) {
    case "BULK_TEXT":
      return "Bulk text";
    case "BULK_MEDIA":
      return "Bulk shared attachment";
    case "BULK_MEDIA_CUSTOM":
      return "Bulk custom attachment";
    default:
      return type;
  }
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    RUNNING: "text-blue-500 bg-blue-500/12",
    COMPLETED: "text-emerald-500 bg-emerald-500/12",
    PAUSED: "text-amber-500 bg-amber-500/12",
    FAILED: "text-red-500 bg-red-500/12",
  };
  return <span className={`badge ${map[status] ?? "bg-slate-500/12 text-slate-500"}`}>{status}</span>;
}

function RecipientStatus({ status }: { status: string }) {
  if (status === "SENT")
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-500 font-medium">
        <Icon name="check" className="w-3.5 h-3.5" /> Sent
      </span>
    );
  if (status === "FAILED")
    return (
      <span className="inline-flex items-center gap-1.5 text-red-500 font-medium">
        <Icon name="close" className="w-3.5 h-3.5" /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" /> Pending
    </span>
  );
}
