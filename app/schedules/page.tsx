"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { describeCadence } from "@/lib/jobs/schedule";

type Schedule = {
  id: string;
  name: string;
  type: string;
  status: string;
  mode: string;
  intervalKind: string | null;
  intervalN: number | null;
  atTime: string | null;
  weekday: number | null;
  nextRunAt: string;
  lastRunAt: string | null;
  runCount: number;
  maxRuns: number | null;
  _count: { jobs: number };
  jobs: { id: string; status: string; createdAt: string }[];
};

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules", { cache: "no-store" });
      const data = await res.json();
      setSchedules(data.schedules ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (id: string, action: "pause" | "resume") => {
    setBusyId(id);
    try {
      await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this schedule? Past runs stay in history.")) return;
    setBusyId(id);
    try {
      await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loaded && schedules.length === 0) {
    return (
      <div className="card p-10 text-center space-y-3">
        <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon name="clock" className="w-7 h-7" />
        </span>
        <p className="font-medium">No schedules yet</p>
        <p className="text-sm muted">
          Set one up from the Bulk page — choose “Schedule once” or “Repeat” instead of
          “Send now”.
        </p>
        <Link href="/bulk" className="btn btn-primary mx-auto mt-1">
          <Icon name="layers" className="w-4 h-4" /> Go to Bulk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schedules.map((s) => {
        const next = new Date(s.nextRunAt);
        const lastJob = s.jobs[0];
        return (
          <div key={s.id} className="card p-5">
            <div className="flex items-start gap-3 flex-wrap">
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Icon name="clock" className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold truncate">{s.name}</span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-sm muted mt-0.5">
                  {prettyType(s.type)} · {describeCadence(s)}
                </p>
                <p className="text-xs muted mt-1">
                  {s.status === "ACTIVE" ? (
                    <>Next run {next.toLocaleString()}</>
                  ) : s.status === "COMPLETED" ? (
                    <>Finished · {s.runCount} run{s.runCount === 1 ? "" : "s"}</>
                  ) : (
                    <>Paused · next was {next.toLocaleString()}</>
                  )}
                  {"  ·  "}
                  {s.runCount} run{s.runCount === 1 ? "" : "s"}
                  {s.maxRuns ? ` / ${s.maxRuns}` : ""}
                  {lastJob ? (
                    <>
                      {"  ·  "}
                      <Link
                        href={`/history/${lastJob.id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        latest run →
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {s.status === "ACTIVE" && (
                  <button
                    onClick={() => act(s.id, "pause")}
                    disabled={busyId === s.id}
                    className="btn btn-ghost !px-2.5"
                    aria-label="Pause"
                    title="Pause"
                  >
                    <Icon name="pause" className="w-4 h-4" />
                  </button>
                )}
                {s.status === "PAUSED" && (
                  <button
                    onClick={() => act(s.id, "resume")}
                    disabled={busyId === s.id}
                    className="btn btn-ghost !px-2.5"
                    aria-label="Resume"
                    title="Resume"
                  >
                    <Icon name="play" className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => remove(s.id)}
                  disabled={busyId === s.id}
                  className="btn btn-danger !px-2.5"
                  aria-label="Delete"
                  title="Delete"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "text-emerald-500 bg-emerald-500/12",
    PAUSED: "text-amber-500 bg-amber-500/12",
    COMPLETED: "text-slate-500 bg-slate-500/12",
    CANCELLED: "text-red-500 bg-red-500/12",
  };
  return <span className={`badge ${map[status] ?? map.COMPLETED}`}>{status}</span>;
}

function prettyType(type: string): string {
  switch (type) {
    case "BULK_TEXT":
      return "Bulk text";
    case "BULK_MEDIA":
      return "Shared attachment";
    case "BULK_MEDIA_CUSTOM":
      return "Custom attachment";
    default:
      return type;
  }
}
