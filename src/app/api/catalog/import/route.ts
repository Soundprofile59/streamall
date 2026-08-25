import { z } from "zod";
import { importCatalogRelease } from "@/domain/catalog-import";
import { RevisionConflictError } from "@/domain/repository";
import { requireApiSession } from "@/server/auth";
import { getLibraryRepository } from "@/server/repositories";
import { rateLimit } from "@/server/rate-limit";

const requestSchema = z.object({
  artist: z.object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(240),
    sortName: z.string().max(240).optional(),
    disambiguation: z.string().max(300).optional(),
    country: z.string().max(12).optional(),
    type: z.string().max(80).optional(),
    score: z.number().optional(),
  }),
  release: z.object({
    releaseGroupId: z.string().min(1).max(80),
    releaseId: z.string().min(1).max(80),
    title: z.string().min(1).max(400),
    date: z.string().max(32).optional(),
    country: z.string().max(12).optional(),
    status: z.string().max(80).optional(),
    artwork: z.url().optional(),
    tracks: z.array(z.object({
      position: z.number().int().positive(),
      number: z.string().max(30).optional(),
      title: z.string().min(1).max(500),
      artistName: z.string().min(1).max(300),
      lengthMs: z.number().int().nonnegative().optional(),
    })).min(1).max(300),
  }),
});

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;

  const limit = rateLimit(`catalog-import:${request.headers.get("x-forwarded-for") ?? "owner"}`, 12, 60_000);
  if (!limit.allowed) return Response.json({ error: "RATE_LIMITED", retryAfterMs: limit.retryAfter }, { status: 429 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "INVALID_CATALOG_IMPORT", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const repository = getLibraryRepository();
    const current = await repository.load();
    const result = importCatalogRelease(current, parsed.data.artist, parsed.data.release);

    if (result.snapshot === current) {
      return Response.json({
        albumId: result.albumId,
        albumCreated: false,
        artistCreated: false,
        addedTracks: 0,
        existingTracks: result.existingTracks,
        revision: current.revision,
      });
    }

    const persisted = await repository.save(result.snapshot, current.revision, crypto.randomUUID());
    return Response.json({
      albumId: result.albumId,
      albumCreated: result.albumCreated,
      artistCreated: result.artistCreated,
      addedTracks: result.addedTracks,
      existingTracks: result.existingTracks,
      revision: persisted.revision,
    });
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return Response.json({ error: "REVISION_CONFLICT", currentRevision: error.currentRevision }, { status: 409 });
    }
    return Response.json(
      { error: "CATALOG_IMPORT_FAILED", message: error instanceof Error ? error.message : "Import impossible" },
      { status: 503 },
    );
  }
}
