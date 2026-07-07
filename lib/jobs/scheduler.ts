import { prisma } from "@/lib/db/prisma";
import {
  createJobFromRecipients,
  type BulkJobType,
  type PreparedRecipient,
} from "@/lib/jobs/createBulkJob";
import { recurringNext, type Recurrence } from "@/lib/jobs/schedule";

// In-process ticker: every TICK_MS, fire ACTIVE schedules whose nextRunAt is due
// by cloning their snapshot into a BulkJob. DB-backed, so it survives restarts.
// Started once from instrumentation.register().

const TICK_MS = 30_000;

type SchedulerState = {
  timer: NodeJS.Timeout | null;
  ticking: boolean;
};

const globalForScheduler = globalThis as unknown as {
  __wapprScheduler?: SchedulerState;
};

const scheduler: SchedulerState =
  globalForScheduler.__wapprScheduler ??
  (globalForScheduler.__wapprScheduler = { timer: null, ticking: false });

/** Idempotently starts the ticker. */
export function startScheduler() {
  if (scheduler.timer) return;
  scheduler.timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick(); // don't make a fresh boot wait a full interval
  console.log("[wappr] schedule ticker started");
}

async function tick() {
  if (scheduler.ticking) return; // no overlapping ticks → no double-fire
  scheduler.ticking = true;
  try {
    const now = new Date();
    const due = await prisma.schedule.findMany({
      where: { status: "ACTIVE", nextRunAt: { lte: now } },
    });
    for (const s of due) {
      try {
        await fireSchedule(s.id, now);
      } catch (err) {
        console.error(`[wappr] schedule ${s.id} tick failed:`, err);
      }
    }
  } catch (err) {
    console.error("[wappr] scheduler tick error:", err);
  } finally {
    scheduler.ticking = false;
  }
}

async function fireSchedule(scheduleId: string, now: Date) {
  const s = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!s || s.status !== "ACTIVE") return;

  // Overlap guard: skip firing while a previous run is still in flight.
  const inFlight = await prisma.bulkJob.count({
    where: { scheduleId: s.id, status: { in: ["RUNNING", "PAUSED"] } },
  });

  const rec: Recurrence = {
    intervalKind: s.intervalKind as Recurrence["intervalKind"],
    intervalN: s.intervalN,
    atTime: s.atTime,
    weekday: s.weekday,
  };

  if (inFlight === 0) {
    const recipients = JSON.parse(s.recipientsJson) as PreparedRecipient[];
    await createJobFromRecipients(
      s.type as BulkJobType,
      recipients,
      { minSec: s.minDelaySec, maxSec: s.maxDelaySec },
      s.id,
    );
  }

  // Advance the schedule (a skipped occurrence still reschedules).
  const runCount = inFlight === 0 ? s.runCount + 1 : s.runCount;
  const reachedMax = s.maxRuns != null && runCount >= s.maxRuns;
  const next = s.mode === "RECURRING" ? recurringNext(rec, now) : null;
  const pastEnd = s.endAt != null && next != null && next.getTime() > s.endAt.getTime();

  const done = s.mode === "ONE_TIME" || reachedMax || pastEnd || next == null;

  await prisma.schedule.update({
    where: { id: s.id },
    data: {
      lastRunAt: inFlight === 0 ? now : s.lastRunAt,
      runCount,
      status: done ? "COMPLETED" : "ACTIVE",
      nextRunAt: done ? s.nextRunAt : next!,
    },
  });
}
