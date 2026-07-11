"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import JobView from "@/components/JobView";
import { Icon, type IconName } from "@/components/icons";
import { CsvDropzone } from "@/components/CsvDropzone";
import { WEEKDAY_NAMES, MIN_RECURRING_INTERVAL_MIN } from "@/lib/jobs/schedule";

type JobType = "BULK_TEXT" | "BULK_MEDIA" | "BULK_MEDIA_CUSTOM";
type When = "now" | "once" | "recurring";
type IntervalKind = "MINUTE" | "HOUR" | "DAY" | "WEEK";
type EndMode = "never" | "date" | "count";

const JOB_TYPES: {
  value: JobType;
  label: string;
  short: string;
  icon: IconName;
  endpoint: string;
  columns: string;
  needsSharedUrl: boolean;
}[] = [
  {
    value: "BULK_TEXT",
    label: "Bulk Text",
    short: "Plain text to every row",
    icon: "send",
    endpoint: "/api/messages/bulk",
    columns: "number,message",
    needsSharedUrl: false,
  },
  {
    value: "BULK_MEDIA",
    label: "Shared Attachment",
    short: "One media file for all",
    icon: "download",
    endpoint: "/api/messages/bulk-media",
    columns: "number,message",
    needsSharedUrl: true,
  },
  {
    value: "BULK_MEDIA_CUSTOM",
    label: "Custom per Row",
    short: "Per-row media URL",
    icon: "layers",
    endpoint: "/api/messages/bulk-media-custom",
    columns: "number,message,attachmentUrl",
    needsSharedUrl: false,
  },
];

// Delay window (seconds), kept in sync with lib/jobs/delay.ts.
const MIN_DELAY_SEC = 5;
const MAX_DELAY_SEC = 60;
const DEFAULT_MAX_DELAY_SEC = 15;

