import type { ExternalSearchResult } from "@/domain/types";

type UnknownRecord = Record<string, unknown>;

type YtmusicSearchResponse = {
  results: ExternalSearchResult[];
  error?: string;
};

const YTMUSIC_ORIGIN = "https://music.youtube.com";
const YTMUSIC_SEARCH_URL = `${YTMUSIC_ORIGIN}/youtubei/v1/search?alt=json`;
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_LIMIT = 20;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!isRecord(value)) return undefined;
  const simpleText = value.simpleText;
  if (typeof simpleText === "string" && simpleText.trim()) return simpleText.trim();
  const runs = value.runs;
  if (!Array.isArray(runs)) return undefined;
  const text = runs.map((run) => isRecord(run) && typeof run.text === "string" ? run.text : "").join("").trim();
  return text || undefined;
}

function parseDuration(value?: string) {
  if (!value || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
}

function findVideoId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findVideoId(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.videoId === "string" && /^[A-Za-z0-9_-]{6,}$/.test(value.videoId)) return value.videoId;
  for (const child of Object.values(value)) {
    const found = findVideoId(child);
    if (found) return found;
  }
  return undefined;
}

function findThumbnail(value: unknown): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    for (const entry of [...value].reverse()) {
      if (isRecord(entry) && typeof entry.url === "string" && entry.url.startsWith("http")) return entry.url;
      const nested = findThumbnail(entry);
      if (nested) return nested;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.thumbnails)) {
    const found = findThumbnail(value.thumbnails);
    if (found) return found;
  }
  for (const child of Object.values(value)) {
    const found = findThumbnail(child);
    if (found) return found;
  }
  return undefined;
}

function pageType(run: UnknownRecord) {
  const endpoint = isRecord(run.navigationEndpoint) ? run.navigationEndpoint : undefined;
  const browse = endpoint && isRecord(endpoint.browseEndpoint) ? endpoint.browseEndpoint : undefined;
  const configs = browse && isRecord(browse.browseEndpointContextSupportedConfigs) ? browse.browseEndpointContextSupportedConfigs : undefined;
  const musicConfig = configs && isRecord(configs.browseEndpointContextMusicConfig) ? configs.browseEndpointContextMusicConfig : undefined;
  return typeof musicConfig?.pageType === "string" ? musicConfig.pageType : undefined;
}

function rendererRuns(renderer: UnknownRecord) {
  const runs: UnknownRecord[] = [];
  const collectTextRuns = (value: unknown) => {
    if (!isRecord(value)) return;
    const text = value.text;
    if (isRecord(text) && Array.isArray(text.runs)) {
      for (const run of text.runs) if (isRecord(run)) runs.push(run);
    }
  };

  const flexColumns = renderer.flexColumns;
  if (Array.isArray(flexColumns)) {
    for (const column of flexColumns) {
      if (!isRecord(column)) continue;
      const nested = column.musicResponsiveListItemFlexColumnRenderer;
      if (isRecord(nested)) collectTextRuns(nested);
    }
  }
  const fixedColumns = renderer.fixedColumns;
  if (Array.isArray(fixedColumns)) {
    for (const column of fixedColumns) {
      if (!isRecord(column)) continue;
      const nested = column.musicResponsiveListItemFixedColumnRenderer;
      if (isRecord(nested)) collectTextRuns(nested);
    }
  }
  return runs;
}

function extractResponsiveItem(renderer: UnknownRecord): ExternalSearchResult | undefined {
  const videoId = findVideoId(renderer);
  if (!videoId) return undefined;

  const flexColumns = Array.isArray(renderer.flexColumns) ? renderer.flexColumns : [];
  const firstColumn = flexColumns[0];
  const firstRenderer = isRecord(firstColumn) && isRecord(firstColumn.musicResponsiveListItemFlexColumnRenderer)
    ? firstColumn.musicResponsiveListItemFlexColumnRenderer
    : undefined;
  const title = firstRenderer ? textValue(firstRenderer.text) : undefined;
  if (!title) return undefined;

  const runs = rendererRuns(renderer);
  const artistRun = runs.find((run) => pageType(run) === "MUSIC_PAGE_TYPE_ARTIST");
  const albumRun = runs.find((run) => pageType(run) === "MUSIC_PAGE_TYPE_ALBUM");
  const durationRun = runs.find((run) => typeof run.text === "string" && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(run.text));
  const fallbackArtist = runs.find((run) => {
    if (run === artistRun || run === albumRun || run === durationRun) return false;
    const text = typeof run.text === "string" ? run.text.trim() : "";
    return Boolean(text && text !== title && text !== " • ");
  });

  const artistName = typeof artistRun?.text === "string"
    ? artistRun.text
    : typeof fallbackArtist?.text === "string"
      ? fallbackArtist.text
      : "YouTube Music";
  const albumTitle = typeof albumRun?.text === "string" ? albumRun.text : undefined;
  const duration = typeof durationRun?.text === "string" ? parseDuration(durationRun.text) : undefined;
  const artwork = findThumbnail(renderer.thumbnail ?? renderer);

  return {
    externalId: videoId,
    provider: "youtube",
    kind: "track",
    title,
    artistName,
    albumTitle,
    duration,
    artwork,
    url: videoId,
    providerMetadata: {
      discoveredVia: "youtube-music",
      youtubeMusic: true,
    },
  };
}

function walk(value: unknown, output: ExternalSearchResult[]) {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, output);
    return;
  }
  if (!isRecord(value)) return;

  const renderer = value.musicResponsiveListItemRenderer;
  if (isRecord(renderer)) {
    const result = extractResponsiveItem(renderer);
    if (result) output.push(result);
  }

  for (const child of Object.values(value)) walk(child, output);
}

export function parseYouTubeMusicSearchPayload(payload: unknown, limit = DEFAULT_LIMIT) {
  const collected: ExternalSearchResult[] = [];
  walk(payload, collected);
  const seen = new Set<string>();
  return collected.filter((result) => {
    if (seen.has(result.externalId)) return false;
    seen.add(result.externalId);
    return true;
  }).slice(0, Math.max(1, Math.min(50, Math.floor(limit))));
}

function clientVersion(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `1.${year}${month}${day}.01.00`;
}

export async function searchYouTubeMusic(query: string, limit = DEFAULT_LIMIT): Promise<YtmusicSearchResponse> {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(YTMUSIC_SEARCH_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        origin: YTMUSIC_ORIGIN,
        referer: `${YTMUSIC_ORIGIN}/`,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "x-youtube-client-name": "67",
        "x-youtube-client-version": clientVersion(),
      },
      body: JSON.stringify({
        query,
        context: {
          client: {
            clientName: "WEB_REMIX",
            clientVersion: clientVersion(),
            hl: process.env.YOUTUBE_MUSIC_HL ?? "fr",
            gl: process.env.YOUTUBE_MUSIC_GL ?? "FR",
          },
          user: {},
        },
      }),
    });
    if (!response.ok) return { results: [], error: `YouTube Music returned ${response.status}` };
    const payload = await response.json().catch(() => undefined);
    return { results: parseYouTubeMusicSearchPayload(payload, boundedLimit) };
  } catch (error) {
    return {
      results: [],
      error: error instanceof Error ? error.message : "YouTube Music indisponible",
    };
  } finally {
    clearTimeout(timeout);
  }
}
