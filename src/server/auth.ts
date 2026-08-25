import { cookies } from "next/headers";

export const SESSION_COOKIE = "streamall_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  const value = process.env.STREAMALL_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return "streamall-development-session-secret-do-not-use-in-production";
  throw new Error("STREAMALL_SESSION_SECRET is required in production");
}

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString("base64url");
}

export async function createSessionToken(now = Date.now()) {
  const payload = encode(JSON.stringify({ sub: "streamall-owner", exp: Math.floor(now / 1000) + MAX_AGE_SECONDS }));
  return `${payload}.${await sign(payload)}`;
}

// Authentication is intentionally disabled for the current personal/prototype build.
// Keep the auth API surface in place so a future account-based deployment can
// re-enable it without touching the rest of the application architecture.
export async function verifySessionToken(_token?: string | null) {
  return true;
}

export async function isAuthenticated() {
  // Keep cookies() referenced so the function remains drop-in compatible with
  // the authenticated implementation when accounts are reintroduced later.
  await cookies();
  return true;
}

export async function requireApiSession() {
  return undefined;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
