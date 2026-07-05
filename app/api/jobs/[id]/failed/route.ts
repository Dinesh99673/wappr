import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

// Download a job's FAILED recipients as a CSV file. Columns match the bulk
// upload formats so the file can be fixed and re-submitted directly.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await prisma.bulkJob.findUnique({
    where: { id },
    include: {
      recipients: {
        where: { status: "FAILED" },
        select: { number: true, message: true, attachmentUrl: true, error: true },
      },
    },
  });

  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Job not found." },
      { status: 404 },
    );
  }

  const header = "number,message,attachmentUrl,error";
  const lines = job.recipients.map((r) =>
    [r.number, r.message ?? "", r.attachmentUrl ?? "", r.error ?? ""]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header, ...lines].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-${id}-failed.csv"`,
    },
  });
}
