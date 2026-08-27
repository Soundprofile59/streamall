import type { Album, Artist, ExternalSearchResult, LibrarySnapshot, Mix, PlayableItem, Source, Track } from "./types";

export function streamallId(prefix: "artist" | "album" | "track" | "mix" | "source" | "history" | "queue") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const VERSION_MARKERS = /\b(live|remix|remaster(?:ed)?|radio edit|extended|instrumental|cover|acoustic|demo|edit|version)\b/i;

export type DuplicateAssessment = "EXACT" | "PROBABLE" | "POSSIBLE" | "NOT_SAME";

export function assessDuplicate(candidate: ExternalSearchResult, item: PlayableItem, artists: Artist[]): DuplicateAssessment {
  const titleA = normalizeText(candidate.title);
  const titleB = normalizeText(item.title);
  const artistNames = item.artistIds
    .map((id) => artists.find((artist) => artist.id === id)?.name ?? "")
    .map(normalizeText);
  const artistMatch = artistNames.includes(normalizeText(candidate.artistName));
  if (!artistMatch) return "NOT_SAME";
  if (titleA === titleB) return VERSION_MARKERS.test(candidate.title) === VERSION_MARKERS.test(item.title) ? "PROBABLE" : "POSSIBLE";
  if (titleA.includes(titleB) || titleB.includes(titleA)) return "POSSIBLE";
  return "NOT_SAME";
}

function nowEntity<T extends object>(id: string, value: T, now: string) {
  return { id, revision: 1, createdAt: now, updatedAt: now, ...value };
}

export function addExternalResult(snapshot: LibrarySnapshot, result: ExternalSearchResult): { snapshot: LibrarySnapshot; itemId: string } {
  const existingSource = snapshot.sources.find(
    (source) => source.provider === result.provider && source.providerId === result.externalId,
  );
  if (existingSource) return { snapshot, itemId: existingSource.playableItemId };

  const now = new Date().toISOString();
  const artistName = result.artistName.trim() || "Artiste inconnu";
  let artist = snapshot.artists.find((entry) => normalizeText(entry.name) === normalizeText(artistName));
  const artists = [...snapshot.artists];
  if (!artist) {
    artist = nowEntity<Pick<Artist, "name" | "disabled">>(streamallId("artist"), { name: artistName, disabled: false }, now);
    artists.push(artist);
  }

  let album: Album | undefined;
  const albums = [...snapshot.albums];
  if (result.kind === "track" && result.albumTitle) {
    album = albums.find(
      (entry) => normalizeText(entry.title) === normalizeText(result.albumTitle!) && entry.artistIds.includes(artist!.id),
    );
    if (!album) {
      album = nowEntity(streamallId("album"), { title: result.albumTitle, artistIds: [artist.id], artwork: result.artwork }, now);
      albums.push(album);
    }
  }

  const playable = nowEntity(
    streamallId(result.kind),
    {
      kind: result.kind,
      title: result.title,
      artistIds: [artist.id],
      duration: result.duration,
      artwork: result.artwork,
      genres: [],
      moods: [],
      favorite: false,
      frequencyPreference: "NORMAL" as const,
      disabled: false,
      ...(result.kind === "track" && album ? { albumId: album.id } : {}),
    },
    now,
  ) as Track | Mix;

  const source: Source = nowEntity(
    streamallId("source"),
    {
      playableItemId: playable.id,
      provider: result.provider,
      providerId: result.externalId,
      url: result.url,
      priority: snapshot.settings.providerPriority.indexOf(result.provider),
      userEnabled: true,
      healthStatus: "UNKNOWN",
      providerMetadata: result.providerMetadata,
      metadataFetchedAt: now,
      consecutiveFailures: 0,
    },
    now,
  );

  return {
    itemId: playable.id,
    snapshot: {
      ...snapshot,
      revision: snapshot.revision + 1,
      updatedAt: now,
      artists,
      albums,
      tracks: playable.kind === "track" ? [...snapshot.tracks, playable] : snapshot.tracks,
      mixes: playable.kind === "mix" ? [...snapshot.mixes, playable] : snapshot.mixes,
      sources: [...snapshot.sources, source],
    },
  };
}

export function attachExternalSource(snapshot: LibrarySnapshot, playableItemId: string, result: ExternalSearchResult): LibrarySnapshot {
  if (!allPlayable(snapshot).some((item) => item.id === playableItemId)) throw new Error("Playable item not found");
  if (snapshot.sources.some((source) => source.provider === result.provider && source.providerId === result.externalId)) return snapshot;
  const now = new Date().toISOString();
  const source: Source = nowEntity(
    streamallId("source"),
    {
      playableItemId,
      provider: result.provider,
      providerId: result.externalId,
      url: result.url,
      priority: snapshot.settings.providerPriority.indexOf(result.provider),
      userEnabled: true,
      healthStatus: "UNKNOWN",
      providerMetadata: result.providerMetadata,
      metadataFetchedAt: now,
      consecutiveFailures: 0,
    },
    now,
  );
  return { ...snapshot, revision: snapshot.revision + 1, updatedAt: now, sources: [...snapshot.sources, source] };
}

export function removeSource(snapshot: LibrarySnapshot, sourceId: string): LibrarySnapshot {
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: new Date().toISOString(),
    sources: snapshot.sources.filter((source) => source.id !== sourceId),
  };
}

export function deletePlayableItem(snapshot: LibrarySnapshot, playableItemId: string): LibrarySnapshot {
  const item = allPlayable(snapshot).find((candidate) => candidate.id === playableItemId);
  if (!item) return snapshot;

  const remainingTracks = snapshot.tracks.filter((track) => track.id !== playableItemId);
  const remainingMixes = snapshot.mixes.filter((mix) => mix.id !== playableItemId);
  const remainingPlayable = [...remainingTracks, ...remainingMixes];
  const usedArtistIds = new Set(remainingPlayable.flatMap((candidate) => candidate.artistIds));
  const usedAlbumIds = new Set(remainingTracks.flatMap((track) => (track.albumId ? [track.albumId] : [])));

  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: new Date().toISOString(),
    tracks: remainingTracks,
    mixes: remainingMixes,
    sources: snapshot.sources.filter((source) => source.playableItemId !== playableItemId),
    history: snapshot.history.filter((entry) => entry.itemId !== playableItemId),
    albums: snapshot.albums.filter((album) => usedAlbumIds.has(album.id)),
    artists: snapshot.artists.filter((artist) => usedArtistIds.has(artist.id)),
  };
}

export function allPlayable(snapshot: LibrarySnapshot): PlayableItem[] {
  return [...snapshot.tracks, ...snapshot.mixes];
}
