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

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
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

export async function verifySessionToken(token?: string | null) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || (await sign(payload)) !== signature) return false;
  try {
    const value = JSON.parse(decode(payload)) as { sub?: string; exp?: number };
    return value.sub === "streamall-owner" && typeof value.exp === "number" && value.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireApiSession() {
  if (!(await isAuthenticated())) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
