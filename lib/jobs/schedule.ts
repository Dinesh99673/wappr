// Scheduling core — recurrence math, validation, attachment resolution. Pure
// and client-safe (only `import type` from createBulkJob). Wall-clock math uses
// the server's local time; instants are stored as UTC via `nextRunAt`.

import type { ResolveAttachment } from "@/lib/jobs/createBulkJob";

export type ScheduleMode = "ONE_TIME" | "RECURRING";
export type IntervalKind = "MINUTE" | "HOUR" | "DAY" | "WEEK";
export type BulkJobType = "BULK_TEXT" | "BULK_MEDIA" | "BULK_MEDIA_CUSTOM";

/** Ban-risk guardrail: recurring schedules may not fire faster than this. */
export const MIN_RECURRING_INTERVAL_MIN = 15;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type Recurrence = {
  intervalKind: IntervalKind | null;
  intervalN: number | null;
  atTime: string | null; // "HH:MM"
  weekday: number | null; // 0-6, Sunday=0
};

/** Raw timing input from the API (all strings/optional). */
export type TimingInput = {
  mode: ScheduleMode;
  runAt?: string; // ONE_TIME — ISO or datetime-local
  intervalKind?: string;
  intervalN?: string | number;
  atTime?: string;
  weekday?: string | number;
  endAt?: string;
  maxRuns?: string | number;
};

export type NormalizedTiming = {
  mode: ScheduleMode;
  recurrence: Recurrence;
  firstRunAt: Date;
  endAt: Date | null;
  maxRuns: number | null;
};

/* --------------------------------------------------------------- helpers */

function parseHhMm(s: string | undefined): { hh: number; mm: number } | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
}

function toInt(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function intervalMs(kind: IntervalKind, n: number): number {
  switch (kind) {
    case "MINUTE":
      return n * 60_000;
    case "HOUR":
      return n * 3_600_000;
    default:
      return 0; // DAY/WEEK don't use a fixed ms interval
  }
}

/** Next firing instant strictly after `from` for a recurring schedule. */
export function recurringNext(rec: Recurrence, from: Date): Date {
  const kind = rec.intervalKind;
  if (kind === "MINUTE" || kind === "HOUR") {
    return new Date(from.getTime() + intervalMs(kind, rec.intervalN ?? 1));
  }
  const t = parseHhMm(rec.atTime ?? undefined) ?? { hh: 9, mm: 0 };
  const base = new Date(from);
  base.setHours(t.hh, t.mm, 0, 0);

  if (kind === "DAY") {
    if (base.getTime() <= from.getTime()) base.setDate(base.getDate() + 1);
    return base;
  }
  // WEEK
  const target = rec.weekday ?? 0;
  let delta = (target - base.getDay() + 7) % 7;
  if (delta === 0 && base.getTime() <= from.getTime()) delta = 7;
  base.setDate(base.getDate() + delta);
  return base;
}

/* --------------------------------------------------------- validation */

/** Validates & normalizes timing. Returns `{ error }` or `{ timing }`. */
export function normalizeTiming(
  input: TimingInput,
  now: Date = new Date(),
): { error: string } | { timing: NormalizedTiming } {
  const endAt = input.endAt ? new Date(input.endAt) : null;
  if (input.endAt && (!endAt || Number.isNaN(endAt.getTime()))) {
    return { error: "End date is invalid." };
  }
  const maxRuns = toInt(input.maxRuns);
  if (input.maxRuns !== undefined && input.maxRuns !== "" && (maxRuns === null || maxRuns < 1)) {
    return { error: "Max runs must be a whole number ≥ 1." };
  }

  if (input.mode === "ONE_TIME") {
    const runAt = input.runAt ? new Date(input.runAt) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) {
      return { error: "Pick a valid date and time to send." };
    }
    if (runAt.getTime() <= now.getTime()) {
      return { error: "The scheduled time must be in the future." };
    }
    return {
      timing: {
        mode: "ONE_TIME",
        recurrence: { intervalKind: null, intervalN: null, atTime: null, weekday: null },
        firstRunAt: runAt,
        endAt,
        maxRuns,
      },
    };
  }

  // RECURRING
  const kind = input.intervalKind as IntervalKind | undefined;
  if (kind !== "MINUTE" && kind !== "HOUR" && kind !== "DAY" && kind !== "WEEK") {
    return { error: "Choose how often to repeat." };
  }

  let rec: Recurrence;
  if (kind === "MINUTE" || kind === "HOUR") {
    const n = toInt(input.intervalN);
    if (n === null || n < 1) {
      return { error: "Interval must be a whole number ≥ 1." };
    }
    const minutes = kind === "MINUTE" ? n : n * 60;
    if (minutes < MIN_RECURRING_INTERVAL_MIN) {
      return {
        error: `To reduce ban risk, recurring schedules can't fire more often than every ${MIN_RECURRING_INTERVAL_MIN} minutes.`,
      };
    }
    rec = { intervalKind: kind, intervalN: n, atTime: null, weekday: null };
  } else {
    const t = parseHhMm(input.atTime);
    if (!t) return { error: "Enter a valid time (HH:MM)." };
    let weekday: number | null = null;
    if (kind === "WEEK") {
      weekday = toInt(input.weekday);
      if (weekday === null || weekday < 0 || weekday > 6) {
        return { error: "Choose a day of the week." };
      }
    }
    rec = {
      intervalKind: kind,
      intervalN: null,
      atTime: `${String(t.hh).padStart(2, "0")}:${String(t.mm).padStart(2, "0")}`,
      weekday,
    };
  }

  return {
    timing: {
      mode: "RECURRING",
      recurrence: rec,
      firstRunAt: recurringNext(rec, now),
      endAt,
      maxRuns,
    },
  };
}

/* ------------------------------------------------ attachment resolution */

// Per-type attachment resolver, mirroring the three bulk routes. For BULK_MEDIA
// the caller must validate `sharedUrl` is present.
export function resolveAttachmentFor(
  type: BulkJobType,
  sharedUrl?: string,
): ResolveAttachment {
  switch (type) {
    case "BULK_MEDIA": {
      const url = sharedUrl?.trim() ?? "";
      return () => (url ? url : { fail: "Missing attachment" });
    }
    case "BULK_MEDIA_CUSTOM":
      return (row) => {
        const url = row.attachmentUrl?.trim();
        return url ? url : { fail: "Missing attachmentUrl" };
      };
    case "BULK_TEXT":
    default:
      return () => null;
  }
}

/** Human summary of a schedule's cadence, for the UI. */
export function describeCadence(s: {
  mode: string;
  intervalKind: string | null;
  intervalN: number | null;
  atTime: string | null;
  weekday: number | null;
  nextRunAt?: string | Date;
}): string {
  if (s.mode === "ONE_TIME") {
    const when = s.nextRunAt ? new Date(s.nextRunAt) : null;
    return when
      ? `Once on ${when.toLocaleDateString()} at ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Once";
  }
  switch (s.intervalKind) {
    case "MINUTE":
      return `Every ${s.intervalN} minute${s.intervalN === 1 ? "" : "s"}`;
    case "HOUR":
      return `Every ${s.intervalN} hour${s.intervalN === 1 ? "" : "s"}`;
    case "DAY":
      return `Daily at ${s.atTime}`;
    case "WEEK":
      return `Weekly on ${WEEKDAY_NAMES[s.weekday ?? 0]} at ${s.atTime}`;
    default:
      return "Recurring";
  }
}

export { WEEKDAY_NAMES };
