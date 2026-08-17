import { librarySnapshotSchema, streamallExportSchema } from "./schema";
import { SCHEMA_VERSION, type LibrarySnapshot, type StreamallExport } from "./types";

export interface ImportPlan {
  mode: "REPLACE";
  schemaVersion: number;
  counts: Record<"artists" | "albums" | "tracks" | "mixes" | "sources" | "history", number>;
  warnings: string[];
}

export function createExport(snapshot: LibrarySnapshot, includeHistory = true): StreamallExport {
  return {
    ...structuredClone(snapshot),
    history: includeHistory ? structuredClone(snapshot.history) : [],
    exportedAt: new Date().toISOString(),
  };
}

export function planImport(input: unknown): { snapshot: LibrarySnapshot; plan: ImportPlan } {
  const parsed = streamallExportSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid Streamall export: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  if (parsed.data.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported schema version ${parsed.data.schemaVersion}`);
  const snapshot = librarySnapshotSchema.parse(parsed.data);
  return {
    snapshot,
    plan: {
      mode: "REPLACE",
      schemaVersion: snapshot.schemaVersion,
      counts: {
        artists: snapshot.artists.length,
        albums: snapshot.albums.length,
        tracks: snapshot.tracks.length,
        mixes: snapshot.mixes.length,
        sources: snapshot.sources.length,
        history: snapshot.history.length,
      },
      warnings: ["REPLACE écrase la bibliothèque courante après création d’un export de sécurité."],
    },
  };
}
