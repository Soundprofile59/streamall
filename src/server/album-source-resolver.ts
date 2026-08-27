import { normalizeText, streamallId } from "@/domain/library";
import type { ExternalSearchResult, LibrarySnapshot, Source, Track } from "@/domain/types";
import { searchProviders } from "@/server/providers";

const VERSION_MARKERS = /\b(live|remix|remaster(?:ed)?|radio edit|extended|instrumental|cover|acoustic|demo|edit|version)\b/i;
const MATCH_THRESHOLD = 10;
const FALLBACK_CONCURRENCY = 4;

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

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await operation(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function resolveAlbumSources(snapshot: LibrarySnapshot, albumId: string) {
  const album = snapshot.albums.find((candidate) => candidate.id === albumId);
  if (!album) throw new Error("Album not found");

  const tracks = snapshot.tracks.filter((track) => track.albumId === albumId);
  const albumArtists = album.artistIds
    .map((id) => snapshot.artists.find((artist) => artist.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const query = `${albumArtists.join(" ")} ${album.title}`.trim();
  const searched = await searchProviders(query, ["youtube", "audius", "jamendo"]);
  const candidates = searched.results.filter((result) => result.kind === "track");

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

  // First pass: one album-level provider search. This is cheap and often resolves
  // most of a release in one request per provider.
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

  // Second pass: unresolved tracks get their own exact YouTube query. Album-level
  // searches do not reliably surface every song, especially on long albums. A
  // direct artist + title query greatly improves coverage while the conservative
  // scorer still rejects obviously wrong versions.
  const unresolved = tracks.filter((track) => !alreadyPlayableIds.has(track.id) && !matchedTrackIds.has(track.id));
  const fallbackResults = await mapWithConcurrency(unresolved, FALLBACK_CONCURRENCY, async (track) => {
    const names = artistNames(track, snapshot);
    const directQuery = `${names.join(" ")} ${track.title}`.trim();
    const result = await searchProviders(directQuery, ["youtube"]);
    return { track, result };
  });

  const fallbackProviderStatuses = [] as typeof searched.providers;
  let fallbackCandidateCount = 0;
  for (const { track, result } of fallbackResults) {
    fallbackCandidateCount += result.results.length;
    fallbackProviderStatuses.push(...result.providers);
    const matches = bestCandidatesForTrack(track, result.results, snapshot, album.title, reservedProviderIds);
    const best = matches[0];
    if (!best) continue;
    const providerKey = `${best.candidate.provider}:${best.candidate.externalId}`;
    usedProviderIds.add(providerKey);
    reservedProviderIds.add(providerKey);
    additions.push(makeSource(snapshot, track.id, best.candidate, best.score, now));
    matchedTrackIds.add(track.id);
  }

  const coveredTracks = alreadyPlayableIds.size + matchedTrackIds.size;
  const unresolvedTracks = Math.max(0, tracks.length - coveredTracks);

  if (!additions.length) {
    return {
      snapshot,
      addedSources: 0,
      matchedTracks: 0,
      coveredTracks,
      unresolvedTracks,
      totalTracks: tracks.length,
      searchedCandidates: candidates.length + fallbackCandidateCount,
      providers: [...searched.providers, ...fallbackProviderStatuses],
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
    searchedCandidates: candidates.length + fallbackCandidateCount,
    providers: [...searched.providers, ...fallbackProviderStatuses],
  };
}
