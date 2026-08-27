import { describe, expect, it } from "vitest";
import { deleteAlbum, updateAlbumMetadata } from "./albums";
import { emptyLibrary } from "./types";

function sampleLibrary() {
  const base = emptyLibrary("2026-08-25T00:00:00.000Z");
  const artist = { id: "artist_a", revision: 1, createdAt: base.updatedAt, updatedAt: base.updatedAt, name: "Amon Tobin", disabled: false };
  const album = { id: "album_a", revision: 1, createdAt: base.updatedAt, updatedAt: base.updatedAt, title: "ISAM", artistIds: [artist.id], year: 2011 };
  const track = {
    id: "track_a",
    revision: 1,
    createdAt: base.updatedAt,
    updatedAt: base.updatedAt,
    kind: "track" as const,
    title: "Journeyman",
    artistIds: [artist.id],
    albumId: album.id,
    trackNumber: 1,
    duration: 398,
    genres: [],
    moods: [],
    favorite: false,
    frequencyPreference: "NORMAL" as const,
    disabled: false,
  };
  const source = {
    id: "source_a",
    revision: 1,
    createdAt: base.updatedAt,
    updatedAt: base.updatedAt,
    playableItemId: track.id,
    provider: "youtube" as const,
    providerId: "yt1",
    url: "yt1",
    priority: 0,
    userEnabled: true,
    healthStatus: "UNKNOWN" as const,
    providerMetadata: {},
    consecutiveFailures: 0,
  };
  return { ...base, artists: [artist], albums: [album], tracks: [track], sources: [source] };
}

describe("album operations", () => {
  it("updates editable album metadata without touching tracks", () => {
    const library = sampleLibrary();
    const updated = updateAlbumMetadata(library, "album_a", { title: "ISAM Deluxe", year: 2012 });
    expect(updated.albums[0]?.title).toBe("ISAM Deluxe");
    expect(updated.albums[0]?.year).toBe(2012);
    expect(updated.tracks).toEqual(library.tracks);
  });

  it("deletes an album with its tracks, sources and now-orphan artist", () => {
    const library = sampleLibrary();
    const result = deleteAlbum(library, "album_a");
    expect(result.deletedTracks).toBe(1);
    expect(result.deletedSources).toBe(1);
    expect(result.snapshot.albums).toHaveLength(0);
    expect(result.snapshot.tracks).toHaveLength(0);
    expect(result.snapshot.sources).toHaveLength(0);
    expect(result.snapshot.artists).toHaveLength(0);
  });
});
