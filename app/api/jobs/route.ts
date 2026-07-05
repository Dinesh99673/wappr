import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

// List all jobs, most recent first.
export async function GET() {
  const jobs = await prisma.bulkJob.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      total: true,
      sent: true,
      failed: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ jobs });
}
