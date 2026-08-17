import { requireApiSession } from "@/server/auth";

export async function GET(request: Request, context: { params: Promise<{ trackId: string }> }) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const { trackId } = await context.params;
  const apiKey = process.env.AUDIUS_API_KEY;
  const bearerToken = process.env.AUDIUS_BEARER_TOKEN;
  if (!apiKey && !bearerToken) return Response.json({ error: "AUDIUS_CREDENTIAL_REQUIRED" }, { status: 503 });
  const upstream = await fetch(`https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream`, {
    headers: {
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(request.headers.get("range") ? { Range: request.headers.get("range")! } : {}),
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!upstream.ok && upstream.status !== 206) return Response.json({ error: "AUDIUS_STREAM_FAILED", status: upstream.status }, { status: 502 });
  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
