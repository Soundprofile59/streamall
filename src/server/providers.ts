import type { ExternalSearchResult, Provider } from "@/domain/types";
import { searchYouTubeMusic } from "@/server/youtube-music";

export interface ProviderSearchStatus {
  provider: Provider;
  status: "LIVE" | "CACHED" | "BLOCKED_BY_CREDENTIAL" | "ERROR";
  message?: string;
}

export interface SearchResponse {
  results: ExternalSearchResult[];
  status: ProviderSearchStatus;
}

interface CacheEntry {
  expiresAt: number;
  response: SearchResponse;
}

const cache = new Map<string, CacheEntry>();

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 7_000): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.json() as Promise<T>;
}

function cached(provider: Provider, query: string, operation: () => Promise<SearchResponse>) {
  const key = `${provider}:${query.toLocaleLowerCase()}`;
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return Promise.resolve({ ...entry.response, status: { ...entry.response.status, status: "CACHED" as const } });
  }
  return operation().then((response) => {
    cache.set(key, { expiresAt: Date.now() + 10 * 60_000, response });
    return response;
  });
}

type AudiusTrack = {
  id: string;
  title: string;
  duration?: number;
  permalink?: string;
  artwork?: Record<string, string>;
  user?: { name?: string };
  album_backlink?: { title?: string };
};

export function searchAudius(query: string): Promise<SearchResponse> {
  return cached("audius", query, async () => {
    const apiKey = process.env.AUDIUS_API_KEY;
    const bearerToken = process.env.AUDIUS_BEARER_TOKEN;
    if (!apiKey && !bearerToken) {
      return { results: [], status: { provider: "audius", status: "BLOCKED_BY_CREDENTIAL", message: "AUDIUS_API_KEY required" } };
    }
    const url = new URL("https://api.audius.co/v1/tracks/search");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "12");
    const payload = await fetchJson<{ data?: AudiusTrack[] }>(url.toString(), {
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
    });
    return {
      status: { provider: "audius", status: "LIVE" },
      results: (payload.data ?? []).map((track) => ({
        externalId: track.id,
        provider: "audius",
        kind: "track",
        title: track.title,
        artistName: track.user?.name ?? "Audius artist",
        albumTitle: track.album_backlink?.title,
        duration: track.duration,
        artwork: track.artwork?.["480x480"] ?? track.artwork?.["_480x480"],
        url: `/api/providers/audius/stream/${encodeURIComponent(track.id)}`,
        providerMetadata: { permalink: track.permalink, artwork: track.artwork },
      })),
    };
  });
}

type YouTubeSearchItem = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url?: string } } } };
type YouTubeVideo = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url?: string } } };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; madeForKids?: boolean };
};

function isoDuration(value?: string) {
  if (!value) return undefined;
  const match = value.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
}

async function getYouTubeVideoDetails(ids: string[], key: string) {
  if (!ids.length) return [];
  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.search = new URLSearchParams({ key, part: "snippet,contentDetails,status", id: ids.slice(0, 50).join(",") }).toString();
  const details = await fetchJson<{ items?: YouTubeVideo[] }>(detailsUrl.toString());
  return details.items ?? [];
}

/**
 * Official YouTube Data API search. This remains the fallback because search.list
 * is expensive (100 quota units per call), while YouTube Music discovery below
 * uses the public signed-out catalogue and only spends a cheap videos.list call
 * to verify that discovered video IDs are still embeddable.
 */
export function searchYouTube(query: string, maxResults = 10): Promise<SearchResponse> {
  const boundedMaxResults = Math.max(1, Math.min(50, Math.floor(maxResults)));
  return cached("youtube", `classic:${query}\u0000max=${boundedMaxResults}`, async () => {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return { results: [], status: { provider: "youtube", status: "BLOCKED_BY_CREDENTIAL", message: "YOUTUBE_API_KEY required" } };
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.search = new URLSearchParams({ key, part: "snippet", q: query, type: "video", videoEmbeddable: "true", maxResults: String(boundedMaxResults) }).toString();
    const search = await fetchJson<{ items?: YouTubeSearchItem[] }>(searchUrl.toString());
    const ids = (search.items ?? []).flatMap((item) => (item.id?.videoId ? [item.id.videoId] : []));
    if (!ids.length) return { results: [], status: { provider: "youtube", status: "LIVE", message: "YouTube classique" } };
    const details = await getYouTubeVideoDetails(ids, key);
    return {
      status: { provider: "youtube", status: "LIVE", message: "YouTube classique" },
      results: details
        .filter((video) => video.id && video.status?.embeddable !== false)
        .map((video) => ({
          externalId: video.id!,
          provider: "youtube",
          kind: "track",
          title: video.snippet?.title ?? "YouTube video",
          artistName: video.snippet?.channelTitle ?? "YouTube channel",
          duration: isoDuration(video.contentDetails?.duration),
          artwork: video.snippet?.thumbnails?.high?.url,
          url: video.id!,
          providerMetadata: { madeForKids: video.status?.madeForKids ?? false, discoveredVia: "youtube-data" },
        })),
    };
  });
}

