import { requireApiSession } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";
import { getLibraryRepository } from "@/server/repositories";
import { findAlbumSimilarArtists } from "@/server/similarity";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = rateLimit(`similarity:${request.headers.get("x-forwarded-for") ?? "owner"}`, 12, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });

  const albumId = new URL(request.url).searchParams.get("albumId")?.trim();
  if (!albumId || albumId.length > 160) return Response.json({ error: "INVALID_ALBUM_ID" }, { status: 400 });

  try {
    const library = await getLibraryRepository().load();
    const album = library.albums.find((candidate) => candidate.id === albumId);
    if (!album) return Response.json({ error: "ALBUM_NOT_FOUND" }, { status: 404 });

    const artistName = album.artistIds
      .map((artistId) => library.artists.find((artist) => artist.id === artistId)?.name)
      .find(Boolean);
    if (!artistName) return Response.json({ error: "ARTIST_NOT_FOUND" }, { status: 404 });

    return Response.json(await findAlbumSimilarArtists(album, artistName));
  } catch (error) {
    return Response.json(
      { error: "SIMILARITY_UNAVAILABLE", message: error instanceof Error ? error.message : "Recherche par ressemblance indisponible" },
      { status: 502 },
    );
  }
}
