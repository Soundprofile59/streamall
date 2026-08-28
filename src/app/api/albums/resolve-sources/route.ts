import { z } from "zod";
import { RevisionConflictError } from "@/domain/repository";
import { requireApiSession } from "@/server/auth";
import { resolveAlbumSources } from "@/server/album-source-resolver";
import { rateLimit } from "@/server/rate-limit";
import { getLibraryRepository } from "@/server/repositories";

const requestSchema = z.object({
  albumId: z.string().min(1).max(160),
  maxYouTubeSearchCalls: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = rateLimit(`album-resolve:${request.headers.get("x-forwarded-for") ?? "owner"}`, 10, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_ALBUM_RESOLVE", issues: parsed.error.issues }, { status: 400 });

  try {
    const repository = getLibraryRepository();
    const current = await repository.load();
    if (!current.albums.some((album) => album.id === parsed.data.albumId)) {
      return Response.json({ error: "ALBUM_NOT_FOUND" }, { status: 404 });
    }

    const result = await resolveAlbumSources(current, parsed.data.albumId, {
      maxYouTubeSearchCalls: parsed.data.maxYouTubeSearchCalls,
    });
    if (result.snapshot === current) {
      return Response.json({
        addedSources: 0,
        matchedTracks: 0,
        searchedCandidates: result.searchedCandidates,
        youtubeSearchCalls: result.youtubeSearchCalls,
        providers: result.providers,
        revision: current.revision,
      });
    }

    const persisted = await repository.save(result.snapshot, current.revision, crypto.randomUUID());
    return Response.json({
      addedSources: result.addedSources,
      matchedTracks: result.matchedTracks,
      searchedCandidates: result.searchedCandidates,
      youtubeSearchCalls: result.youtubeSearchCalls,
      providers: result.providers,
      revision: persisted.revision,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: "REVISION_CONFLICT", currentRevision: error.currentRevision }, { status: 409 });
    return Response.json({ error: "ALBUM_RESOLVE_FAILED", message: error instanceof Error ? error.message : "Recherche de sources impossible" }, { status: 503 });
  }
}
