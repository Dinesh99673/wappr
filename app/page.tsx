"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

type SessionStatus = "UNLINKED" | "QR_PENDING" | "AUTHENTICATED" | "EXPIRED";

type StatusResponse = {
  status: SessionStatus;
  phoneNumber: string | null;
  updatedAt: string | null;
};

type JobSummary = {
  id: string;
  type: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
};

export default function DashboardHome() {
  const [session, setSession] = useState<StatusResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const statusRef = useRef<SessionStatus>("UNLINKED");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/session/status", { cache: "no-store" });
      const data: StatusResponse = await res.json();
      statusRef.current = data.status;
      setSession(data);
      if (data.status === "AUTHENTICATED") setQr(null);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchStatus();
    void fetchJobs();
    const id = setInterval(() => {
      if (statusRef.current !== "AUTHENTICATED") void fetchStatus();
      void fetchJobs();
    }, 3000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchJobs]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setQr(null);
    try {
      const res = await fetch("/api/session/login", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.message ?? "Login failed.");
      else if (data.qr) setQr(data.qr);
      await fetchStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetch("/api/session/logout", { method: "POST" });
      setQr(null);
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  const status = session?.status ?? "UNLINKED";

  const totals = jobs.reduce(
    (acc, j) => {
      acc.sent += j.sent;
      acc.failed += j.failed;
      if (j.status === "RUNNING" || j.status === "PAUSED") acc.active += 1;
      return acc;
    },
    { sent: 0, failed: 0, active: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="link"
          label="Session"
          value={statusHeadline(status)}
          tone={status === "AUTHENTICATED" ? "good" : status === "EXPIRED" ? "bad" : "neutral"}
        />
        <StatTile icon="send" label="Messages sent" value={totals.sent.toLocaleString()} tone="good" />
        <StatTile icon="warning" label="Failed" value={totals.failed.toLocaleString()} tone={totals.failed > 0 ? "bad" : "neutral"} />
        <StatTile icon="layers" label="Total jobs" value={jobs.length.toLocaleString()} tone="accent" sub={totals.active > 0 ? `${totals.active} active` : undefined} />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Session / QR card */}
        <div className="lg:col-span-3 card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon name="phone" className="w-[18px] h-[18px]" />
              </span>
              <div>
                <h2 className="font-semibold leading-tight">WhatsApp session</h2>
                <p className="text-xs muted">{statusHeadline(status)}</p>
              </div>
            </div>
            <StatusPill status={status} />
          </div>

          {status === "AUTHENTICATED" ? (
            <div className="space-y-5">
              <div className="card-inset p-5 flex items-center gap-4">
                <span className="grid place-items-center w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-500">
                  <Icon name="check" className="w-6 h-6" />
                </span>
                <div>
                  <p className="text-xs muted">Linked account</p>
                  <p className="text-lg font-semibold font-mono">
                    +{session?.phoneNumber ?? "unknown"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/send" className="btn btn-primary">
                  <Icon name="send" className="w-4 h-4" /> New message
                </Link>
                <Link href="/bulk" className="btn btn-ghost">
                  <Icon name="layers" className="w-4 h-4" /> Bulk send
                </Link>
                <button onClick={handleLogout} disabled={loading} className="btn btn-danger ml-auto">
                  <Icon name="logout" className="w-4 h-4" />
                  {loading ? "Working…" : "Logout"}
                </button>
              </div>
            </div>
          ) : qr ? (
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <div className="rounded-2xl bg-white p-3 shadow-lg shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="WhatsApp QR code" className="w-48 h-48" />
              </div>
              <div className="space-y-3">
                <p className="font-medium">Scan to link your phone</p>
                <ol className="text-sm muted space-y-1.5 list-decimal list-inside">
                  <li>Open WhatsApp on your phone</li>
                  <li>Go to Settings → Linked Devices</li>
                  <li>Tap “Link a Device” and scan this code</li>
                </ol>
                <div className="flex items-center gap-2 text-xs text-[var(--accent)] pt-1">
                  <Icon name="spinner" className="w-4 h-4 animate-spin" />
                  Waiting for scan — updates automatically
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              {status === "EXPIRED" && (
                <p className="text-sm text-amber-500">
                  Your previous session expired. Log in again to continue.
                </p>
              )}
              <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon name="link" className="w-8 h-8" />
              </span>
              <div>
                <p className="font-medium">No account linked</p>
                <p className="text-sm muted">Connect a WhatsApp account to start sending.</p>
              </div>
              <button onClick={handleLogin} disabled={loading} className="btn btn-primary mx-auto">
                {loading ? (
                  <>
                    <Icon name="spinner" className="w-4 h-4 animate-spin" /> Starting…
                  </>
                ) : (
                  <>
                    <Icon name="phone" className="w-4 h-4" /> Login to WhatsApp
                  </>
                )}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        </div>

        {/* Side column: recent jobs + safety */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm">Recent bulk sends</h2>
              <Link href="/history" className="text-xs text-[var(--accent)] hover:underline">
                View all →
              </Link>
            </div>
            {jobs.length === 0 ? (
              <p className="text-sm muted py-4 text-center">Nothing sent yet.</p>
            ) : (
              <ul className="space-y-2">
                {jobs.slice(0, 4).map((j) => (
                  <li key={j.id}>
                    <Link
                      href={`/history/${j.id}`}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2 -mx-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--surface-inset)] text-[var(--muted)]">
                        <Icon name="layers" className="w-4 h-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium truncate">
                          {prettyType(j.type)}
                        </span>
                        <span className="block text-xs muted">
                          {j.sent}/{j.total} sent
                        </span>
                      </span>
                      <JobStatusDot status={j.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5 border-amber-500/40">
            <div className="flex items-center gap-2 mb-2">
              <Icon name="warning" className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold text-sm">Stay under the radar</h2>
            </div>
            <ul className="text-xs muted space-y-1.5 list-disc list-inside">
              <li>Use a secondary / test number, not your primary line.</li>
              <li>Keep volumes low and delays generous.</li>
              <li>Only message contacts who expect to hear from you.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ small pieces */

function StatTile({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "accent" | "neutral";
}) {
  const toneColor =
    tone === "good"
      ? "text-emerald-500 bg-emerald-500/12"
      : tone === "bad"
        ? "text-red-500 bg-red-500/12"
        : tone === "accent"
          ? "text-[var(--accent)] bg-[var(--accent-soft)]"
          : "text-[var(--muted)] bg-[var(--surface-inset)]";
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <span className={`grid place-items-center w-9 h-9 rounded-xl ${toneColor}`}>
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
        {sub && <span className="text-[10px] font-semibold muted uppercase tracking-wide">{sub}</span>}
      </div>
      <p className="text-xl font-bold mt-3 leading-tight truncate">{value}</p>
      <p className="text-xs muted">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: SessionStatus }) {
  const map: Record<SessionStatus, string> = {
    AUTHENTICATED: "text-emerald-500 bg-emerald-500/12",
    QR_PENDING: "text-amber-500 bg-amber-500/12",
    EXPIRED: "text-red-500 bg-red-500/12",
    UNLINKED: "text-slate-500 bg-slate-500/12",
  };
  return <span className={`badge ${map[status]}`}>{status}</span>;
}

function JobStatusDot({ status }: { status: string }) {
  const color =
    status === "COMPLETED"
      ? "bg-emerald-500"
      : status === "RUNNING"
        ? "bg-blue-500 animate-pulse"
        : status === "PAUSED"
          ? "bg-amber-500"
          : "bg-red-500";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

function statusHeadline(status: SessionStatus): string {
  switch (status) {
    case "AUTHENTICATED":
      return "Connected";
    case "QR_PENDING":
      return "Awaiting scan";
    case "EXPIRED":
      return "Expired";
    default:
      return "Not linked";
  }
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
