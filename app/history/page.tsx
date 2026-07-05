"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/JobView";
import { Icon } from "@/components/icons";

type JobSummary = {
  id: string;
  type: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  createdAt: string;
};

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

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      const data = await res.json();
      if (active) setJobs(data.jobs);
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (jobs === null) {
    return (
      <div className="card p-8 text-center text-sm muted flex items-center justify-center gap-2">
        <Icon name="spinner" className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="card p-10 text-center">
        <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-[var(--surface-inset)] muted mb-3">
          <Icon name="list" className="w-7 h-7" />
        </span>
        <p className="font-medium">Nothing sent yet</p>
        <p className="text-sm muted mt-1 mb-4">Bulk sends you run will show up here.</p>
        <Link href="/bulk" className="btn btn-primary mx-auto w-fit">
          <Icon name="layers" className="w-4 h-4" /> Start a bulk send
        </Link>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide">Type</th>
              <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide">Progress</th>
              <th className="px-5 py-3 font-medium muted text-xs uppercase tracking-wide hidden sm:table-cell">Created</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const pct = j.total > 0 ? Math.round(((j.sent + j.failed) / j.total) * 100) : 0;
              return (
                <tr
                  key={j.id}
                  className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <td className="px-5 py-3 font-medium">{prettyType(j.type)}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={j.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: "var(--surface-inset)" }}>
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs muted whitespace-nowrap">
                        <span className="text-emerald-500">{j.sent}</span>/
                        <span className="text-red-500">{j.failed}</span>/{j.total}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 muted hidden sm:table-cell whitespace-nowrap">
                    {new Date(j.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/history/${j.id}`} className="text-[var(--accent)] font-medium hover:underline whitespace-nowrap">
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
