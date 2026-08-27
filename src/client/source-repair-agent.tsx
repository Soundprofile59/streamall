"use client";

import { useEffect } from "react";
import type { LibrarySnapshot } from "@/domain/types";
import { readSourceRepairStatus, repairDayKey, writeSourceRepairStatus } from "./source-repair-status";

const START_DELAY_MS = 8_000;
const BETWEEN_ALBUMS_MS = 7_000;
const MAX_ALBUMS_PER_DAY = 20;
const STORAGE_PREFIX = "streamall:source-repair:v1:";

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
      const day = repairDayKey();
      const storageKey = `${STORAGE_PREFIX}${day}`;
      const attempted = readAttempted(storageKey);
      const previous = readSourceRepairStatus();
      let addedSources = previous?.day === day ? previous.addedSources : 0;

      // A quota stop remains authoritative for the current YouTube quota day.
      // Reloading Streamall must not restart requests until Pacific midnight.
      if (previous?.day === day && previous.state === "quota") return;

      const remainingSlots = Math.max(0, MAX_ALBUMS_PER_DAY - attempted.size);
      const queue = incompleteAlbumIds(library)
        .filter((albumId) => !attempted.has(albumId))
        .slice(0, remainingSlots);

      if (!queue.length) {
        writeSourceRepairStatus({
          day,
          state: "done",
          attemptedAlbums: attempted.size,
          addedSources,
          lastRunAt: new Date().toISOString(),
          message: attempted.size >= MAX_ALBUMS_PER_DAY ? "Plafond quotidien atteint" : "Vérification terminée",
        });
        return;
      }

      writeSourceRepairStatus({
        day,
        state: "running",
        attemptedAlbums: attempted.size,
        addedSources,
        lastRunAt: new Date().toISOString(),
      });

      for (const albumId of queue) {
        if (cancelled) return;
        const resolveResponse = await fetch("/api/albums/resolve-sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId }),
        }).catch(() => undefined);

        if (!resolveResponse) {
          writeSourceRepairStatus({
            day,
            state: "error",
            attemptedAlbums: attempted.size,
            addedSources,
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
            lastRunAt: new Date().toISOString(),
            message: "Recherche temporairement ralentie",
          });
          return;
        }

        attempted.add(albumId);
        writeAttempted(storageKey, attempted);

        if (resolveResponse.ok) {
          const result = await resolveResponse.json().catch(() => null) as ResolveResponse | null;
          addedSources += result?.addedSources ?? 0;
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
              lastRunAt: new Date().toISOString(),
              message: "Quota YouTube atteint",
            });
            return;
          }
        }

        writeSourceRepairStatus({
          day,
          state: "running",
          attemptedAlbums: attempted.size,
          addedSources,
          lastRunAt: new Date().toISOString(),
        });
        await sleep(BETWEEN_ALBUMS_MS);
      }

      writeSourceRepairStatus({
        day,
        state: "done",
        attemptedAlbums: attempted.size,
        addedSources,
        lastRunAt: new Date().toISOString(),
        message: "Vérification terminée",
      });
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  return null;
}
