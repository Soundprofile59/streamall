import { allPlayable } from "./library";
import type { Album, LibrarySnapshot } from "./types";

export type AlbumMetadataPatch = {
  title?: string;
  year?: number;
  rating?: number | null;
};

export function updateAlbumMetadata(snapshot: LibrarySnapshot, albumId: string, patch: AlbumMetadataPatch): LibrarySnapshot {
  const album = snapshot.albums.find((candidate) => candidate.id === albumId);
  if (!album) return snapshot;

  const now = new Date().toISOString();
  const title = patch.title?.trim();
  const albums = snapshot.albums.map((candidate) =>
    candidate.id === albumId
      ? {
          ...candidate,
          ...(title ? { title } : {}),
          ...(patch.year !== undefined ? { year: patch.year } : {}),
          ...(patch.rating !== undefined ? { rating: patch.rating ?? undefined, favorite: false } : {}),
          revision: candidate.revision + 1,
          updatedAt: now,
        }
      : candidate,
  );

  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: now,
    albums,
  };
}

export type DeleteAlbumResult = {
  snapshot: LibrarySnapshot;
  deletedAlbum?: Album;
  deletedTracks: number;
  deletedSources: number;
};

export function deleteAlbum(snapshot: LibrarySnapshot, albumId: string): DeleteAlbumResult {
  const album = snapshot.albums.find((candidate) => candidate.id === albumId);
  if (!album) return { snapshot, deletedTracks: 0, deletedSources: 0 };

  const deletedTrackIds = new Set(snapshot.tracks.filter((track) => track.albumId === albumId).map((track) => track.id));
  const deletedSources = snapshot.sources.filter((source) => deletedTrackIds.has(source.playableItemId)).length;
  const remainingTracks = snapshot.tracks.filter((track) => !deletedTrackIds.has(track.id));
  const remainingAlbums = snapshot.albums.filter((candidate) => candidate.id !== albumId);
  const remainingMixes = snapshot.mixes;

  const usedArtistIds = new Set<string>();
  for (const item of [...remainingTracks, ...remainingMixes]) {
    for (const artistId of item.artistIds) usedArtistIds.add(artistId);
  }
  for (const remainingAlbum of remainingAlbums) {
    for (const artistId of remainingAlbum.artistIds) usedArtistIds.add(artistId);
  }

  const now = new Date().toISOString();
  const next: LibrarySnapshot = {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: now,
    albums: remainingAlbums,
    tracks: remainingTracks,
    sources: snapshot.sources.filter((source) => !deletedTrackIds.has(source.playableItemId)),
    history: snapshot.history.filter((entry) => !deletedTrackIds.has(entry.itemId)),
    artists: snapshot.artists.filter((artist) => usedArtistIds.has(artist.id)),
  };

  // Defensive invariant: no orphan source survives a destructive album deletion.
  const playableIds = new Set(allPlayable(next).map((item) => item.id));
  next.sources = next.sources.filter((source) => playableIds.has(source.playableItemId));

  return {
    snapshot: next,
    deletedAlbum: album,
    deletedTracks: deletedTrackIds.size,
    deletedSources,
  };
}
