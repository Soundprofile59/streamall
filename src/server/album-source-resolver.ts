import { normalizeText, streamallId } from "@/domain/library";
import type { ExternalSearchResult, LibrarySnapshot, Source, Track } from "@/domain/types";
import {
  searchProviders,
  searchYouTube,
  searchYouTubeMusicCatalog,
  type ProviderSearchStatus,
  type SearchResponse,
} from "@/server/providers";

const VERSION_MARKERS = /\b(live|remix|remaster(?:ed)?|radio edit|extended|instrumental|cover|acoustic|demo|edit|version)\b/i;
const MATCH_THRESHOLD = 10;
const YOUTUBE_WIDE_RESULTS = 50;
const YOUTUBE_BATCH_TRACKS = 10;
const YOUTUBE_MAX_FALLBACK_BATCHES = 2;
const YTMUSIC_TRACK_RESULTS = 8;
const YTMUSIC_PARALLEL_SEARCHES = 6;
const BAD_SOURCE_HEALTH = new Set(["TEMPORARILY_UNAVAILABLE", "UNAVAILABLE", "BLOCKED"]);

function tokenSet(value: string) {
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 1));
}

function overlap(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.max(left.size, right.size);
}

function artistNames(track: Track, snapshot: LibrarySnapshot) {
  return track.artistIds
    .map((id) => snapshot.artists.find((artist) => artist.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function sourceIsPlayable(source: Source) {
  return source.userEnabled && !BAD_SOURCE_HEALTH.has(source.healthStatus);
}

export function scoreSourceCandidate(track: Track, candidate: ExternalSearchResult, snapshot: LibrarySnapshot, albumTitle?: string) {
  if (candidate.kind !== "track") return -Infinity;
  const trackTitle = normalizeText(track.title);
  const candidateTitle = normalizeText(candidate.title);
  if (!trackTitle || !candidateTitle) return -Infinity;

  let score = 0;
  if (candidateTitle === trackTitle) score += 10;
  else if (candidateTitle.includes(trackTitle)) score += 7;
  else if (trackTitle.includes(candidateTitle) && candidateTitle.length >= 5) score += 5;
  else {
    const titleOverlap = overlap(track.title, candidate.title);
    if (titleOverlap >= 0.8) score += 5;
    else if (titleOverlap >= 0.6) score += 3;
    else return -Infinity;
  }

  const artists = artistNames(track, snapshot).map(normalizeText).filter(Boolean);
  const candidateArtist = normalizeText(candidate.artistName);
  const artistEvidence = artists.some((artist) =>
    candidateArtist === artist || candidateArtist.includes(artist) || artist.includes(candidateArtist) || candidateTitle.includes(artist),
  );
  if (artistEvidence) score += 5;

  const normalizedAlbum = albumTitle ? normalizeText(albumTitle) : "";
  const candidateAlbum = normalizeText(candidate.albumTitle ?? "");
  const albumEvidence = Boolean(normalizedAlbum && candidateAlbum && (candidateAlbum === normalizedAlbum || candidateAlbum.includes(normalizedAlbum) || normalizedAlbum.includes(candidateAlbum)));
  if (albumEvidence) score += 3;

  if (!artistEvidence && !albumEvidence) return -Infinity;

  if (track.duration && candidate.duration) {
    const delta = Math.abs(track.duration - candidate.duration);
    if (delta <= 5) score += 3;
    else if (delta <= 15) score += 2;
    else if (delta <= 30) score += 1;
    else if (delta > 90) score -= 4;
  }

  const trackHasVersion = VERSION_MARKERS.test(track.title);
  const candidateHasVersion = VERSION_MARKERS.test(candidate.title);
  if (trackHasVersion !== candidateHasVersion) score -= 3;

  return score;
}

function makeSource(snapshot: LibrarySnapshot, trackId: string, result: ExternalSearchResult, score: number, now: string): Source {
  return {
    id: streamallId("source"),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    playableItemId: trackId,
    provider: result.provider,
    providerId: result.externalId,
    url: result.url,
    priority: Math.max(0, snapshot.settings.providerPriority.indexOf(result.provider)),
    userEnabled: true,
    healthStatus: "UNKNOWN",
    providerMetadata: { ...result.providerMetadata, autoResolved: true, autoResolveScore: score },
    metadataFetchedAt: now,
    consecutiveFailures: 0,
  };
}

function bestCandidatesForTrack(
  track: Track,
  candidates: ExternalSearchResult[],
  snapshot: LibrarySnapshot,
  albumTitle: string,
  reservedProviderIds: Set<string>,
) {
  const byProvider = new Map<string, { candidate: ExternalSearchResult; score: number }>();
  for (const candidate of candidates) {
    const providerKey = `${candidate.provider}:${candidate.externalId}`;
    if (reservedProviderIds.has(providerKey)) continue;
    const score = scoreSourceCandidate(track, candidate, snapshot, albumTitle);
    if (!Number.isFinite(score) || score < MATCH_THRESHOLD) continue;
    const current = byProvider.get(candidate.provider);
    if (!current || score > current.score) byProvider.set(candidate.provider, { candidate, score });
  }
  return [...byProvider.values()].sort((a, b) => b.score - a.score);
}

function addMatches(
  track: Track,
  candidates: ExternalSearchResult[],
  snapshot: LibrarySnapshot,
  albumTitle: string,
  reservedProviderIds: Set<string>,
  additions: Source[],
  matchedTrackIds: Set<string>,
  now: string,
  onlyBest = false,
) {
  const matches = bestCandidatesForTrack(track, candidates, snapshot, albumTitle, reservedProviderIds);
  const selected = onlyBest ? matches.slice(0, 1) : matches;
  for (const { candidate, score } of selected) {
    const providerKey = `${candidate.provider}:${candidate.externalId}`;
    reservedProviderIds.add(providerKey);
    additions.push(makeSource(snapshot, track.id, candidate, score, now));
    matchedTrackIds.add(track.id);
  }
}

export function buildYouTubeFallbackBatches(tracks: Track[], snapshot: LibrarySnapshot) {
  const batches: Array<{ tracks: Track[]; query: string }> = [];
  for (let index = 0; index < tracks.length && batches.length < YOUTUBE_MAX_FALLBACK_BATCHES; index += YOUTUBE_BATCH_TRACKS) {
    const batchTracks = tracks.slice(index, index + YOUTUBE_BATCH_TRACKS);
    const terms = batchTracks.map((track) => {
      const artists = artistNames(track, snapshot).join(" ").trim();
      return `${artists} ${track.title}`.trim();
    }).filter(Boolean);
    if (terms.length) batches.push({ tracks: batchTracks, query: terms.join("|") });
  }
  return batches;
}

async function safeWideYouTubeSearch(query: string): Promise<SearchResponse> {
  try {
    return await searchYouTube(query, YOUTUBE_WIDE_RESULTS);
  } catch (error) {
    return {
      results: [],
      status: {
        provider: "youtube",
        status: "ERROR",
        message: error instanceof Error ? error.message : "Provider error",
      },
    };
  }
}

function unresolvedTracks(tracks: Track[], alreadyPlayableIds: Set<string>, matchedTrackIds: Set<string>) {
  return tracks.filter((track) => !alreadyPlayableIds.has(track.id) && !matchedTrackIds.has(track.id));
}

export async function resolveAlbumSources(snapshot: LibrarySnapshot, albumId: string) {
  const album = snapshot.albums.find((candidate) => candidate.id === albumId);
  if (!album) throw new Error("Album not found");

  const tracks = snapshot.tracks.filter((track) => track.albumId === albumId);
  const albumArtists = album.artistIds
    .map((id) => snapshot.artists.find((artist) => artist.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const query = `${albumArtists.join(" ")} ${album.title}`.trim();

  // Start with the public YouTube Music catalogue. This uses no expensive
  // search.list call. Audius/Jamendo remain parallel secondary candidates.
  const [otherProviders, youtubeMusicAlbum] = await Promise.all([
    searchProviders(query, ["audius", "jamendo"]),
    searchYouTubeMusicCatalog(query, 20),
  ]);
  const candidates = [...otherProviders.results, ...youtubeMusicAlbum.results].filter((result) => result.kind === "track");

  const existingProviderIds = new Set(snapshot.sources.map((source) => `${source.provider}:${source.providerId}`));
  const reservedProviderIds = new Set(existingProviderIds);
  const additions: Source[] = [];
  const matchedTrackIds = new Set<string>();
  const alreadyPlayableIds = new Set(
    tracks
      .filter((track) => snapshot.sources.some((source) => source.playableItemId === track.id && sourceIsPlayable(source)))
      .map((track) => track.id),
  );
  const now = new Date().toISOString();

  for (const track of tracks) {
    if (alreadyPlayableIds.has(track.id)) continue;
    addMatches(track, candidates, snapshot, album.title, reservedProviderIds, additions, matchedTrackIds, now);
  }

  // YouTube Music usually exposes the canonical Art Track for an exact
  // artist/title query even when a broad album search only returned a handful
  // of songs. Query unresolved tracks in small parallel batches. These calls do
  // not consume YouTube Data search.list quota; videos.list validation is cheap.
  const youtubeMusicTrackStatuses: ProviderSearchStatus[] = [];
  let youtubeMusicTrackCandidateCount = 0;
  const missingAfterAlbumSearch = unresolvedTracks(tracks, alreadyPlayableIds, matchedTrackIds);
  for (let index = 0; index < missingAfterAlbumSearch.length; index += YTMUSIC_PARALLEL_SEARCHES) {
    const batch = missingAfterAlbumSearch.slice(index, index + YTMUSIC_PARALLEL_SEARCHES);
    const searched = await Promise.all(batch.map(async (track) => {
      const trackQuery = `${artistNames(track, snapshot).join(" ")} ${track.title}`.trim();
      return { track, response: await searchYouTubeMusicCatalog(trackQuery, YTMUSIC_TRACK_RESULTS) };
    }));
    for (const { track, response } of searched) {
      youtubeMusicTrackStatuses.push(response.status);
      youtubeMusicTrackCandidateCount += response.results.length;
      if (matchedTrackIds.has(track.id)) continue;
      addMatches(track, response.results, snapshot, album.title, reservedProviderIds, additions, matchedTrackIds, now, true);
    }
  }

  // Only real gaps now spend search.list quota. At worst this remains the old
  // 1 album search + 2 OR batches, but successful YouTube Music lookup makes the
  // expensive path unnecessary for most releases.
  const classicStatuses: ProviderSearchStatus[] = [];
  let classicCandidateCount = 0;
  const missingBeforeClassic = unresolvedTracks(tracks, alreadyPlayableIds, matchedTrackIds);
  if (missingBeforeClassic.length) {
    const youtubeAlbum = await safeWideYouTubeSearch(query);
    classicStatuses.push(youtubeAlbum.status);
    classicCandidateCount += youtubeAlbum.results.length;
    for (const track of missingBeforeClassic) {
      addMatches(track, youtubeAlbum.results, snapshot, album.title, reservedProviderIds, additions, matchedTrackIds, now, true);
    }

    const remaining = unresolvedTracks(tracks, alreadyPlayableIds, matchedTrackIds);
    const fallbackBatches = buildYouTubeFallbackBatches(remaining, snapshot);
    for (const batch of fallbackBatches) {
      const result = await safeWideYouTubeSearch(batch.query);
      classicStatuses.push(result.status);
      classicCandidateCount += result.results.length;
      for (const track of batch.tracks) {
        if (matchedTrackIds.has(track.id)) continue;
        addMatches(track, result.results, snapshot, album.title, reservedProviderIds, additions, matchedTrackIds, now, true);
      }
    }
  }

  const coveredTracks = alreadyPlayableIds.size + matchedTrackIds.size;
  const remainingTracks = Math.max(0, tracks.length - coveredTracks);
  const providers = [
    ...otherProviders.providers,
    youtubeMusicAlbum.status,
    ...youtubeMusicTrackStatuses,
    ...classicStatuses,
  ];
  const searchedCandidates = candidates.length + youtubeMusicTrackCandidateCount + classicCandidateCount;

  if (!additions.length) {
    return {
      snapshot,
      addedSources: 0,
      matchedTracks: 0,
      coveredTracks,
      unresolvedTracks: remainingTracks,
      totalTracks: tracks.length,
      searchedCandidates,
      providers,
    };
  }

  return {
    snapshot: {
      ...snapshot,
      revision: snapshot.revision + 1,
      updatedAt: now,
      sources: [...snapshot.sources, ...additions],
    },
    addedSources: additions.length,
    matchedTracks: matchedTrackIds.size,
    coveredTracks,
    unresolvedTracks: remainingTracks,
    totalTracks: tracks.length,
    searchedCandidates,
    providers,
  };
}
