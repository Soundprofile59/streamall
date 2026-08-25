import { z } from "zod";
import { SCHEMA_VERSION } from "./types";

const entityBase = z.object({
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const playableBase = entityBase.extend({
  title: z.string().min(1),
  artistIds: z.array(z.string().min(1)),
  duration: z.number().nonnegative().optional(),
  artwork: z.url().optional(),
  genres: z.array(z.string().min(1)),
  moods: z.array(z.string().min(1)),
  energy: z.number().min(1).max(5).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  favorite: z.boolean(),
  frequencyPreference: z.enum(["LESS", "NORMAL", "MORE"]),
  disabled: z.boolean(),
});

export const artistSchema = entityBase.extend({ name: z.string().min(1), disabled: z.boolean() });
export const albumSchema = entityBase.extend({
  title: z.string().min(1),
  artistIds: z.array(z.string()),
  artwork: z.url().optional(),
  year: z.number().int().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  favorite: z.boolean().optional(),
  genres: z.array(z.string().min(1)).optional(),
});
export const trackSchema = playableBase.extend({
  kind: z.literal("track"),
  albumId: z.string().optional(),
  trackNumber: z.number().int().positive().optional(),
});
export const mixSchema = playableBase.extend({ kind: z.literal("mix") });
export const sourceSchema = entityBase.extend({
  playableItemId: z.string().min(1),
  provider: z.enum(["audius", "youtube", "jamendo", "mixcloud", "soundcloud", "bandcamp"]),
  providerId: z.string().min(1),
  url: z.string().min(1),
  priority: z.number().int(),
  userEnabled: z.boolean(),
  healthStatus: z.enum(["UNKNOWN", "VALID", "TEMPORARILY_UNAVAILABLE", "UNAVAILABLE", "BLOCKED"]),
  providerMetadata: z.record(z.string(), z.unknown()),
  metadataFetchedAt: z.iso.datetime().optional(),
  lastMetadataRefreshAt: z.iso.datetime().optional(),
  lastCheckedAt: z.iso.datetime().optional(),
  lastFailureAt: z.iso.datetime().optional(),
  failureReason: z.string().optional(),
  consecutiveFailures: z.number().int().nonnegative(),
});
export const historyEntrySchema = entityBase.extend({
  playSessionId: z.string().min(1),
  itemId: z.string().min(1),
  itemKind: z.enum(["track", "mix"]),
  sourceId: z.string().optional(),
  provider: z.enum(["audius", "youtube", "jamendo", "mixcloud", "soundcloud", "bandcamp"]).optional(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
  playedDuration: z.number().nonnegative().optional(),
  itemDuration: z.number().nonnegative().optional(),
  outcome: z.enum(["COMPLETED", "SKIPPED_EARLY", "SKIPPED_LATE", "FAILED", "STOPPED"]),
});

export const settingsSchema = z.object({
  volume: z.number().min(0).max(1),
  providerPriority: z.array(z.enum(["audius", "youtube", "jamendo", "mixcloud", "soundcloud", "bandcamp"])),
  random: z.object({
    queueTarget: z.number().int().min(1).max(100),
    recentTrackWindow: z.number().int().nonnegative(),
    recentArtistWindow: z.number().int().nonnegative(),
    recentAlbumWindow: z.number().int().nonnegative(),
    rediscoveryStrength: z.number().min(0).max(5),
    mixFrequency: z.enum(["NEVER", "RARE", "NORMAL", "FREQUENT"]),
  }),
});

export const librarySnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  artists: z.array(artistSchema),
  albums: z.array(albumSchema),
  tracks: z.array(trackSchema),
  mixes: z.array(mixSchema),
  sources: z.array(sourceSchema),
  genres: z.array(z.string()),
  moods: z.array(z.string()),
  history: z.array(historyEntrySchema),
  settings: settingsSchema,
}).superRefine((snapshot, context) => {
  const ids = new Set<string>();
  for (const entity of [...snapshot.artists, ...snapshot.albums, ...snapshot.tracks, ...snapshot.mixes, ...snapshot.sources, ...snapshot.history]) {
    if (ids.has(entity.id)) context.addIssue({ code: "custom", message: `Duplicate Streamall ID: ${entity.id}` });
    ids.add(entity.id);
  }
  const playableIds = new Set([...snapshot.tracks, ...snapshot.mixes].map((item) => item.id));
  for (const source of snapshot.sources) {
    if (!playableIds.has(source.playableItemId)) {
      context.addIssue({ code: "custom", message: `Orphan source ${source.id}` });
    }
  }
});

export const streamallExportSchema = librarySnapshotSchema.and(z.object({ exportedAt: z.iso.datetime() }));
