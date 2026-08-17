import { describe, expect, it } from "vitest";
import { addExternalResult, allPlayable, assessDuplicate, attachExternalSource, removeSource } from "./library";
import { libraryFixture } from "@/test/fixtures";

const result = {
  externalId: "yt_1",
  provider: "youtube" as const,
  kind: "track" as const,
  title: "Track 0",
  artistName: "Artist 0",
  url: "yt_1",
  providerMetadata: {},
};

describe("library invariants", () => {
  it("keeps a Track after its last Source is removed", () => {
    const library = libraryFixture(1);
    const updated = removeSource(library, library.sources[0]!.id);
    expect(updated.sources).toHaveLength(0);
    expect(updated.tracks).toHaveLength(1);
    expect(updated.tracks[0]!.id).toBe("track_0");
  });

  it("can attach multiple provider Sources to one Streamall identity", () => {
    const library = libraryFixture(1);
    const updated = attachExternalSource(library, "track_0", result);
    expect(updated.sources.filter((source) => source.playableItemId === "track_0")).toHaveLength(2);
    expect(allPlayable(updated)).toHaveLength(1);
  });

  it("does not silently merge a matching external result", () => {
    const library = libraryFixture(1);
    const added = addExternalResult(library, result);
    expect(added.snapshot.tracks).toHaveLength(2);
    expect(assessDuplicate(result, library.tracks[0]!, library.artists)).toBe("PROBABLE");
  });

  it("treats alternate versions conservatively", () => {
    const library = libraryFixture(1);
    expect(assessDuplicate({ ...result, title: "Track 0 (Live)" }, library.tracks[0]!, library.artists)).toBe("POSSIBLE");
  });
});
