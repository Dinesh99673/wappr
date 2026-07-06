import { NextRequest, NextResponse } from "next/server";
import {
  authConfig,
  createSessionToken,
  safeEqual,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function isSecureRequest(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return req.nextUrl.protocol === "https:";
}

// Password login → HttpOnly session cookie.
export async function POST(req: NextRequest) {
  const cfg = authConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ error: "AUTH_DISABLED" }, { status: 400 });
  }
  if (!cfg.sessionSecret) {
    return NextResponse.json(
      {
        error: "SERVER_MISCONFIGURED",
        message: "APP_PASSWORD is set but SESSION_SECRET is missing.",
      },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    /* empty/malformed → wrong password */
  }

  if (!(await safeEqual(password, cfg.password))) {
    return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });
  }

  const token = await createSessionToken(cfg.sessionSecret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
