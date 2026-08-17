import { describe, expect, it } from "vitest";
import { createExport, planImport } from "./backup";
import { libraryFixture } from "@/test/fixtures";

describe("backup round trip", () => {
  it("reconstructs a functionally equivalent library", () => {
    const original = libraryFixture(25);
    const exported = JSON.parse(JSON.stringify(createExport(original, true))) as unknown;
    const restored = planImport(exported).snapshot;
    expect(restored).toEqual(original);
  });

  it("rejects an incompatible payload before any write", () => {
    expect(() => planImport({ schemaVersion: 999 })).toThrow("Invalid Streamall export");
  });
});
