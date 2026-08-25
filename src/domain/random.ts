import { allPlayable, streamallId } from "./library";
import type {
  HistoryEntry,
  LibrarySnapshot,
  PlayableItem,
  QueueEntry,
  RandomDiagnostic,
  RandomFilters,
  RandomSettings,
} from "./types";

export type RandomNumberGenerator = () => number;

export function seededRandom(seed: number): RandomNumberGenerator {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function matchesFilters(item: PlayableItem, filters: RandomFilters) {
  if (filters.kinds?.length && !filters.kinds.includes(item.kind)) return false;
  if (filters.genres?.length && !filters.genres.some((genre) => item.genres.includes(genre))) return false;
  if (filters.moods?.length && !filters.moods.some((mood) => item.moods.includes(mood))) return false;
  if (filters.energyMin !== undefined && (item.energy === undefined || item.energy < filters.energyMin)) return false;
  if (filters.energyMax !== undefined && (item.energy === undefined || item.energy > filters.energyMax)) return false;
  return true;
}

function hardCandidates(snapshot: LibrarySnapshot, filters: RandomFilters) {
  const disabledArtists = new Set(snapshot.artists.filter((artist) => artist.disabled).map((artist) => artist.id));
  const playableIds = new Set(
    snapshot.sources
      .filter((source) => source.userEnabled && !["UNAVAILABLE", "BLOCKED"].includes(source.healthStatus))
      .map((source) => source.playableItemId),
  );
  return allPlayable(snapshot).filter(
    (item) =>
      !item.disabled &&
      !item.artistIds.some((id) => disabledArtists.has(id)) &&
      playableIds.has(item.id) &&
      matchesFilters(item, filters),
  );
}

function recentIds(history: HistoryEntry[], count: number) {
  return history
    .filter((entry) => entry.outcome !== "FAILED")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, count)
    .map((entry) => entry.itemId);
}

function applySoftExclusions(
  candidates: PlayableItem[],
  snapshot: LibrarySnapshot,
  settings: RandomSettings,
  level: RandomDiagnostic["relaxation"],
) {
  const recentTracks = new Set(recentIds(snapshot.history, settings.recentTrackWindow));
  const itemById = new Map(allPlayable(snapshot).map((item) => [item.id, item]));
  const recentArtistIds = new Set(
    recentIds(snapshot.history, settings.recentArtistWindow).flatMap((id) => itemById.get(id)?.artistIds ?? []),
  );
  const recentAlbumIds = new Set(
    recentIds(snapshot.history, settings.recentAlbumWindow)
      .map((id) => itemById.get(id))
      .filter((item): item is Extract<PlayableItem, { kind: "track" }> => item?.kind === "track")
      .flatMap((item) => (item.albumId ? [item.albumId] : [])),
  );

  return candidates.filter((item) => {
    if (level !== "TRACK" && recentTracks.has(item.id)) return false;
    if (level === "NONE" || level === "ALBUM") {
      if (item.artistIds.some((id) => recentArtistIds.has(id))) return false;
    }
    if (level === "NONE" && item.kind === "track" && item.albumId && recentAlbumIds.has(item.albumId)) return false;
    return true;
  });
}

function snapshotReferenceTime(snapshot: LibrarySnapshot) {
  return Math.max(
    Date.parse(snapshot.updatedAt) || 0,
    ...snapshot.history.map((entry) => Date.parse(entry.startedAt) || 0),
  );
}

export function starRatingWeight(rating?: number) {
  if (rating === undefined) return 1;
  return ({ 1: 0.18, 2: 0.5, 3: 1, 4: 1.7, 5: 2.7 } as Record<number, number>)[rating] ?? 1;
}

function preferenceWeight(item: PlayableItem) {
  if (item.rating !== undefined) return starRatingWeight(item.rating);

  // Backward compatibility for libraries created before star ratings.
  let legacy = 1;
  if (item.favorite) legacy *= 1.4;
  if (item.frequencyPreference === "MORE") legacy *= 2;
  if (item.frequencyPreference === "LESS") legacy *= 0.45;
  return legacy;
}

