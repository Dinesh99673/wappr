import { NextResponse } from "next/server";
import { logout } from "@/lib/whatsapp/sessionManager";

export const dynamic = "force-dynamic";

export async function POST() {
  await logout();
  return NextResponse.json({ status: "UNLINKED" });
}
