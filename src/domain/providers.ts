import type { Provider, Source } from "./types";

export type Capability =
  | "SEARCH"
  | "RESOLVE"
  | "PLAY"
  | "PAUSE"
  | "SEEK"
  | "ENDED_EVENT"
  | "AUTOPLAY"
  | "BACKGROUND"
  | "DIRECT_AUDIO"
  | "VISIBLE_PLAYER_REQUIRED"
  | "VOLUME"
  | "POSITION"
  | "DURATION";

export interface PlaybackContext {
  isMobile: boolean;
  isStandalone: boolean;
  hasUserActivation: boolean;
}

const STATIC_CAPABILITIES: Record<Provider, ReadonlySet<Capability>> = {
  audius: new Set(["SEARCH", "RESOLVE", "PLAY", "PAUSE", "SEEK", "ENDED_EVENT", "DIRECT_AUDIO", "VOLUME", "POSITION", "DURATION"]),
  youtube: new Set(["SEARCH", "RESOLVE", "PLAY", "PAUSE", "SEEK", "ENDED_EVENT", "VISIBLE_PLAYER_REQUIRED", "VOLUME", "POSITION", "DURATION"]),
  jamendo: new Set(["SEARCH", "PLAY", "PAUSE", "SEEK", "ENDED_EVENT", "DIRECT_AUDIO", "VOLUME", "POSITION", "DURATION"]),
  mixcloud: new Set(["SEARCH", "RESOLVE", "PLAY", "PAUSE", "SEEK", "ENDED_EVENT", "VISIBLE_PLAYER_REQUIRED", "POSITION", "DURATION"]),
  soundcloud: new Set(["SEARCH", "RESOLVE", "PLAY", "PAUSE", "SEEK", "ENDED_EVENT", "VISIBLE_PLAYER_REQUIRED", "POSITION", "DURATION"]),
  bandcamp: new Set(["RESOLVE", "PLAY", "VISIBLE_PLAYER_REQUIRED"]),
};

export function resolveCapabilities(source: Source, context: PlaybackContext) {
  const capabilities = new Set(STATIC_CAPABILITIES[source.provider]);
  if (context.hasUserActivation && ["audius", "jamendo"].includes(source.provider)) capabilities.add("AUTOPLAY");
  if (source.provider === "youtube") capabilities.delete("BACKGROUND");
  return capabilities;
}

export function resolveSources(sources: Source[], context: PlaybackContext) {
  return sources
    .filter(
      (source) =>
        source.userEnabled &&
        !["UNAVAILABLE", "BLOCKED"].includes(source.healthStatus) &&
        resolveCapabilities(source, context).has("PLAY"),
    )
    .sort((a, b) => a.priority - b.priority || a.consecutiveFailures - b.consecutiveFailures);
}
