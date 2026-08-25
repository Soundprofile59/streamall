import type { CatalogArtist, CatalogReleaseDetail } from "./catalog";
import { normalizeText, streamallId } from "./library";
import type { Album, Artist, LibrarySnapshot, Track } from "./types";

function entity<T extends object>(id: string, value: T, now: string) {
  return { id, revision: 1, createdAt: now, updatedAt: now, ...value };
}

function releaseYear(date?: string) {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : undefined;
}

export interface CatalogImportResult {
  snapshot: LibrarySnapshot;
  albumId: string;
  artistCreated: boolean;
  albumCreated: boolean;
  addedTracks: number;
  existingTracks: number;
}

export function importCatalogRelease(
  snapshot: LibrarySnapshot,
  catalogArtist: CatalogArtist,
  release: CatalogReleaseDetail,
): CatalogImportResult {
  const now = new Date().toISOString();
  const artists = [...snapshot.artists];
  const albums = [...snapshot.albums];
  const tracks = [...snapshot.tracks];

  const artistName = catalogArtist.name.trim() || "Artiste inconnu";
  let artist = artists.find((candidate) => normalizeText(candidate.name) === normalizeText(artistName));
  let artistCreated = false;

  if (!artist) {
    artist = entity<Pick<Artist, "name" | "disabled">>(
      streamallId("artist"),
      { name: artistName, disabled: false },
      now,
    );
    artists.push(artist);
    artistCreated = true;
  }

  let album = albums.find(
    (candidate) => normalizeText(candidate.title) === normalizeText(release.title) && candidate.artistIds.includes(artist!.id),
  );
  let albumCreated = false;

  if (!album) {
    album = entity<Pick<Album, "title" | "artistIds" | "artwork" | "year">>(
      streamallId("album"),
      {
        title: release.title,
        artistIds: [artist.id],
        artwork: release.artwork,
        year: releaseYear(release.date),
      },
      now,
    );
    albums.push(album);
    albumCreated = true;
  }

  let addedTracks = 0;
  let existingTracks = 0;

  for (const catalogTrack of release.tracks) {
    const trackNumber = Math.max(1, catalogTrack.position);
    const duplicate = tracks.find(
      (candidate) =>
        candidate.albumId === album!.id &&
        candidate.trackNumber === trackNumber &&
        normalizeText(candidate.title) === normalizeText(catalogTrack.title),
    );

    if (duplicate) {
      existingTracks += 1;
      continue;
    }

    const trackArtist =
      normalizeText(catalogTrack.artistName) === normalizeText(artistName)
        ? artist
        : artists.find((candidate) => normalizeText(candidate.name) === normalizeText(catalogTrack.artistName));

    let resolvedTrackArtist = trackArtist;
    if (!resolvedTrackArtist) {
      resolvedTrackArtist = entity<Pick<Artist, "name" | "disabled">>(
        streamallId("artist"),
        { name: catalogTrack.artistName || artistName, disabled: false },
        now,
      );
      artists.push(resolvedTrackArtist);
    }

    const track = entity<Omit<Track, "id" | "revision" | "createdAt" | "updatedAt">>(
      streamallId("track"),
      {
        kind: "track",
        title: catalogTrack.title,
        artistIds: [resolvedTrackArtist.id],
        albumId: album.id,
        trackNumber,
        duration: catalogTrack.lengthMs ? catalogTrack.lengthMs / 1000 : undefined,
        artwork: release.artwork,
        genres: [],
        moods: [],
        favorite: false,
        frequencyPreference: "NORMAL",
        disabled: false,
      },
      now,
    );
    tracks.push(track);
    addedTracks += 1;
  }

  const changed = artistCreated || albumCreated || addedTracks > 0;
  return {
    albumId: album.id,
    artistCreated,
    albumCreated,
    addedTracks,
    existingTracks,
    snapshot: changed
      ? {
          ...snapshot,
          revision: snapshot.revision + 1,
          updatedAt: now,
          artists,
          albums,
          tracks,
        }
      : snapshot,
  };
}
