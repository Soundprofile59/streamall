"use client";

import { useEffect } from "react";
import type { LibrarySnapshot } from "@/domain/types";

const START_DELAY_MS = 8_000;
const BETWEEN_ALBUMS_MS = 7_000;
const MAX_ALBUMS_PER_DAY = 20;
const STORAGE_PREFIX = "streamall:source-repair:v1:";

function localDayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readAttempted(key: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeAttempted(key: string, attempted: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...attempted]));
  } catch {
    // Maintenance remains best-effort if local storage is unavailable.
  }
}

function incompleteAlbumIds(library: LibrarySnapshot) {
  const enabledSourceItemIds = new Set(
    library.sources.filter((source) => source.userEnabled).map((source) => source.playableItemId),
  );
  return library.albums
    .map((album) => {
      const tracks = library.tracks.filter((track) => track.albumId === album.id);
      const missing = tracks.filter((track) => !enabledSourceItemIds.has(track.id)).length;
      return { id: album.id, missing };
    })
    .filter((entry) => entry.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .map((entry) => entry.id);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type ResolveResponse = {
  providers?: Array<{ provider?: string; status?: string; message?: string }>;
};

export function SourceRepairAgent() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await sleep(START_DELAY_MS);
      if (cancelled) return;

      const response = await fetch("/api/library").catch(() => undefined);
      if (!response?.ok || cancelled) return;
      const library = await response.json() as LibrarySnapshot;
      const storageKey = `${STORAGE_PREFIX}${localDayKey()}`;
      const attempted = readAttempted(storageKey);
      const queue = incompleteAlbumIds(library)
        .filter((albumId) => !attempted.has(albumId))
        .slice(0, MAX_ALBUMS_PER_DAY);

      for (const albumId of queue) {
        if (cancelled) return;
        const resolveResponse = await fetch("/api/albums/resolve-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId }),
        }).catch(() => undefined);

        attempted.add(albumId);
        writeAttempted(storageKey, attempted);

        if (resolveResponse?.ok) {
          const result = await resolveResponse.json().catch(() => null) as ResolveResponse | null;
          window.dispatchEvent(new Event("streamall:library-refresh-request"));
          const youtubeQuotaError = result?.providers?.some((provider) =>
            provider.provider === "youtube" && provider.status === "ERROR" && /403|quota/i.test(provider.message ?? ""),
          );
          if (youtubeQuotaError) return;
        } else if (resolveResponse?.status === 429) {
          await sleep(10_000);
        }

        await sleep(BETWEEN_ALBUMS_MS);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return null;
}
