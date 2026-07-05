import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// Full job detail including every recipient row.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await prisma.bulkJob.findUnique({
    where: { id },
    include: {
      recipients: {
        select: {
          id: true,
          number: true,
          message: true,
          attachmentUrl: true,
          status: true,
          error: true,
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Job not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ job });
}
