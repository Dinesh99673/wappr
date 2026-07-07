import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { recurringNext, type Recurrence } from "@/lib/jobs/schedule";

export const dynamic = "force-dynamic";

// Pause / resume a schedule.
// Body: { action: "pause" | "resume" }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let action = "";
  try {
    const body = await req.json();
    if (typeof body?.action === "string") action = body.action;
  } catch {
    /* invalid body → falls through to 400 below */
  }

  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (action === "pause") {
    if (schedule.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Only active schedules can be paused." },
        { status: 400 },
      );
    }
    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: "PAUSED" },
    });
    return NextResponse.json({ schedule: updated });
  }

  if (action === "resume") {
    if (schedule.status !== "PAUSED") {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "Only paused schedules can be resumed." },
        { status: 400 },
      );
    }
    // Recompute from now so resume doesn't fire a backlog of missed runs.
    let nextRunAt = schedule.nextRunAt;
    if (schedule.mode === "RECURRING") {
      const rec: Recurrence = {
        intervalKind: schedule.intervalKind as Recurrence["intervalKind"],
        intervalN: schedule.intervalN,
        atTime: schedule.atTime,
        weekday: schedule.weekday,
      };
      nextRunAt = recurringNext(rec, new Date());
    }
    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: "ACTIVE", nextRunAt },
    });
    return NextResponse.json({ schedule: updated });
  }

  return NextResponse.json(
    { error: "BAD_REQUEST", message: "action must be 'pause' or 'resume'." },
    { status: 400 },
  );
}

// Delete a schedule; past runs are detached (kept in history), not deleted.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.bulkJob.updateMany({
      where: { scheduleId: id },
      data: { scheduleId: null },
    }),
    prisma.schedule.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
