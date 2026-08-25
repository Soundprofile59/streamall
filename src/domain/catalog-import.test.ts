import { describe, expect, it } from "vitest";
import { importCatalogRelease } from "./catalog-import";
import { emptyLibrary } from "./types";

const artist = { id: "mb-artist-1", name: "Amon Tobin" };
const release = {
  releaseGroupId: "mb-rg-1",
  releaseId: "mb-release-1",
  title: "Permutation",
  date: "1998-06-01",
  artwork: "https://example.com/cover.jpg",
  genres: ["Electronic", "Trip hop"],
  tracks: [
    { position: 1, number: "1", title: "Like Regular Chickens", artistName: "Amon Tobin", lengthMs: 300_000 },
    { position: 2, number: "2", title: "Bridge", artistName: "Amon Tobin", lengthMs: 240_000 },
  ],
};

describe("importCatalogRelease", () => {
  it("creates an artist, album and unresolved canonical tracks with catalog genres", () => {
    const result = importCatalogRelease(emptyLibrary("2026-08-25T00:00:00.000Z"), artist, release);
    expect(result.artistCreated).toBe(true);
    expect(result.albumCreated).toBe(true);
    expect(result.addedTracks).toBe(2);
    expect(result.snapshot.artists).toHaveLength(1);
    expect(result.snapshot.albums).toHaveLength(1);
    expect(result.snapshot.tracks).toHaveLength(2);
    expect(result.snapshot.sources).toHaveLength(0);
    expect(result.snapshot.tracks[0]?.albumId).toBe(result.albumId);
    expect(result.snapshot.tracks[0]?.duration).toBe(300);
    expect(result.snapshot.albums[0]?.genres).toEqual(["Electronic", "Trip hop"]);
    expect(result.snapshot.tracks[0]?.genres).toEqual(["Electronic", "Trip hop"]);
    expect(result.snapshot.genres).toEqual(["Electronic", "Trip hop"]);
  });

  it("is duplicate-safe when the same album is imported twice", () => {
    const first = importCatalogRelease(emptyLibrary("2026-08-25T00:00:00.000Z"), artist, release);
    const second = importCatalogRelease(first.snapshot, artist, release);
    expect(second.albumCreated).toBe(false);
    expect(second.addedTracks).toBe(0);
    expect(second.existingTracks).toBe(2);
    expect(second.snapshot).toBe(first.snapshot);
  });
});
