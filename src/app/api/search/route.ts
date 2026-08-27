import type { Provider } from "@/domain/types";
import { requireApiSession } from "@/server/auth";
import { searchProviders } from "@/server/providers";
import { rateLimit } from "@/server/rate-limit";

const ENABLED = new Set<Provider>(["audius", "youtube", "jamendo", "mixcloud"]);

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const limit = rateLimit(`search:${request.headers.get("x-forwarded-for") ?? "owner"}`, 40, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 120) return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
  const requested = (url.searchParams.get("providers") ?? "audius,youtube,jamendo,mixcloud")
    .split(",")
    .filter((provider): provider is Provider => ENABLED.has(provider as Provider));
  return Response.json(await searchProviders(query, requested));
}
