import { NextResponse } from "next/server";
import { startLogin } from "@/lib/whatsapp/sessionManager";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await startLogin();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "LOGIN_FAILED", message: (err as Error).message },
      { status: 500 },
    );
  }
}
