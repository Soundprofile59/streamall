import { createExport } from "@/domain/backup";
import { requireApiSession } from "@/server/auth";
import { getLibraryRepository } from "@/server/repositories";

export async function GET(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) return unauthorized;
  const includeHistory = new URL(request.url).searchParams.get("history") !== "false";
  const body = JSON.stringify(createExport(await getLibraryRepository().load(), includeHistory), null, 2);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="streamall-backup-${date}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
