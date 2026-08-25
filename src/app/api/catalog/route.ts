import { requireApiSession } from "@/server/auth";
import { getArtistReleaseGroups, getReleaseGroupDetail, searchCatalogArtists } from "@/server/musicbrainz";
import { rateLimit } from "@/server/rate-limit";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = rateLimit(`catalog:${request.headers.get("x-forwarded-for") ?? "owner"}`, 35, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  const artistId = url.searchParams.get("artistId")?.trim();
  const releaseGroupId = url.searchParams.get("releaseGroupId")?.trim();

  try {
    if (query) {
      if (query.length < 2 || query.length > 120) return Response.json({ error: "INVALID_QUERY" }, { status: 400 });
      return Response.json({ mode: "artists", artists: await searchCatalogArtists(query) });
    }
    if (artistId) {
      return Response.json({ mode: "releases", releases: await getArtistReleaseGroups(artistId) });
    }
    if (releaseGroupId) {
      return Response.json({ mode: "release", release: await getReleaseGroupDetail(releaseGroupId) });
    }
    return Response.json({ error: "MISSING_CATALOG_QUERY" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: "CATALOG_UNAVAILABLE", message: error instanceof Error ? error.message : "MusicBrainz indisponible" },
      { status: 502 },
    );
  }
}
