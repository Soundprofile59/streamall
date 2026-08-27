import { emptyLibrary } from "@/domain/types";
import { RevisionConflictError, type LibraryRepository } from "@/domain/repository";
import type { LibrarySnapshot } from "@/domain/types";

export class MemoryLibraryRepository implements LibraryRepository {
  #snapshot: LibrarySnapshot;
  #operations = new Map<string, LibrarySnapshot>();

  constructor(initial = emptyLibrary()) {
    this.#snapshot = structuredClone(initial);
  }

  async load() {
    return structuredClone(this.#snapshot);
  }

  async save(snapshot: LibrarySnapshot, expectedRevision: number, operationId: string) {
    const previous = this.#operations.get(operationId);
    if (previous) return structuredClone(previous);
    if (this.#snapshot.revision !== expectedRevision) throw new RevisionConflictError(this.#snapshot.revision);
    const persisted = {
      ...structuredClone(snapshot),
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.#snapshot = persisted;
    this.#operations.set(operationId, persisted);
    return structuredClone(persisted);
  }
}
