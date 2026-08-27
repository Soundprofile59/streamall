const LABS_ROOT = "https://labs.api.listenbrainz.org/";
const USER_AGENT = "Streamall/0.8.12 (https://github.com/Soundprofile59/streamall)";
const ARTIST_ALGORITHM = "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30";
const RECORDING_ALGORITHM = "session_based_days_7500_session_300_contribution_5_threshold_15_limit_50_skip_30_top_n_listeners_1000";
const MAX_ATTEMPTS = 2;

type CacheEntry = { expiresAt: number; value: unknown };
const cache = new Map<string, CacheEntry>();

type JsonRecord = Record<string, unknown>;

export interface ListenBrainzSimilarArtist {
  artistMbid: string;
  name?: string;
  score: number;
  referenceMbid?: string;
}

export interface ListenBrainzSimilarRecording {
  recordingMbid: string;
  recordingName?: string;
  artistName?: string;
  artistMbids: string[];
  releaseName?: string;
  score: number;
  referenceMbid?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter((entry): entry is string => Boolean(entry));
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLocaleLowerCase() === "none") return [];
  try {
    const decoded = JSON.parse(trimmed) as unknown;
    if (Array.isArray(decoded)) return decoded.map(stringValue).filter((entry): entry is string => Boolean(entry));
  } catch {
    // Some dataset versions serialize arrays as comma-separated strings.
  }
  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function collectRecords(payload: unknown, predicate: (row: JsonRecord) => boolean, output: JsonRecord[] = []): JsonRecord[] {
  if (Array.isArray(payload)) {
    for (const entry of payload) collectRecords(entry, predicate, output);
    return output;
  }
  if (!isRecord(payload)) return output;
  if (predicate(payload)) output.push(payload);
  for (const value of Object.values(payload)) {
    if (Array.isArray(value) || isRecord(value)) collectRecords(value, predicate, output);
  }
  return output;
}

async function fetchJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });
      if (response.ok) return response.json() as Promise<unknown>;
      lastError = new Error(`ListenBrainz Labs returned ${response.status}`);
      if (attempt === MAX_ATTEMPTS - 1 || ![429, 502, 503, 504].includes(response.status)) throw lastError;
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 800 * (attempt + 1));
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) throw error;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ListenBrainz Labs indisponible");
}

async function cached<T>(key: string, ttlMs: number, operation: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await operation();
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

export async function getSimilarArtists(artistMbid: string): Promise<ListenBrainzSimilarArtist[]> {
  return cached(`artist:${artistMbid}`, 24 * 60 * 60_000, async () => {
    const url = new URL("similar-artists/json", LABS_ROOT);
    url.search = new URLSearchParams({ artist_mbids: artistMbid, algorithm: ARTIST_ALGORITHM }).toString();
    const payload = await fetchJson(url.toString());
    const rows = collectRecords(payload, (row) => Boolean(stringValue(row.artist_mbid)) && finiteNumber(row.score) !== undefined);
    const byArtist = new Map<string, ListenBrainzSimilarArtist>();
    for (const row of rows) {
      const mbid = stringValue(row.artist_mbid);
      const score = finiteNumber(row.score);
      if (!mbid || score === undefined || score <= 0 || mbid === artistMbid) continue;
      const candidate: ListenBrainzSimilarArtist = {
        artistMbid: mbid,
        name: stringValue(row.name),
        score,
        referenceMbid: stringValue(row.reference_mbid),
      };
      const previous = byArtist.get(mbid);
      if (!previous || candidate.score > previous.score) byArtist.set(mbid, candidate);
    }
    return [...byArtist.values()].sort((a, b) => b.score - a.score);
  });
}

async function getSimilarRecordingsForSeed(recordingMbid: string): Promise<ListenBrainzSimilarRecording[]> {
  return cached(`recording:${recordingMbid}`, 24 * 60 * 60_000, async () => {
    const url = new URL("similar-recordings/json", LABS_ROOT);
    url.search = new URLSearchParams({ recording_mbids: recordingMbid, algorithm: RECORDING_ALGORITHM }).toString();
    const payload = await fetchJson(url.toString());
    const rows = collectRecords(payload, (row) => Boolean(stringValue(row.recording_mbid)) && finiteNumber(row.score) !== undefined);
    const byRecording = new Map<string, ListenBrainzSimilarRecording>();
    for (const row of rows) {
      const mbid = stringValue(row.recording_mbid);
      const score = finiteNumber(row.score);
      if (!mbid || score === undefined || score <= 0 || mbid === recordingMbid) continue;
      const candidate: ListenBrainzSimilarRecording = {
        recordingMbid: mbid,
        recordingName: stringValue(row.recording_name),
        artistName: stringValue(row.artist_credit_name),
        artistMbids: stringList(row.artist_credit_mbids),
        releaseName: stringValue(row.release_name),
        score,
        referenceMbid: stringValue(row.reference_mbid) ?? recordingMbid,
      };
      const previous = byRecording.get(mbid);
      if (!previous || candidate.score > previous.score) byRecording.set(mbid, candidate);
    }
    return [...byRecording.values()].sort((a, b) => b.score - a.score);
  });
}

export async function getSimilarRecordings(recordingMbids: string[]): Promise<ListenBrainzSimilarRecording[]> {
  const unique = [...new Set(recordingMbids.filter(Boolean))].slice(0, 4);
  if (!unique.length) return [];
  const groups = await Promise.all(unique.map((recordingMbid) => getSimilarRecordingsForSeed(recordingMbid)));
  return groups.flat();
}