export function searchYouTubeCatalog(query: string, maxResults = 20): Promise<SearchResponse> {
  const boundedMaxResults = Math.max(1, Math.min(50, Math.floor(maxResults)));
  return cached("youtube", `music:${query}\u0000max=${boundedMaxResults}`, async () => {
    const music = await searchYouTubeMusic(query, boundedMaxResults);
    if (!music.results.length) {
      const fallback = await searchYouTube(query, Math.min(10, boundedMaxResults));
      return music.error && fallback.status.status === "LIVE"
        ? { ...fallback, status: { ...fallback.status, message: `YouTube Music indisponible · ${fallback.status.message ?? "YouTube classique"}` } }
        : fallback;
    }

    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      return {
        results: music.results,
        status: { provider: "youtube", status: "LIVE", message: "YouTube Music · IDs non vérifiés" },
      };
    }

    try {
      const details = await getYouTubeVideoDetails(music.results.map((result) => result.externalId), key);
      const detailById = new Map(details.filter((video): video is YouTubeVideo & { id: string } => Boolean(video.id)).map((video) => [video.id, video]));
      const verified = music.results.flatMap((result) => {
        const video = detailById.get(result.externalId);
        if (!video || video.status?.embeddable === false) return [];
        return [{
          ...result,
          duration: isoDuration(video.contentDetails?.duration) ?? result.duration,
          artwork: video.snippet?.thumbnails?.high?.url ?? result.artwork,
          providerMetadata: {
            ...result.providerMetadata,
            madeForKids: video.status?.madeForKids ?? false,
            embeddableVerified: true,
          },
        }];
      });
      if (verified.length) {
        return {
          results: verified,
          status: { provider: "youtube", status: "LIVE", message: "YouTube Music" },
        };
      }
    } catch {
      return {
        results: music.results,
        status: { provider: "youtube", status: "LIVE", message: "YouTube Music · validation différée" },
      };
    }

    return searchYouTube(query, Math.min(10, boundedMaxResults));
  });
}

type JamendoTrack = {
  id: string;
  name: string;
  artist_name: string;
  album_name?: string;
  duration?: number;
  image?: string;
  audio: string;
  shareurl?: string;
};

type JamendoPayload = {
  headers?: { status?: string; code?: number; error_message?: string };
  results?: JamendoTrack[];
};

export function searchJamendo(query: string): Promise<SearchResponse> {
  return cached("jamendo", query, async () => {
    const clientId = process.env.JAMENDO_CLIENT_ID;
    if (!clientId) return { results: [], status: { provider: "jamendo", status: "BLOCKED_BY_CREDENTIAL", message: "JAMENDO_CLIENT_ID required" } };
    const url = new URL("https://api.jamendo.com/v3.0/tracks/");
    url.search = new URLSearchParams({ client_id: clientId, format: "json", limit: "12", search: query, type: "single albumtrack", audioformat: "mp32" }).toString();
    const payload = await fetchJson<JamendoPayload>(url.toString());
    if (payload.headers?.status && payload.headers.status !== "success") {
      throw new Error(payload.headers.error_message ?? `Jamendo API error ${payload.headers.code ?? "unknown"}`);
    }
    return {
      status: { provider: "jamendo", status: "LIVE" },
      results: (payload.results ?? []).map((track) => ({
        externalId: track.id,
        provider: "jamendo",
        kind: "track",
        title: track.name,
        artistName: track.artist_name,
        albumTitle: track.album_name || undefined,
        duration: Number(track.duration) || undefined,
        artwork: track.image,
        url: track.audio,
        providerMetadata: { shareUrl: track.shareurl },
      })),
    };
  });
}

type MixcloudResult = {
  key: string;
  name: string;
  url: string;
  audio_length?: number;
  pictures?: { large?: string; extra_large?: string };
  user?: { name?: string; username?: string };
};

export function searchMixcloud(query: string): Promise<SearchResponse> {
  return cached("mixcloud", query, async () => {
    const url = new URL("https://api.mixcloud.com/search/");
    url.search = new URLSearchParams({ q: query, type: "cloudcast", limit: "10" }).toString();
    const payload = await fetchJson<{ data?: MixcloudResult[] }>(url.toString());
    return {
      status: { provider: "mixcloud", status: "LIVE" },
      results: (payload.data ?? []).map((mix) => ({
        externalId: mix.key,
        provider: "mixcloud",
        kind: "mix",
        title: mix.name,
        artistName: mix.user?.name ?? mix.user?.username ?? "Mixcloud creator",
        duration: mix.audio_length,
        artwork: mix.pictures?.extra_large ?? mix.pictures?.large,
        url: mix.key,
        providerMetadata: { canonicalUrl: mix.url },
      })),
    };
  });
}

export async function searchProviders(query: string, providers: Provider[]) {
  const operations: Partial<Record<Provider, () => Promise<SearchResponse>>> = {
    audius: () => searchAudius(query),
    youtube: () => searchYouTubeCatalog(query),
    jamendo: () => searchJamendo(query),
    mixcloud: () => searchMixcloud(query),
  };
  const settled = await Promise.all(
    providers.map(async (provider) => {
      const operation = operations[provider];
      if (!operation) return { results: [], status: { provider, status: "ERROR" as const, message: "Provider not enabled in V1" } };
      try {
        return await operation();
      } catch (error) {
        return { results: [], status: { provider, status: "ERROR" as const, message: error instanceof Error ? error.message : "Provider error" } };
      }
    }),
  );
  return { results: settled.flatMap((result) => result.results), providers: settled.map((result) => result.status) };
}
