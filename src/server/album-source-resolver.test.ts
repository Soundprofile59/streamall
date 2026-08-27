import { describe, expect, it } from "vitest";
import { emptyLibrary, type ExternalSearchResult, type Track } from "@/domain/types";
import { buildYouTubeFallbackBatches, scoreSourceCandidate } from "./album-source-resolver";

function fixture() {
  const library = emptyLibrary("2026-08-25T00:00:00.000Z");
  library.artists = [{ id: "artist_a", revision: 1, createdAt: library.updatedAt, updatedAt: library.updatedAt, name: "Amon Tobin", disabled: false }];
  const track: Track = {
    id: "track_a",
    revision: 1,
    createdAt: library.updatedAt,
    updatedAt: library.updatedAt,
    kind: "track",
    title: "Journeyman",
    artistIds: ["artist_a"],
    duration: 398,
    genres: [],
    moods: [],
    favorite: false,
    frequencyPreference: "NORMAL",
    disabled: false,
  };
  return { library, track };
}

describe("album source matching", () => {
  it("accepts a strong artist/title YouTube-style match", () => {
    const { library, track } = fixture();
    const candidate: ExternalSearchResult = {
      externalId: "yt1",
      provider: "youtube",
      kind: "track",
      title: "Amon Tobin - Journeyman",
      artistName: "Ninja Tune",
      duration: 398,
      url: "yt1",
      providerMetadata: {},
    };
    expect(scoreSourceCandidate(track, candidate, library, "ISAM")).toBeGreaterThanOrEqual(10);
  });

  it("rejects a same-title result with no artist or album evidence", () => {
    const { library, track } = fixture();
    const candidate: ExternalSearchResult = {
      externalId: "yt2",
      provider: "youtube",
      kind: "track",
      title: "Journeyman",
      artistName: "Unrelated Channel",
      duration: 398,
      url: "yt2",
      providerMetadata: {},
    };
    expect(scoreSourceCandidate(track, candidate, library, "ISAM")).toBe(-Infinity);
  });

  it("groups unresolved tracks into at most two YouTube OR searches", () => {
    const { library, track } = fixture();
    const tracks = Array.from({ length: 27 }, (_, index) => ({ ...track, id: `track_${index}`, title: `Track ${index + 1}` }));
    const batches = buildYouTubeFallbackBatches(tracks, library);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.tracks).toHaveLength(10);
    expect(batches[1]?.tracks).toHaveLength(10);
    expect(batches[0]?.query).toContain("Amon Tobin Track 1|Amon Tobin Track 2");
    expect(batches.flatMap((batch) => batch.tracks)).toHaveLength(20);
  });
});
