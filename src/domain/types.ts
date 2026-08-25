export const SCHEMA_VERSION = 1 as const;

export type Provider =
  | "audius"
  | "youtube"
  | "jamendo"
  | "mixcloud"
  | "soundcloud"
  | "bandcamp";

export type SourceHealth =
  | "UNKNOWN"
  | "VALID"
  | "TEMPORARILY_UNAVAILABLE"
  | "UNAVAILABLE"
  | "BLOCKED";

export type FrequencyPreference = "LESS" | "NORMAL" | "MORE";
export type MixFrequency = "NEVER" | "RARE" | "NORMAL" | "FREQUENT";
export type HistoryOutcome = "COMPLETED" | "SKIPPED_EARLY" | "SKIPPED_LATE" | "FAILED" | "STOPPED";

export interface EntityBase {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface Artist extends EntityBase {
  name: string;
  disabled: boolean;
}

export interface Album extends EntityBase {
  title: string;
  artistIds: string[];
  artwork?: string;
  year?: number;
  /** User-level album bookmark. Kept optional for backward compatibility with V1 snapshots. */
  favorite?: boolean;
  /** Canonical genre labels learned from metadata providers such as MusicBrainz. */
  genres?: string[];
}

export interface PlayableBase extends EntityBase {
  title: string;
  artistIds: string[];
  duration?: number;
  artwork?: string;
  genres: string[];
  moods: string[];
  energy?: number;
  /** Personal preference: 1 = very rarely, 3 = neutral, 5 = very often. Undefined is neutral/unrated. */
  rating?: number;
  /** Legacy V1 preference fields kept temporarily for backward-compatible imports. */
  favorite: boolean;
  frequencyPreference: FrequencyPreference;
  disabled: boolean;
}

export interface Track extends PlayableBase {
  kind: "track";
  albumId?: string;
  trackNumber?: number;
}

export interface Mix extends PlayableBase {
  kind: "mix";
}

export type PlayableItem = Track | Mix;

export interface Source extends EntityBase {
  playableItemId: string;
  provider: Provider;
  providerId: string;
  url: string;
  priority: number;
  userEnabled: boolean;
  healthStatus: SourceHealth;
  providerMetadata: Record<string, unknown>;
  metadataFetchedAt?: string;
  lastMetadataRefreshAt?: string;
  lastCheckedAt?: string;
  lastFailureAt?: string;
  failureReason?: string;
  consecutiveFailures: number;
}

export interface HistoryEntry extends EntityBase {
  playSessionId: string;
  itemId: string;
  itemKind: PlayableItem["kind"];
  sourceId?: string;
  provider?: Provider;
  startedAt: string;
  completedAt?: string;
  playedDuration?: number;
  itemDuration?: number;
  outcome: HistoryOutcome;
}

export interface RandomSettings {
  queueTarget: number;
  recentTrackWindow: number;
  recentArtistWindow: number;
  recentAlbumWindow: number;
  rediscoveryStrength: number;
  mixFrequency: MixFrequency;
}

export interface Settings {
  volume: number;
  providerPriority: Provider[];
  random: RandomSettings;
}

export interface LibrarySnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  revision: number;
  updatedAt: string;
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  mixes: Mix[];
  sources: Source[];
  genres: string[];
  moods: string[];
  history: HistoryEntry[];
  settings: Settings;
}

export interface StreamallExport extends LibrarySnapshot {
  exportedAt: string;
}

export interface ExternalSearchResult {
  externalId: string;
  provider: Provider;
  kind: PlayableItem["kind"];
  title: string;
  artistName: string;
  albumTitle?: string;
  duration?: number;
  artwork?: string;
  url: string;
  providerMetadata: Record<string, unknown>;
}

export interface QueueEntry {
  id: string;
  itemId: string;
  generatedAt: string;
  reason: "RANDOM" | "ALBUM" | "MANUAL";
}

export interface RandomFilters {
  genres?: string[];
  moods?: string[];
  energyMin?: number;
  energyMax?: number;
  kinds?: PlayableItem["kind"][];
}

export interface RandomDiagnostic {
  seed: number;
  candidateCount: number;
  selectedId?: string;
  relaxation: "NONE" | "ALBUM" | "ARTIST" | "TRACK";
  reason?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  providerPriority: ["audius", "youtube", "jamendo", "mixcloud", "soundcloud", "bandcamp"],
  random: {
    queueTarget: 20,
    recentTrackWindow: 40,
    recentArtistWindow: 12,
    recentAlbumWindow: 18,
    rediscoveryStrength: 1,
    mixFrequency: "RARE",
  },
};

export function emptyLibrary(now = new Date().toISOString()): LibrarySnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    artists: [],
    albums: [],
    tracks: [],
    mixes: [],
    sources: [],
    genres: [],
    moods: ["Zen", "Cool", "Groovy", "Énergique"],
    history: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
