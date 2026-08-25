import { z } from "zod";
import { deleteAlbum, updateAlbumMetadata } from "@/domain/albums";
import { RevisionConflictError } from "@/domain/repository";
import { requireApiSession } from "@/server/auth";
import { getLibraryRepository } from "@/server/repositories";
import { rateLimit } from "@/server/rate-limit";

const patchSchema = z.object({
  albumId: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(400).optional(),
  year: z.number().int().min(1000).max(3000).optional(),
});

const deleteSchema = z.object({ albumId: z.string().min(1).max(160) });

export async function PATCH(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = rateLimit(`album-edit:${request.headers.get("x-forwarded-for") ?? "owner"}`, 30, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_ALBUM_PATCH", issues: parsed.error.issues }, { status: 400 });

  try {
    const repository = getLibraryRepository();
    const current = await repository.load();
    const album = current.albums.find((candidate) => candidate.id === parsed.data.albumId);
    if (!album) return Response.json({ error: "ALBUM_NOT_FOUND" }, { status: 404 });

    const updated = updateAlbumMetadata(current, parsed.data.albumId, { title: parsed.data.title, year: parsed.data.year });
    const persisted = await repository.save(updated, current.revision, crypto.randomUUID());
    return Response.json({ album: persisted.albums.find((candidate) => candidate.id === parsed.data.albumId), revision: persisted.revision });
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: "REVISION_CONFLICT", currentRevision: error.currentRevision }, { status: 409 });
    return Response.json({ error: "ALBUM_UPDATE_FAILED", message: error instanceof Error ? error.message : "Modification impossible" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = rateLimit(`album-delete:${request.headers.get("x-forwarded-for") ?? "owner"}`, 12, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_ALBUM_DELETE", issues: parsed.error.issues }, { status: 400 });

  try {
    const repository = getLibraryRepository();
    const current = await repository.load();
    const result = deleteAlbum(current, parsed.data.albumId);
    if (!result.deletedAlbum) return Response.json({ error: "ALBUM_NOT_FOUND" }, { status: 404 });

    const persisted = await repository.save(result.snapshot, current.revision, crypto.randomUUID());
    return Response.json({
      deletedAlbum: result.deletedAlbum.title,
      deletedTracks: result.deletedTracks,
      deletedSources: result.deletedSources,
      revision: persisted.revision,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) return Response.json({ error: "REVISION_CONFLICT", currentRevision: error.currentRevision }, { status: 409 });
    return Response.json({ error: "ALBUM_DELETE_FAILED", message: error instanceof Error ? error.message : "Suppression impossible" }, { status: 503 });
  }
}
