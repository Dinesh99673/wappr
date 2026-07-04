import { prisma } from "@/lib/db/prisma";
import { enqueueJob } from "@/lib/jobs/processJob";
import type { CsvRow } from "@/lib/jobs/csvParser";
import { DEFAULT_MAX_DELAY_SEC, MIN_DELAY_SEC, type DelayWindow } from "@/lib/jobs/delay";

export type BulkJobType = "BULK_TEXT" | "BULK_MEDIA" | "BULK_MEDIA_CUSTOM";

export type PreparedRecipient = {
  number: string;
  message: string | null;
  attachmentUrl: string | null;
  status: "PENDING" | "FAILED";
  error: string | null;
};

export type ResolveAttachment = (
  row: CsvRow,
) => string | null | { fail: string };

/**
 * Maps rows to prepared recipients. `resolveAttachment` returns a URL string,
 * null (no attachment), or { fail } to mark that recipient FAILED upfront.
 * A Schedule freezes this output as its snapshot and re-clones it each fire.
 */
export function prepareRecipients(
  rows: CsvRow[],
  resolveAttachment: ResolveAttachment,
): PreparedRecipient[] {
  return rows.map((row) => {
    const resolved = resolveAttachment(row);
    if (resolved !== null && typeof resolved === "object") {
      return {
        number: row.number ?? "",
        message: row.message ?? null,
        attachmentUrl: null,
        status: "FAILED",
        error: resolved.fail,
      };
    }
    return {
      number: row.number ?? "",
      message: row.message ?? null,
      attachmentUrl: resolved,
      status: "PENDING",
      error: null,
    };
  });
}

/**
 * Creates a BulkJob from prepared recipients and starts processing.
 * `scheduleId` links it to the Schedule that produced it (null for manual sends).
 */
export async function createJobFromRecipients(
  type: BulkJobType,
  recipients: PreparedRecipient[],
  delay: DelayWindow = { minSec: MIN_DELAY_SEC, maxSec: DEFAULT_MAX_DELAY_SEC },
  scheduleId?: string,
): Promise<{ jobId: string }> {
  const failedUpfront = recipients.filter((r) => r.status === "FAILED").length;

  const job = await prisma.bulkJob.create({
    data: {
      type,
      status: "RUNNING",
      total: recipients.length,
      failed: failedUpfront,
      minDelaySec: delay.minSec,
      maxDelaySec: delay.maxSec,
      scheduleId: scheduleId ?? null,
      recipients: {
        create: recipients.map((r) => ({
          number: r.number,
          message: r.message,
          attachmentUrl: r.attachmentUrl,
          status: r.status,
          error: r.error,
        })),
      },
    },
  });

  enqueueJob(job.id);
  return { jobId: job.id };
}

/** prepareRecipients + createJobFromRecipients in one step. */
export async function createBulkJob(
  type: BulkJobType,
  rows: CsvRow[],
  resolveAttachment: ResolveAttachment,
  delay: DelayWindow = { minSec: MIN_DELAY_SEC, maxSec: DEFAULT_MAX_DELAY_SEC },
): Promise<{ jobId: string }> {
  const recipients = prepareRecipients(rows, resolveAttachment);
  return createJobFromRecipients(type, recipients, delay);
}