export default function BulkPage() {
  const router = useRouter();
  const [type, setType] = useState<JobType>("BULK_TEXT");
  const [file, setFile] = useState<File | null>(null);
  const [sharedUrl, setSharedUrl] = useState("");
  const [maxDelaySec, setMaxDelaySec] = useState(DEFAULT_MAX_DELAY_SEC);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const [when, setWhen] = useState<When>("now");
  const [scheduleName, setScheduleName] = useState("");
  const [runAt, setRunAt] = useState("");
  const [intervalKind, setIntervalKind] = useState<IntervalKind>("HOUR");
  const [intervalN, setIntervalN] = useState(6);
  const [atTime, setAtTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [endMode, setEndMode] = useState<EndMode>("never");
  const [endAt, setEndAt] = useState("");
  const [maxRuns, setMaxRuns] = useState(10);

  const active = JOB_TYPES.find((t) => t.value === type)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a CSV file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("maxDelaySec", String(maxDelaySec));
      if (active.needsSharedUrl) form.append("attachmentUrl", sharedUrl);

      if (when === "now") {
        const res = await fetch(active.endpoint, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) setError(data.message ?? "Failed to start job.");
        else setJobId(data.jobId);
        return;
      }

      form.append("type", type);
      form.append("name", scheduleName);
      form.append("mode", when === "once" ? "ONE_TIME" : "RECURRING");
      if (when === "once") {
        form.append("runAt", runAt);
      } else {
        form.append("intervalKind", intervalKind);
        if (intervalKind === "MINUTE" || intervalKind === "HOUR")
          form.append("intervalN", String(intervalN));
        if (intervalKind === "DAY" || intervalKind === "WEEK")
          form.append("atTime", atTime);
        if (intervalKind === "WEEK") form.append("weekday", String(weekday));
      }
      if (endMode === "date") form.append("endAt", endAt);
      if (endMode === "count") form.append("maxRuns", String(maxRuns));

      const res = await fetch("/api/schedules", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setError(data.message ?? "Failed to schedule.");
      else router.push("/schedules");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setJobId(null);
    setFile(null);
    setSharedUrl("");
    setError(null);
  };

  if (jobId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm muted">Live progress · polling every few seconds</p>
          <button onClick={reset} className="btn btn-ghost">
            <Icon name="layers" className="w-4 h-4" /> Start another
          </button>
        </div>
        <JobView jobId={jobId} />
      </div>
    );
  }

  const submitLabel =
    when === "now"
      ? "Start bulk job"
      : when === "once"
        ? "Schedule send"
        : "Create recurring schedule";

  return (
    <form onSubmit={submit} className="card p-6 space-y-6">
      <p className="text-sm muted -mt-1">
        Messages are sent one at a time with a randomized delay so sending stays paced.
      </p>

      {/* Job type selector */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Job type</span>
        <div className="grid sm:grid-cols-3 gap-3">
          {JOB_TYPES.map((t) => {
            const on = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className="relative text-left rounded-xl border p-4 transition-all"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--border-strong)",
                  background: on ? "var(--accent-soft)" : "var(--surface-2)",
                }}
              >
                <span
                  className={`grid place-items-center w-9 h-9 rounded-lg mb-2.5 ${
                    on ? "bg-[var(--accent)] text-[#04130d]" : "bg-[var(--surface-inset)] text-[var(--muted)]"
                  }`}
                >
                  <Icon name={t.icon} className="w-[18px] h-[18px]" />
                </span>
                <span className="block text-sm font-semibold">{t.label}</span>
                <span className="block text-xs muted mt-0.5">{t.short}</span>
                {on && (
                  <span className="absolute top-3 right-3 text-[var(--accent)]">
                    <Icon name="check" className="w-4 h-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expected columns */}
      <div className="card-inset p-4">
        <p className="text-xs muted mb-1.5">
          Expected columns for <strong className="text-[var(--text)]">{active.label}</strong>{" "}
          <span className="muted">(CSV or XLSX)</span>
        </p>
        <code className="block font-mono text-sm text-[var(--accent)] overflow-x-auto">
          {active.columns}
        </code>
      </div>

      {active.needsSharedUrl && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Shared attachment URL (applied to every recipient)</span>
          <input className="input" value={sharedUrl} onChange={(e) => setSharedUrl(e.target.value)} placeholder="https://example.com/flyer.jpg" required />
        </label>
      )}

      {/* File drop */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">CSV or XLSX file</span>
        <CsvDropzone file={file} onFile={setFile} />
      </div>

      {/* Delay window */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Delay between messages</span>
          <span className="text-sm font-semibold text-[var(--accent)]">
            {MIN_DELAY_SEC}s – {maxDelaySec}s
          </span>
        </div>

        <input
          type="range"
          min={MIN_DELAY_SEC + 1}
          max={MAX_DELAY_SEC}
          step={1}
          value={maxDelaySec}
          onChange={(e) => setMaxDelaySec(Number(e.target.value))}
          className="delay-slider w-full"
          aria-label="Maximum delay between messages in seconds"
        />

        <div className="flex justify-between text-xs muted">
          <span>{MIN_DELAY_SEC}s min</span>
          <span>{MAX_DELAY_SEC}s max</span>
        </div>

        <p className="text-xs muted leading-relaxed">
          The minimum is locked at <strong className="text-[var(--text)]">{MIN_DELAY_SEC}s</strong>.
          Drag the handle to set the upper limit (up to {MAX_DELAY_SEC}s). After each
          message, the app waits a <strong className="text-[var(--text)]">random</strong> time
          somewhere between {MIN_DELAY_SEC}s and {maxDelaySec}s before sending the next one —
          the randomness keeps sending paced and natural.
        </p>
      </div>

      {/* When to send */}
      <div className="space-y-3 border-t pt-5" style={{ borderColor: "var(--border)" }}>
        <span className="text-sm font-medium">When to send</span>
        <div className="grid sm:grid-cols-3 gap-3">
          {(
            [
              { v: "now", label: "Send now", desc: "Start immediately", icon: "bolt" },
              { v: "once", label: "Schedule once", desc: "At a set time", icon: "clock" },
              { v: "recurring", label: "Repeat", desc: "On a schedule", icon: "clock" },
            ] as { v: When; label: string; desc: string; icon: IconName }[]
          ).map((o) => {
            const on = when === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setWhen(o.v)}
                className="relative text-left rounded-xl border p-3.5 transition-all"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--border-strong)",
                  background: on ? "var(--accent-soft)" : "var(--surface-2)",
                }}
              >
                <span className="flex items-center gap-2">
                  <Icon name={o.icon} className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm font-semibold">{o.label}</span>
                </span>
                <span className="block text-xs muted mt-0.5">{o.desc}</span>
              </button>
            );
          })}
        </div>

        {when !== "now" && (
          <div className="card-inset p-4 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Schedule name</span>
              <input
                className="input"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="e.g. Weekly promo"
              />
            </label>

            {when === "once" ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Date &amp; time</span>
                <input
                  type="datetime-local"
                  className="input"
                  value={runAt}
                  onChange={(e) => setRunAt(e.target.value)}
                  required
                />
              </label>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Repeat</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input !w-auto"
                      value={intervalKind}
                      onChange={(e) => setIntervalKind(e.target.value as IntervalKind)}
                    >
                      <option value="MINUTE">Every N minutes</option>
                      <option value="HOUR">Every N hours</option>
                      <option value="DAY">Daily</option>
                      <option value="WEEK">Weekly</option>
                    </select>

                    {(intervalKind === "MINUTE" || intervalKind === "HOUR") && (
                      <input
                        type="number"
                        min={1}
                        className="input !w-24"
                        value={intervalN}
                        onChange={(e) => setIntervalN(Number(e.target.value))}
                        aria-label="Interval count"
                      />
                    )}

                    {intervalKind === "WEEK" && (
                      <select
                        className="input !w-auto"
                        value={weekday}
                        onChange={(e) => setWeekday(Number(e.target.value))}
                      >
                        {WEEKDAY_NAMES.map((d, i) => (
                          <option key={d} value={i}>
                            {d}
                          </option>
                        ))}
                      </select>
                    )}

                    {(intervalKind === "DAY" || intervalKind === "WEEK") && (
                      <input
                        type="time"
                        className="input !w-auto"
                        value={atTime}
                        onChange={(e) => setAtTime(e.target.value)}
                      />
                    )}
                  </div>
                  <p className="text-xs muted">
                    Minimum interval is {MIN_RECURRING_INTERVAL_MIN} minutes (rate
                    guardrail). Times use the server&apos;s local timezone.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Ends</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input !w-auto"
                      value={endMode}
                      onChange={(e) => setEndMode(e.target.value as EndMode)}
                    >
                      <option value="never">Never</option>
                      <option value="date">On date</option>
                      <option value="count">After N runs</option>
                    </select>
                    {endMode === "date" && (
                      <input
                        type="datetime-local"
                        className="input !w-auto"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                      />
                    )}
                    {endMode === "count" && (
                      <input
                        type="number"
                        min={1}
                        className="input !w-24"
                        value={maxRuns}
                        onChange={(e) => setMaxRuns(Number(e.target.value))}
                        aria-label="Max runs"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-amber-500">
              <Icon name="warning" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Keep frequency low and only message consent-based lists that expect to
                hear from you.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? (
            <>
              <Icon name="spinner" className="w-4 h-4 animate-spin" /> Working…
            </>
          ) : (
            <>
              <Icon name={when === "now" ? "bolt" : "clock"} className="w-4 h-4" /> {submitLabel}
            </>
          )}
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </form>
  );
}
