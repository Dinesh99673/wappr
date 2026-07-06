// App auth — dashboard login (HMAC-signed cookie) + REST API token. Uses Web
// Crypto so the same code runs in both the Edge proxy and Node routes. Opt-in:
// active only when APP_PASSWORD is set; fails closed if SESSION_SECRET is unset.

export const SESSION_COOKIE = "wappr_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

export type AuthConfig = {
  /** True when APP_PASSWORD is set — auth is enforced. */
  enabled: boolean;
  password: string;
  apiToken: string;
  sessionSecret: string;
};

export function authConfig(): AuthConfig {
  const password = process.env.APP_PASSWORD ?? "";
  return {
    enabled: password.length > 0,
    password,
    apiToken: process.env.API_TOKEN ?? "",
    sessionSecret: process.env.SESSION_SECRET ?? "",
  };
}

const encoder = new TextEncoder();

function b64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time equality (both sides hashed first so length can't leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const av = new Uint8Array(ha);
  const bv = new Uint8Array(hb);
  let mismatch = 0;
  for (let i = 0; i < av.length; i++) mismatch |= av[i] ^ bv[i];
  return mismatch === 0;
}

export async function createSessionToken(secret: string): Promise<string> {
  const payload = { exp: Date.now() + SESSION_TTL_SEC * 1000 };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return `${payloadB64}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  let valid = false;
  try {
    const key = await hmacKey(secret);
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sigB64),
      encoder.encode(payloadB64),
    );
  } catch {
    return false;
  }
  if (!valid) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    return typeof payload.exp === "number" && Date.now() < payload.exp;
  } catch {
    return false;
  }
}
