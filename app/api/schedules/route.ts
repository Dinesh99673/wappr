import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readBulkRequest } from "@/lib/jobs/csvParser";
import { prepareRecipients, type BulkJobType } from "@/lib/jobs/createBulkJob";
import { resolveDelayWindow } from "@/lib/jobs/delay";
import {
  normalizeTiming,
  resolveAttachmentFor,
  type TimingInput,
} from "@/lib/jobs/schedule";

export const dynamic = "force-dynamic";

const JOB_TYPES: BulkJobType[] = [
  "BULK_TEXT",
  "BULK_MEDIA",
  "BULK_MEDIA_CUSTOM",
];

// List all schedules, soonest run first.
export async function GET() {
  const schedules = await prisma.schedule.findMany({
    orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
    include: {
      _count: { select: { jobs: true } },
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, createdAt: true },
      },
    },
  });
  return NextResponse.json({ schedules });
}

// Create a schedule. Same multipart body as the bulk routes plus scheduling
// fields (name, type, mode, intervalKind, intervalN, atTime, weekday, runAt,
// endAt, maxRuns). No live session needed — a run PAUSEs if it's down when it fires.
export async function POST(req: NextRequest) {
  const { rows, fields, error } = await readBulkRequest(req);
  if (error) {
    return NextResponse.json({ error: "BAD_REQUEST", message: error }, { status: 400 });
  }

  const type = fields.type as BulkJobType;
  if (!JOB_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Unknown or missing `type`." },
      { status: 400 },
    );
  }

  const mode = fields.mode === "RECURRING" ? "RECURRING" : "ONE_TIME";
  const timingInput: TimingInput = {
    mode,
    runAt: fields.runAt,
    intervalKind: fields.intervalKind,
    intervalN: fields.intervalN,
    atTime: fields.atTime,
    weekday: fields.weekday,
    endAt: fields.endAt,
    maxRuns: fields.maxRuns,
  };
  const norm = normalizeTiming(timingInput);
  if ("error" in norm) {
    return NextResponse.json({ error: "BAD_REQUEST", message: norm.error }, { status: 400 });
  }

  // BULK_MEDIA needs a shared attachment URL, just like its bulk route.
  const sharedUrl = fields.attachmentUrl?.trim();
  if (type === "BULK_MEDIA" && !sharedUrl) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "A shared `attachmentUrl` is required." },
      { status: 400 },
    );
  }

  const recipients = prepareRecipients(rows, resolveAttachmentFor(type, sharedUrl));
  const delay = resolveDelayWindow(fields);
  const { timing } = norm;

  const schedule = await prisma.schedule.create({
    data: {
      name: fields.name?.trim() || defaultName(type, mode),
      type,
      status: "ACTIVE",
      mode: timing.mode,
      intervalKind: timing.recurrence.intervalKind,
      intervalN: timing.recurrence.intervalN,
      atTime: timing.recurrence.atTime,
      weekday: timing.recurrence.weekday,
      nextRunAt: timing.firstRunAt,
      endAt: timing.endAt,
      maxRuns: timing.maxRuns,
      minDelaySec: delay.minSec,
      maxDelaySec: delay.maxSec,
      recipientsJson: JSON.stringify(recipients),
    },
  });

  return NextResponse.json(
    { scheduleId: schedule.id, nextRunAt: schedule.nextRunAt },
    { status: 201 },
  );
}

function defaultName(type: BulkJobType, mode: string): string {
  const kind = mode === "RECURRING" ? "Recurring" : "Scheduled";
  const t =
    type === "BULK_TEXT"
      ? "text"
      : type === "BULK_MEDIA"
        ? "media"
        : "custom media";
  return `${kind} ${t} send`;
}
