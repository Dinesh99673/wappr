import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Whether auth is enabled (no secrets) — lets the UI show/hide Sign out.
export async function GET() {
  return NextResponse.json({ enabled: authConfig().enabled });
}
