import { normalizeText, streamallId } from "@/domain/library";
import type { ExternalSearchResult, LibrarySnapshot, Source, Track } from "@/domain/types";
import { searchProviders, searchYouTube, type ProviderSearchStatus, type SearchResponse } from "@/server/providers";

const VERSION_MARKERS = /\b(live|remix|remaster(?:ed)?|radio edit|extended|instrumental|cover|acoustic|demo|edit|version)\b/i;
const MATCH_THRESHOLD = 10;
const YOUTUBE_WIDE_RESULTS = 50;
const YOUTUBE_TARGETED_RESULTS = 12;
const YOUTUBE_BATCH_TRACKS = 10;
const YOUTUBE_MAX_FALLBACK_BATCHES = 2;
const DEFAULT_YOUTUBE_SEARCH_CALLS = 3;
const MAX_YOUTUBE_SEARCH_CALLS_PER_ALBUM = 20;

type ResolveAlbumSourceOptions = {
  maxYouTubeSearchCalls?: number;
};

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

async function safeYouTubeSearch(query: string, maxResults = YOUTUBE_WIDE_RESULTS): Promise<SearchResponse> {
  try {
    return await searchYouTube(query, maxResults);
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

function youtubeQuotaError(status: ProviderSearchStatus) {
  return status.provider === "youtube" && status.status === "ERROR" && /403|quota/i.test(status.message ?? "");
}

function clampYouTubeBudget(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_YOUTUBE_SEARCH_CALLS;
  return Math.max(1, Math.min(MAX_YOUTUBE_SEARCH_CALLS_PER_ALBUM, Math.floor(value as number)));
}

function addBestMatch(
  track: Track,
  results: ExternalSearchResult[],
  snapshot: LibrarySnapshot,
  albumTitle: string,
  reservedProviderIds: Set<string>,
  usedProviderIds: Set<string>,
  additions: Source[],
  matchedTrackIds: Set<string>,
  now: string,
) {
  const matches = bestCandidatesForTrack(track, results, snapshot, albumTitle, reservedProviderIds);
  const best = matches[0];
  if (!best) return false;
  const providerKey = `${best.candidate.provider}:${best.candidate.externalId}`;
  usedProviderIds.add(providerKey);
  reservedProviderIds.add(providerKey);
  additions.push(makeSource(snapshot, track.id, best.candidate, best.score, now));
  matchedTrackIds.add(track.id);
  return true;
}

export async function resolveAlbumSources(snapshot: LibrarySnapshot, albumId: string, options: ResolveAlbumSourceOptions = {}) {
  const album = snapshot.albums.find((candidate) => candidate.id === albumId);
  if (!album) throw new Error("Album not found");

  const tracks = snapshot.tracks.filter((track) => track.albumId === albumId);
  const albumArtists = album.artistIds
    .map((id) => snapshot.artists.find((artist) => artist.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const query = `${albumArtists.join(" ")} ${album.title}`.trim();
  const maxYouTubeSearchCalls = clampYouTubeBudget(options.maxYouTubeSearchCalls);
  let youtubeSearchCalls = 0;

  // Start with one wide album-level search. The repair agent can then spend
  // more of its daily budget on targeted leftovers instead of stopping after
  // the old three broad queries.
  youtubeSearchCalls += 1;
  const [otherProviders, youtubeAlbum] = await Promise.all([
    searchProviders(query, ["audius", "jamendo"]),
    safeYouTubeSearch(query),
  ]);
  const candidates = [...otherProviders.results, ...youtubeAlbum.results].filter((result) => result.kind === "track");

  const existingProviderIds = new Set(snapshot.sources.map((source) => `${source.provider}:${source.providerId}`));
  const usedProviderIds = new Set<string>();
  const reservedProviderIds = new Set([...existingProviderIds, ...usedProviderIds]);
  const additions: Source[] = [];
  const matchedTrackIds = new Set<string>();
  const alreadyPlayableIds = new Set(
    tracks
      .filter((track) => snapshot.sources.some((source) => source.playableItemId === track.id && source.userEnabled))
      .map((track) => track.id),
  );
  const now = new Date().toISOString();

  for (const track of tracks) {
    if (alreadyPlayableIds.has(track.id)) continue;
    const matches = bestCandidatesForTrack(track, candidates, snapshot, album.title, reservedProviderIds);
    for (const { candidate, score } of matches) {
      const providerKey = `${candidate.provider}:${candidate.externalId}`;
      usedProviderIds.add(providerKey);
      reservedProviderIds.add(providerKey);
      additions.push(makeSource(snapshot, track.id, candidate, score, now));
      matchedTrackIds.add(track.id);
    }
  }

  const youtubeStatuses: ProviderSearchStatus[] = [youtubeAlbum.status];
  let fallbackCandidateCount = 0;
  let quotaReached = youtubeQuotaError(youtubeAlbum.status);

  // Keep the two inexpensive OR passes first because a single result page can
  // still resolve several titles at once.
  const unresolvedAfterAlbum = tracks.filter((track) => !alreadyPlayableIds.has(track.id) && !matchedTrackIds.has(track.id));
  const fallbackBatches = buildYouTubeFallbackBatches(unresolvedAfterAlbum, snapshot)
    .slice(0, Math.max(0, maxYouTubeSearchCalls - youtubeSearchCalls));

  for (const batch of fallbackBatches) {
    if (quotaReached || youtubeSearchCalls >= maxYouTubeSearchCalls) break;
    youtubeSearchCalls += 1;
    const result = await safeYouTubeSearch(batch.query);
    fallbackCandidateCount += result.results.length;
    youtubeStatuses.push(result.status);
    quotaReached = youtubeQuotaError(result.status);
    for (const track of batch.tracks) {
      if (matchedTrackIds.has(track.id)) continue;
      addBestMatch(track, result.results, snapshot, album.title, reservedProviderIds, usedProviderIds, additions, matchedTrackIds, now);
    }
  }

  // Targeted repair is the high-recall fallback. Once the cheap album/grouped
  // searches have done what they can, spend the remaining explicit budget on
  // one artist+title query per unresolved track. This is what makes the daily
  // 100-search allowance useful for actually filling holes in the library.
  const targetedStatuses: ProviderSearchStatus[] = [];
  let targetedCandidateCount = 0;
  const unresolvedAfterBatches = tracks.filter((track) => !alreadyPlayableIds.has(track.id) && !matchedTrackIds.has(track.id));
  for (const track of unresolvedAfterBatches) {
    if (quotaReached || youtubeSearchCalls >= maxYouTubeSearchCalls) break;
    const artists = artistNames(track, snapshot).join(" ").trim();
    const targetedQuery = `${artists} ${track.title}`.trim();
    if (!targetedQuery) continue;
    youtubeSearchCalls += 1;
    const result = await safeYouTubeSearch(targetedQuery, YOUTUBE_TARGETED_RESULTS);
    targetedCandidateCount += result.results.length;
    targetedStatuses.push(result.status);
    quotaReached = youtubeQuotaError(result.status);
    addBestMatch(track, result.results, snapshot, album.title, reservedProviderIds, usedProviderIds, additions, matchedTrackIds, now);
  }

  const coveredTracks = alreadyPlayableIds.size + matchedTrackIds.size;
  const unresolvedTracks = Math.max(0, tracks.length - coveredTracks);
  const providers = [...otherProviders.providers, ...youtubeStatuses, ...targetedStatuses];
  const searchedCandidates = candidates.length + fallbackCandidateCount + targetedCandidateCount;

  if (!additions.length) {
    return {
      snapshot,
      addedSources: 0,
      matchedTracks: 0,
      coveredTracks,
      unresolvedTracks,
      totalTracks: tracks.length,
      searchedCandidates,
      youtubeSearchCalls,
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
    unresolvedTracks,
    totalTracks: tracks.length,
    searchedCandidates,
    youtubeSearchCalls,
    providers,
  };
}
