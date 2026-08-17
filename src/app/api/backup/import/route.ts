import { createExport, planImport } from "@/domain/backup";
import { requireApiSession } from "@/server/auth";
import { getLibraryRepository } from "@/server/repositories";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => null)) as { export?: unknown; commit?: unknown; expectedRevision?: unknown; operationId?: unknown } | null;
  try {
    const { snapshot, plan } = planImport(body?.export);
    if (body?.commit !== true) return Response.json({ plan });
    if (typeof body.expectedRevision !== "number" || typeof body.operationId !== "string") {
      return Response.json({ error: "IMPORT_CONFIRMATION_REQUIRED" }, { status: 400 });
    }
    const repository = getLibraryRepository();
    const current = await repository.load();
    const safetySnapshot = createExport(current, true);
    const restored = await repository.save(snapshot, body.expectedRevision, body.operationId);
    return Response.json({ plan, snapshot: restored, safetySnapshot });
  } catch (error) {
    return Response.json({ error: "IMPORT_FAILED", message: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
