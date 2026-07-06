import { NextRequest, NextResponse } from "next/server";
import {
  authConfig,
  safeEqual,
  verifySessionToken,
  SESSION_COOKIE,
} from "@/lib/auth/session";

// Single auth enforcement point: allow a valid session cookie OR bearer token,
// else redirect (pages) / 401 (API). Passes everything through when auth is off.

const PUBLIC_PATHS = ["/login", "/api/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function deny(req: NextRequest, reason: string, status: number) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: reason }, { status });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const cfg = authConfig();
  if (!cfg.enabled) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (!cfg.sessionSecret) {
    return deny(req, "SERVER_MISCONFIGURED", 500); // fail closed
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, cfg.sessionSecret)) {
    return NextResponse.next();
  }

  if (cfg.apiToken) {
    const header = req.headers.get("authorization") ?? "";
    if (header.startsWith("Bearer ")) {
      const provided = header.slice(7).trim();
      if (await safeEqual(provided, cfg.apiToken)) {
        return NextResponse.next();
      }
    }
  }

  return deny(req, "UNAUTHORIZED", 401);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
};
