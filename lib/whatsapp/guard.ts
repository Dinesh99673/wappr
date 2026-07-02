import { NextResponse } from "next/server";
import type { Client } from "whatsapp-web.js";
import { getClient } from "@/lib/whatsapp/sessionManager";

/**
 * The exact contract every messaging endpoint returns when there is no active
 * session. Frontend and external consumers can rely on this shape.
 */
export const SESSION_EXPIRED_BODY = {
  error: "SESSION_EXPIRED",
  message: "WhatsApp session is not active. Please login again.",
  action: { method: "POST", path: "/api/session/login" },
} as const;

export function sessionExpiredResponse() {
  return NextResponse.json(SESSION_EXPIRED_BODY, { status: 409 });
}

/**
 * Guard used by every messaging route. Returns the live client, or a ready-made
 * 409 response when the session is not active.
 */
export async function requireClient(): Promise<
  { ok: true; client: Client } | { ok: false; response: NextResponse }
> {
  const client = await getClient();
  if (!client) {
    return { ok: false, response: sessionExpiredResponse() };
  }
  return { ok: true, client };
}
