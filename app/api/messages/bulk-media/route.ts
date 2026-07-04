import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/whatsapp/guard";
import { readBulkRequest } from "@/lib/jobs/csvParser";
import { createBulkJob } from "@/lib/jobs/createBulkJob";
import { resolveDelayWindow } from "@/lib/jobs/delay";

export const dynamic = "force-dynamic";

// Bulk shared attachment — one attachmentUrl applied to every recipient.
// Accepts multipart/form-data (CSV `file`: number,message + `attachmentUrl` field)
// or application/json ({ attachmentUrl, recipients: [{ number, message }] }).
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

  const attachmentUrl = fields.attachmentUrl?.trim();
  if (!attachmentUrl) {
    return NextResponse.json(
      {
        error: "BAD_REQUEST",
        message: "A shared `attachmentUrl` is required.",
      },
      { status: 400 },
    );
  }

  const { jobId } = await createBulkJob(
    "BULK_MEDIA",
    rows,
    () => attachmentUrl,
    resolveDelayWindow(fields),
  );
  return NextResponse.json({ jobId }, { status: 202 });
}