function itemWeight(
  item: PlayableItem,
  snapshot: LibrarySnapshot,
  settings: RandomSettings,
  referenceTime: number,
) {
  let weight = preferenceWeight(item);
  if (item.kind === "mix") {
    weight *= { NEVER: 0, RARE: 0.18, NORMAL: 0.65, FREQUENT: 1.25 }[settings.mixFrequency];
    if (item.duration && item.duration > 5400) weight *= 0.55;
  }

  const plays = snapshot.history.filter((entry) => entry.itemId === item.id && entry.outcome !== "FAILED");
  if (plays.length === 0) weight *= 1 + settings.rediscoveryStrength * 1.5;
  else {
    const lastPlayed = Math.max(...plays.map((entry) => Date.parse(entry.startedAt)));
    const days = Math.max(0, (referenceTime - lastPlayed) / 86_400_000);
    weight *= 1 + Math.min(2, days / 90) * settings.rediscoveryStrength * 0.45;
    weight /= 1 + Math.log2(plays.length + 1) * 0.12;
  }
  return Math.max(0, weight);
}

function weightedPick(items: PlayableItem[], weights: number[], rng: RandomNumberGenerator) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return undefined;
  let cursor = rng() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index] ?? 0;
    if (cursor <= 0) return items[index];
  }
  return items.at(-1);
}

export function selectRandomItem(
  snapshot: LibrarySnapshot,
  filters: RandomFilters = {},
  seed = Date.now(),
): { item?: PlayableItem; diagnostic: RandomDiagnostic } {
  const candidates = hardCandidates(snapshot, filters);
  const referenceTime = snapshotReferenceTime(snapshot);
  if (!candidates.length) {
    return { diagnostic: { seed, candidateCount: 0, relaxation: "NONE", reason: "NO_HARD_CANDIDATE" } };
  }

  for (const relaxation of ["NONE", "ALBUM", "ARTIST", "TRACK"] as const) {
    const allowed = applySoftExclusions(candidates, snapshot, snapshot.settings.random, relaxation);
    const item = weightedPick(
      allowed,
      allowed.map((candidate) => itemWeight(candidate, snapshot, snapshot.settings.random, referenceTime)),
      seededRandom(seed),
    );
    if (item) {
      return {
        item,
        diagnostic: { seed, candidateCount: candidates.length, selectedId: item.id, relaxation },
      };
    }
  }
  return { diagnostic: { seed, candidateCount: candidates.length, relaxation: "TRACK", reason: "ZERO_WEIGHT" } };
}

export function generateRandomQueue(
  snapshot: LibrarySnapshot,
  filters: RandomFilters = {},
  seed = Date.now(),
  size = snapshot.settings.random.queueTarget,
): { entries: QueueEntry[]; diagnostics: RandomDiagnostic[] } {
  const working = structuredClone(snapshot);
  const referenceTime = snapshotReferenceTime(snapshot);
  const entries: QueueEntry[] = [];
  const diagnostics: RandomDiagnostic[] = [];
  for (let index = 0; index < size; index += 1) {
    const result = selectRandomItem(working, filters, seed + index * 104729);
    diagnostics.push(result.diagnostic);
    if (!result.item) break;
    entries.push({
      id: streamallId("queue"),
      itemId: result.item.id,
      generatedAt: new Date(referenceTime + index).toISOString(),
      reason: "RANDOM",
    });
    working.history.push({
      id: `simulation_${index}`,
      revision: 0,
      createdAt: new Date(referenceTime + index).toISOString(),
      updatedAt: new Date(referenceTime + index).toISOString(),
      playSessionId: `simulation_${seed}`,
      itemId: result.item.id,
      itemKind: result.item.kind,
      startedAt: new Date(referenceTime + index).toISOString(),
      outcome: "STOPPED",
    });
  }
  return { entries, diagnostics };
}
