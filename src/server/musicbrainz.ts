import type { CatalogArtist, CatalogReleaseDetail, CatalogReleaseGroup, CatalogTrack } from "@/domain/catalog";

const API_ROOT = "https://musicbrainz.org/ws/2/";
const USER_AGENT = "Streamall/0.5 (https://github.com/Soundprofile59/streamall)";
const MIN_INTERVAL_MS = 1_050;

type CacheEntry = { expiresAt: number; value: unknown };
const cache = new Map<string, CacheEntry>();

let requestTail: Promise<void> = Promise.resolve();
let lastRequestStartedAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pacedFetchJson<T>(url: string): Promise<T> {
  const previous = requestTail;
  let release!: () => void;
  requestTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;

  try {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestStartedAt));
    if (wait) await sleep(wait);
    lastRequestStartedAt = Date.now();

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(9_000),
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}`);
    return response.json() as Promise<T>;
  } finally {
    release();
  }
}

async function cached<T>(key: string, ttlMs: number, operation: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await operation();
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

function artistCreditName(credit?: Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>) {
  if (!credit?.length) return undefined;
  return credit.map((entry) => `${entry.name ?? entry.artist?.name ?? ""}${entry.joinphrase ?? ""}`).join("").trim() || undefined;
}

function coverArtForReleaseGroup(releaseGroupId: string) {
  return `https://coverartarchive.org/release-group/${encodeURIComponent(releaseGroupId)}/front-250`;
}

function genreNames(genres?: Array<{ name?: string; count?: number }>) {
  return [...new Set(
    (genres ?? [])
      .filter((genre) => (genre.count ?? 0) >= 0)
      .map((genre) => genre.name?.trim())
      .filter((name): name is string => Boolean(name)),
  )].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

export async function searchCatalogArtists(query: string): Promise<CatalogArtist[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  return cached(`artist:${normalized.toLocaleLowerCase()}`, 12 * 60 * 60_000, async () => {
    const url = new URL("artist", API_ROOT);
    url.search = new URLSearchParams({ query: `artist:${JSON.stringify(normalized)}`, limit: "8", fmt: "json" }).toString();
    const payload = await pacedFetchJson<{
      artists?: Array<{
        id: string;
        name: string;
        "sort-name"?: string;
        disambiguation?: string;
        country?: string;
        type?: string;
        score?: number;
      }>;
    }>(url.toString());

    return (payload.artists ?? []).map((artist) => ({
      id: artist.id,
      name: artist.name,
      sortName: artist["sort-name"],
      disambiguation: artist.disambiguation || undefined,
      country: artist.country,
      type: artist.type,
      score: artist.score,
    }));
  });
}

export async function getArtistReleaseGroups(artistId: string): Promise<CatalogReleaseGroup[]> {
  return cached(`release-groups:${artistId}`, 24 * 60 * 60_000, async () => {
    const url = new URL("release-group", API_ROOT);
    url.search = new URLSearchParams({
      artist: artistId,
      type: "album|ep",
      limit: "100",
      inc: "artist-credits+genres",
      fmt: "json",
    }).toString();
    const payload = await pacedFetchJson<{
      "release-groups"?: Array<{
        id: string;
        title: string;
        "primary-type"?: string;
        "secondary-types"?: string[];
        "first-release-date"?: string;
        "artist-credit"?: Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;
        genres?: Array<{ name?: string; count?: number }>;
      }>;
    }>(url.toString());

    return (payload["release-groups"] ?? [])
      .map((release) => ({
        id: release.id,
        title: release.title,
        primaryType: release["primary-type"],
        secondaryTypes: release["secondary-types"] ?? [],
        firstReleaseDate: release["first-release-date"] || undefined,
        artistName: artistCreditName(release["artist-credit"]),
        artwork: coverArtForReleaseGroup(release.id),
        genres: genreNames(release.genres),
      }))
      .sort((a, b) => (b.firstReleaseDate ?? "0000").localeCompare(a.firstReleaseDate ?? "0000"));
  });
}

type MbTrack = {
  position?: number;
  number?: string;
  title?: string;
  length?: number;
  "artist-credit"?: Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;
  recording?: {
    title?: string;
    "artist-credit"?: Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;
  };
};

type MbRelease = {
  id: string;
  title: string;
  date?: string;
  country?: string;
  status?: string;
  "artist-credit"?: Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;
  media?: Array<{ position?: number; tracks?: MbTrack[] }>;
};

function releaseTracks(release: MbRelease): CatalogTrack[] {
  const releaseArtist = artistCreditName(release["artist-credit"]) ?? "Artiste inconnu";
  let globalPosition = 0;
  return (release.media ?? []).flatMap((medium) =>
    (medium.tracks ?? []).map((track) => {
      globalPosition += 1;
      return {
        position: globalPosition,
        number: track.number,
        title: track.title ?? track.recording?.title ?? `Piste ${globalPosition}`,
        artistName: artistCreditName(track["artist-credit"]) ?? artistCreditName(track.recording?.["artist-credit"]) ?? releaseArtist,
        lengthMs: track.length,
      };
    }),
  );
}

export async function getReleaseGroupDetail(releaseGroupId: string): Promise<CatalogReleaseDetail | null> {
  return cached(`release:${releaseGroupId}`, 24 * 60 * 60_000, async () => {
    const url = new URL("release", API_ROOT);
    url.search = new URLSearchParams({
      "release-group": releaseGroupId,
      status: "official",
      limit: "100",
      inc: "recordings+artist-credits+release-groups",
      fmt: "json",
    }).toString();
    const payload = await pacedFetchJson<{ releases?: MbRelease[] }>(url.toString());
    const candidates = (payload.releases ?? []).filter((release) => releaseTracks(release).length > 0);
    if (!candidates.length) return null;

    const release = [...candidates].sort((a, b) => {
      const dateA = a.date || "9999-99-99";
      const dateB = b.date || "9999-99-99";
      return dateA.localeCompare(dateB);
    })[0]!;

    return {
      releaseGroupId,
      releaseId: release.id,
      title: release.title,
      date: release.date || undefined,
      country: release.country,
      status: release.status,
      artwork: coverArtForReleaseGroup(releaseGroupId),
      genres: [],
      tracks: releaseTracks(release),
    };
  });
}
