import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/whatsapp/guard";
import { readBulkRequest } from "@/lib/jobs/csvParser";
import { createBulkJob } from "@/lib/jobs/createBulkJob";
import { resolveDelayWindow } from "@/lib/jobs/delay";

export const dynamic = "force-dynamic";

// Bulk per-row attachment.
// Accepts multipart/form-data (CSV `file`: number,message,attachmentUrl)
// or application/json ({ recipients: [{ number, message, attachmentUrl }] }).
// Rows missing attachmentUrl are marked FAILED immediately (job still runs).
export async function POST(req: NextRequest) {
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const { rows, fields, error } = await readBulkRequest(req);
  if (error) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: error },
      { status: 400 },
    );
  }

  const { jobId } = await createBulkJob(
    "BULK_MEDIA_CUSTOM",
    rows,
    (row) => {
      const url = row.attachmentUrl?.trim();
      if (!url) return { fail: "Missing attachmentUrl" };
      return url;
    },
    resolveDelayWindow(fields),
  );
  return NextResponse.json({ jobId }, { status: 202 });
}
