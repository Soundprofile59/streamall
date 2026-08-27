import type { CatalogArtist, CatalogReleaseDetail } from "./catalog";
import { normalizeText, streamallId } from "./library";
import { moodsForGenres, STREAMALL_MOODS } from "./mood-map";
import type { Album, Artist, LibrarySnapshot, Track } from "./types";

function entity<T extends object>(id: string, value: T, now: string) {
  return { id, revision: 1, createdAt: now, updatedAt: now, ...value };
}

function releaseYear(date?: string) {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : undefined;
}

function cleanGenres(values: string[]) {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const label = value.trim();
    if (!label) continue;
    const key = normalizeText(label);
    if (key && !byKey.has(key)) byKey.set(key, label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

function mergeGenres(left: string[], right: string[]) {
  return cleanGenres([...left, ...right]);
}

function mergeMoodRegistry(existing: string[]) {
  return [...STREAMALL_MOODS, ...existing.filter((mood) => !STREAMALL_MOODS.includes(mood as (typeof STREAMALL_MOODS)[number]))];
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
  const releaseGenres = cleanGenres(release.genres ?? []);
  const releaseMoods = moodsForGenres(releaseGenres, snapshot.settings.moodMap);

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

  let albumIndex = albums.findIndex(
    (candidate) => normalizeText(candidate.title) === normalizeText(release.title) && candidate.artistIds.includes(artist!.id),
  );
  let album = albumIndex >= 0 ? albums[albumIndex] : undefined;
  let albumCreated = false;
  let albumUpdated = false;

  if (!album) {
    album = entity<Pick<Album, "title" | "artistIds" | "artwork" | "year" | "favorite" | "genres">>(
      streamallId("album"),
      {
        title: release.title,
        artistIds: [artist.id],
        artwork: release.artwork,
        year: releaseYear(release.date),
        favorite: false,
        genres: releaseGenres,
      },
      now,
    );
    albums.push(album);
    albumIndex = albums.length - 1;
    albumCreated = true;
  } else if (releaseGenres.length) {
    const nextGenres = mergeGenres(album.genres ?? [], releaseGenres);
    if (nextGenres.join("\u0000") !== (album.genres ?? []).join("\u0000")) {
      album = { ...album, genres: nextGenres, revision: album.revision + 1, updatedAt: now };
      albums[albumIndex] = album;
      albumUpdated = true;
    }
  }

  let addedTracks = 0;
  let existingTracks = 0;
  let tracksUpdated = 0;

  for (const catalogTrack of release.tracks) {
    const trackNumber = Math.max(1, catalogTrack.position);
    const duplicateIndex = tracks.findIndex(
      (candidate) =>
        candidate.albumId === album!.id &&
        candidate.trackNumber === trackNumber &&
        normalizeText(candidate.title) === normalizeText(catalogTrack.title),
    );

    if (duplicateIndex >= 0) {
      existingTracks += 1;
      const duplicate = tracks[duplicateIndex]!;
      const nextGenres = releaseGenres.length ? mergeGenres(duplicate.genres, releaseGenres) : duplicate.genres;
      const nextMoods = duplicate.moods.length ? duplicate.moods : releaseMoods;
      if (nextGenres.join("\u0000") !== duplicate.genres.join("\u0000") || nextMoods.join("\u0000") !== duplicate.moods.join("\u0000")) {
        tracks[duplicateIndex] = { ...duplicate, genres: nextGenres, moods: nextMoods, revision: duplicate.revision + 1, updatedAt: now };
        tracksUpdated += 1;
      }
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
        genres: releaseGenres,
        moods: releaseMoods,
        favorite: false,
        frequencyPreference: "NORMAL",
        disabled: false,
      },
      now,
    );
    tracks.push(track);
    addedTracks += 1;
  }

  const genres = mergeGenres(snapshot.genres, releaseGenres);
  const moods = mergeMoodRegistry(snapshot.moods);
  const genresUpdated = genres.join("\u0000") !== snapshot.genres.join("\u0000");
  const moodsUpdated = moods.join("\u0000") !== snapshot.moods.join("\u0000");
  const changed = artistCreated || albumCreated || albumUpdated || addedTracks > 0 || tracksUpdated > 0 || genresUpdated || moodsUpdated;

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
          genres,
          moods,
        }
      : snapshot,
  };
}
