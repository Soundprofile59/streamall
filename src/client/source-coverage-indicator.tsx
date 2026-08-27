"use client";

import { useEffect } from "react";
import type { LibrarySnapshot } from "@/domain/types";
import { readSourceRepairStatus, repairDayKey, SOURCE_REPAIR_STATUS_EVENT } from "./source-repair-status";

const REFRESH_INTERVAL_MS = 30_000;

function playableTrackCount(library: LibrarySnapshot) {
  const playableIds = new Set(
    library.sources
      .filter((source) => source.userEnabled && !["TEMPORARILY_UNAVAILABLE", "UNAVAILABLE", "BLOCKED"].includes(source.healthStatus))
      .map((source) => source.playableItemId),
  );
  return library.tracks.filter((track) => playableIds.has(track.id)).length;
}

function timeLabel(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function activityLabel() {
  const status = readSourceRepairStatus();
  if (!status || status.day !== repairDayKey()) return "Recherche du jour · en attente";
  const time = timeLabel(status.lastRunAt);
  const suffix = time ? ` · ${time}` : "";
  if (status.state === "running") return `Recherche en cours · ${status.attemptedAlbums}/20 · +${status.addedSources}${suffix}`;
  if (status.state === "quota") return `Quota YouTube atteint · +${status.addedSources}${suffix}`;
  if (status.state === "error") return `${status.message ?? "Recherche en pause"} · +${status.addedSources}${suffix}`;
  return `Recherche faite aujourd’hui · ${status.attemptedAlbums} album${status.attemptedAlbums > 1 ? "s" : ""} · +${status.addedSources}${suffix}`;
}

export function SourceCoverageIndicator() {
  useEffect(() => {
    let cancelled = false;
    let slot: HTMLDivElement | undefined;
    let observer: MutationObserver | undefined;

    const ensureSlot = () => {
      if (slot?.isConnected) return slot;
      const nav = document.querySelector<HTMLElement>(".library-nav");
      const actions = nav?.querySelector<HTMLElement>(".nav-actions");
      if (!nav || !actions) return undefined;
      slot = document.createElement("div");
      slot.className = "source-coverage-indicator";
      slot.setAttribute("role", "status");
      slot.setAttribute("aria-live", "polite");
      nav.insertBefore(slot, actions);
      return slot;
    };

    const render = (library?: LibrarySnapshot) => {
      const target = ensureSlot();
      if (!target) return;
      target.replaceChildren();

      const title = document.createElement("div");
      title.className = "source-coverage-title";
      title.textContent = "SOURCES";

      const coverage = document.createElement("strong");
      coverage.className = "source-coverage-value";
      coverage.textContent = library ? `${playableTrackCount(library)} / ${library.tracks.length} jouables` : "Calcul…";

      const activity = document.createElement("small");
      activity.className = "source-coverage-activity";
      activity.textContent = activityLabel();

      target.append(title, coverage, activity);
    };

    const refresh = async () => {
      render();
      const response = await fetch("/api/library", { cache: "no-store" }).catch(() => undefined);
      if (!response?.ok || cancelled) return;
      const library = await response.json() as LibrarySnapshot;
      if (!cancelled) render(library);
    };

    const onRepair = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };

    if (!ensureSlot()) {
      observer = new MutationObserver(() => {
        if (ensureSlot()) {
          observer?.disconnect();
          void refresh();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      void refresh();
    }

    window.addEventListener("streamall:library-refresh-request", onRepair);
    window.addEventListener(SOURCE_REPAIR_STATUS_EVENT, onRepair);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("streamall:library-refresh-request", onRepair);
      window.removeEventListener(SOURCE_REPAIR_STATUS_EVENT, onRepair);
      document.removeEventListener("visibilitychange", onVisibility);
      slot?.remove();
    };
  }, []);

  return null;
}
