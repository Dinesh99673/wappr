import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireClient } from "@/lib/whatsapp/guard";
import { enqueueJob } from "@/lib/jobs/processJob";

export const dynamic = "force-dynamic";

// Resume a PAUSED job — only valid when the session is authenticated.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const job = await prisma.bulkJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Job not found." },
      { status: 404 },
    );
  }

  if (job.status !== "PAUSED") {
    return NextResponse.json(
      {
        error: "INVALID_STATE",
        message: `Only PAUSED jobs can be resumed (current status: ${job.status}).`,
      },
      { status: 409 },
    );
  }

  // Session must be live to resume.
  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  await prisma.bulkJob.update({
    where: { id },
    data: { status: "RUNNING" },
  });
  enqueueJob(id);

  return NextResponse.json({ ok: true, status: "RUNNING" });
}
