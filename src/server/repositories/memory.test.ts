import { describe, expect, it } from "vitest";
import { RevisionConflictError } from "@/domain/repository";
import { libraryFixture } from "@/test/fixtures";
import { MemoryLibraryRepository } from "./memory";

describe("MemoryLibraryRepository", () => {
  it("applies writes idempotently", async () => {
    const repository = new MemoryLibraryRepository(libraryFixture(1));
    const snapshot = await repository.load();
    snapshot.moods.push("Focus");
    const first = await repository.save(snapshot, 0, "operation-1");
    const second = await repository.save(snapshot, 0, "operation-1");
    expect(second).toEqual(first);
    expect(second.revision).toBe(1);
  });

  it("rejects deterministic revision conflicts", async () => {
    const repository = new MemoryLibraryRepository(libraryFixture(1));
    const snapshot = await repository.load();
    await repository.save(snapshot, 0, "first");
    await expect(repository.save(snapshot, 0, "second")).rejects.toBeInstanceOf(RevisionConflictError);
  });
});
