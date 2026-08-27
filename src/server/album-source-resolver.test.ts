import { describe, expect, it } from "vitest";
import { emptyLibrary, type ExternalSearchResult, type Track } from "@/domain/types";
import { scoreSourceCandidate } from "./album-source-resolver";

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
});
