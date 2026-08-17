import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limit = rateLimit(`login:${client}`, 8, 15 * 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "TOO_MANY_ATTEMPTS" }, { status: 429 });
  const configured = process.env.STREAMALL_ACCESS_PASSWORD ?? (process.env.NODE_ENV !== "production" ? "streamall" : undefined);
  if (!configured) return NextResponse.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || !sameSecret(body.password, configured)) {
    return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return response;
}
