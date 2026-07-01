"use client";

import { useEffect, useState } from "react";

export type SessionStatus =
  | "UNLINKED"
  | "QR_PENDING"
  | "AUTHENTICATED"
  | "EXPIRED";

type StatusResponse = {
  status: SessionStatus;
  phoneNumber: string | null;
};

const META: Record<
  SessionStatus,
  { label: string; dot: string; text: string; ring: string }
> = {
  AUTHENTICATED: {
    label: "Connected",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    ring: "ring-emerald-400/30",
  },
  QR_PENDING: {
    label: "Scan QR",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-300",
    ring: "ring-amber-400/30",
  },
  EXPIRED: {
    label: "Expired",
    dot: "bg-red-400",
    text: "text-red-300",
    ring: "ring-red-400/30",
  },
  UNLINKED: {
    label: "Not linked",
    dot: "bg-slate-400",
    text: "text-slate-300",
    ring: "ring-slate-400/20",
  },
};

/** Polls the session status; shared by the sidebar footer and the topbar. */
export function useSessionStatus(intervalMs = 3500) {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/session/status", { cache: "no-store" });
        const json = await res.json();
        if (alive) setData(json);
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return data;
}

export function SessionBadge({ variant }: { variant: "sidebar" | "pill" }) {
  const data = useSessionStatus();
  const status = data?.status ?? "UNLINKED";
  const meta = META[status];

  if (variant === "pill") {
    return (
      <span
        className={`badge ring-1 ${meta.ring} bg-black/5 dark:bg-white/5 ${meta.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {status === "AUTHENTICATED" && data?.phoneNumber
          ? `+${data.phoneNumber}`
          : meta.label}
      </span>
    );
  }

  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: "var(--side-2)",
        borderColor: "var(--side-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${meta.dot} ring-4 ${meta.ring}`}
        />
        <span className={`text-xs font-semibold ${meta.text}`}>
          {meta.label}
        </span>
      </div>
      <p
        className="text-sm font-mono mt-1.5 truncate"
        style={{ color: "var(--side-text)" }}
      >
        {status === "AUTHENTICATED" && data?.phoneNumber
          ? `+${data.phoneNumber}`
          : "—"}
      </p>
    </div>
  );
}
