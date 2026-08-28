"use client";

import { useEffect } from "react";
import type { LibrarySnapshot } from "@/domain/types";
import {
  readSourceRepairStatus,
  repairDayKey,
  SOURCE_REPAIR_AUTO_SEARCH_BUDGET,
  writeSourceRepairStatus,
} from "./source-repair-status";

const START_DELAY_MS = 8_000;
const BETWEEN_ALBUMS_MS = 7_000;
const MAX_YOUTUBE_SEARCHES_PER_ALBUM = 20;
const STORAGE_PREFIX = "streamall:source-repair:v2:";

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
  addedSources?: number;
  youtubeSearchCalls?: number;
  providers?: Array<{ provider?: string; status?: string; message?: string }>;
};

export function SourceRepairAgent() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await sleep(START_DELAY_MS);
      if (cancelled) return;

      const response = await fetch("/api/library", { cache: "no-store" }).catch(() => undefined);
      if (!response?.ok || cancelled) return;
      const library = await response.json() as LibrarySnapshot;
      const day = repairDayKey();
      const storageKey = `${STORAGE_PREFIX}${day}`;
      const attempted = readAttempted(storageKey);
      const previous = readSourceRepairStatus();
      let addedSources = previous?.day === day ? previous.addedSources : 0;
      let youtubeSearches = previous?.day === day ? previous.youtubeSearches : 0;

      // Quota and automatic-budget stops remain authoritative for the current
      // YouTube quota day. Reloading Streamall resumes only when there is still
      // budget available, or after Pacific midnight starts a fresh window.
      if (previous?.day === day && ["quota", "budget"].includes(previous.state)) return;

      if (youtubeSearches >= SOURCE_REPAIR_AUTO_SEARCH_BUDGET) {
        writeSourceRepairStatus({
          day,
          state: "budget",
          attemptedAlbums: attempted.size,
          addedSources,
          youtubeSearches,
          lastRunAt: new Date().toISOString(),
          message: "Budget automatique atteint",
        });
        return;
      }

      const queue = incompleteAlbumIds(library).filter((albumId) => !attempted.has(albumId));
      if (!queue.length) {
        writeSourceRepairStatus({
          day,
          state: "done",
          attemptedAlbums: attempted.size,
          addedSources,
          youtubeSearches,
          lastRunAt: new Date().toISOString(),
          message: "Vérification terminée",
        });
        return;
      }

      writeSourceRepairStatus({
        day,
        state: "running",
        attemptedAlbums: attempted.size,
        addedSources,
        youtubeSearches,
        lastRunAt: new Date().toISOString(),
      });

      for (const albumId of queue) {
        if (cancelled) return;
        const remainingBudget = SOURCE_REPAIR_AUTO_SEARCH_BUDGET - youtubeSearches;
        if (remainingBudget <= 0) {
          writeSourceRepairStatus({
            day,
            state: "budget",
            attemptedAlbums: attempted.size,
            addedSources,
            youtubeSearches,
            lastRunAt: new Date().toISOString(),
            message: "Budget automatique atteint",
          });
          return;
        }

        const albumBudget = Math.min(MAX_YOUTUBE_SEARCHES_PER_ALBUM, remainingBudget);
        const resolveResponse = await fetch("/api/albums/resolve-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId, maxYouTubeSearchCalls: albumBudget }),
        }).catch(() => undefined);

        if (!resolveResponse) {
          writeSourceRepairStatus({
            day,
            state: "error",
            attemptedAlbums: attempted.size,
            addedSources,
            youtubeSearches,
            lastRunAt: new Date().toISOString(),
            message: "Recherche interrompue · réseau indisponible",
          });
          return;
        }

        if (resolveResponse.status === 429) {
          writeSourceRepairStatus({
            day,
            state: "error",
            attemptedAlbums: attempted.size,
            addedSources,
            youtubeSearches,
            lastRunAt: new Date().toISOString(),
            message: "Recherche temporairement ralentie",
          });
          return;
        }

        if (!resolveResponse.ok) {
          writeSourceRepairStatus({
            day,
            state: "error",
            attemptedAlbums: attempted.size,
            addedSources,
            youtubeSearches,
            lastRunAt: new Date().toISOString(),
            message: `Recherche interrompue · erreur ${resolveResponse.status}`,
          });
          return;
        }

        const result = await resolveResponse.json().catch(() => null) as ResolveResponse | null;
        youtubeSearches = Math.min(
          SOURCE_REPAIR_AUTO_SEARCH_BUDGET,
          youtubeSearches + Math.max(0, result?.youtubeSearchCalls ?? 0),
        );
        addedSources += result?.addedSources ?? 0;
        attempted.add(albumId);
        writeAttempted(storageKey, attempted);
        window.dispatchEvent(new Event("streamall:library-refresh-request"));

        const youtubeQuotaError = result?.providers?.some((provider) =>
          provider.provider === "youtube" && provider.status === "ERROR" && /403|quota/i.test(provider.message ?? ""),
        );
        if (youtubeQuotaError) {
          writeSourceRepairStatus({
            day,
            state: "quota",
            attemptedAlbums: attempted.size,
            addedSources,
            youtubeSearches,
            lastRunAt: new Date().toISOString(),
            message: "Quota YouTube atteint",
          });
          return;
        }

        if (youtubeSearches >= SOURCE_REPAIR_AUTO_SEARCH_BUDGET) {
          writeSourceRepairStatus({
            day,
            state: "budget",
            attemptedAlbums: attempted.size,
            addedSources,
            youtubeSearches,
            lastRunAt: new Date().toISOString(),
            message: "Budget automatique atteint",
          });
          return;
        }

        writeSourceRepairStatus({
          day,
          state: "running",
          attemptedAlbums: attempted.size,
          addedSources,
          youtubeSearches,
          lastRunAt: new Date().toISOString(),
        });
        await sleep(BETWEEN_ALBUMS_MS);
      }

      writeSourceRepairStatus({
        day,
        state: "done",
        attemptedAlbums: attempted.size,
        addedSources,
        youtubeSearches,
        lastRunAt: new Date().toISOString(),
        message: "Vérification terminée",
      });
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return null;
}
