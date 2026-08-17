import type { LibrarySnapshot } from "./types";

export class RevisionConflictError extends Error {
  constructor(public readonly currentRevision: number) {
    super(`Library revision conflict (current revision: ${currentRevision})`);
    this.name = "RevisionConflictError";
  }
}

export interface LibraryRepository {
  load(): Promise<LibrarySnapshot>;
  save(snapshot: LibrarySnapshot, expectedRevision: number, operationId: string): Promise<LibrarySnapshot>;
}

export interface HistoryRepository {
  loadPage(cursor?: string, limit?: number): Promise<{ entries: LibrarySnapshot["history"]; cursor?: string }>;
}

export interface SettingsRepository {
  loadSettings(): Promise<LibrarySnapshot["settings"]>;
}
