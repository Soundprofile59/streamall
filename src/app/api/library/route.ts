import { librarySnapshotSchema } from "@/domain/schema";
import { RevisionConflictError } from "@/domain/repository";
import { requireApiSession } from "@/server/auth";
import { getLibraryRepository } from "@/server/repositories";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  try {
    return Response.json(await getLibraryRepository().load());
  } catch (error) {
    return Response.json({ error: "REPOSITORY_UNAVAILABLE", message: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => null)) as { snapshot?: unknown; expectedRevision?: unknown; operationId?: unknown } | null;
  const parsed = librarySnapshotSchema.safeParse(body?.snapshot);
  if (!parsed.success || typeof body?.expectedRevision !== "number" || typeof body.operationId !== "string") {
    return Response.json({ error: "INVALID_LIBRARY", issues: parsed.success ? [] : parsed.error.issues }, { status: 400 });
  }
  try {
    return Response.json(await getLibraryRepository().save(parsed.data, body.expectedRevision, body.operationId));
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      return Response.json({ error: "REVISION_CONFLICT", currentRevision: error.currentRevision }, { status: 409 });
    }
    return Response.json({ error: "SAVE_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}
