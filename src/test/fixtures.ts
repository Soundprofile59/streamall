import { emptyLibrary, type Album, type Artist, type LibrarySnapshot, type Source, type Track } from "@/domain/types";

const NOW = "2026-08-17T10:00:00.000Z";

function base(id: string) {
  return { id, revision: 1, createdAt: NOW, updatedAt: NOW };
}

export function libraryFixture(trackCount = 40): LibrarySnapshot {
  const snapshot = emptyLibrary(NOW);
  const artists: Artist[] = Array.from({ length: 10 }, (_, index) => ({ ...base(`artist_${index}`), name: `Artist ${index}`, disabled: false }));
  const albums: Album[] = Array.from({ length: 8 }, (_, index) => ({ ...base(`album_${index}`), title: `Album ${index}`, artistIds: [`artist_${index % 10}`] }));
  const tracks: Track[] = Array.from({ length: trackCount }, (_, index) => ({
    ...base(`track_${index}`),
    kind: "track",
    title: `Track ${index}`,
    artistIds: [`artist_${index % 10}`],
    albumId: `album_${index % 8}`,
    duration: 180 + index,
    genres: [index % 2 ? "Dub" : "Jazz"],
    moods: [index % 3 ? "Groovy" : "Zen"],
    energy: (index % 5) + 1,
    favorite: false,
    frequencyPreference: index === 0 ? "MORE" : index === 1 ? "LESS" : "NORMAL",
    disabled: false,
  }));
  const sources: Source[] = tracks.map((track, index) => ({
    ...base(`source_${index}`),
    playableItemId: track.id,
    provider: index % 2 ? "jamendo" : "audius",
    providerId: `provider_${index}`,
    url: `https://example.test/audio/${index}`,
    priority: index % 2,
    userEnabled: true,
    healthStatus: "VALID",
    providerMetadata: {},
    consecutiveFailures: 0,
  }));
  return { ...snapshot, artists, albums, tracks, sources };
}

export function sourceFixture(id: string, itemId = "track_0"): Source {
  return {
    ...base(id),
    playableItemId: itemId,
    provider: "jamendo",
    providerId: id,
    url: `https://example.test/${id}`,
    priority: Number(id.at(-1) ?? 0),
    userEnabled: true,
    healthStatus: "VALID",
    providerMetadata: {},
    consecutiveFailures: 0,
  };
}
