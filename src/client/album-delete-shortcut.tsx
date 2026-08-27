"use client";

import { useEffect } from "react";
import type { LibrarySnapshot } from "@/domain/types";

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("fr");
}

function albumArtists(snapshot: LibrarySnapshot, artistIds: string[]) {
  return artistIds
    .map((id) => snapshot.artists.find((artist) => artist.id === id)?.name)
    .filter(Boolean)
    .join(", ");
}

export function AlbumDeleteShortcut() {
  useEffect(() => {
    let disposed = false;

    async function removeAlbum(tile: HTMLElement) {
      const title = tile.querySelector<HTMLElement>(".album-title-button strong")?.textContent?.trim();
      const meta = tile.querySelector<HTMLElement>(".album-tile-copy > small:not(.album-tile-genres)")?.textContent?.trim() ?? "";
      if (!title) return;

      try {
        const libraryResponse = await fetch("/api/library", { cache: "no-store" });
        if (!libraryResponse.ok) throw new Error("Bibliothèque indisponible");
        const snapshot = (await libraryResponse.json()) as LibrarySnapshot;
        const candidates = snapshot.albums.filter((album) => normalized(album.title) === normalized(title));
        const album = candidates.length === 1
          ? candidates[0]
          : candidates.find((candidate) => {
              const artists = albumArtists(snapshot, candidate.artistIds);
              return artists && normalized(meta).startsWith(normalized(artists));
            });
        if (!album) throw new Error(`Impossible d’identifier précisément l’album « ${title} ».`);

        const trackCount = snapshot.tracks.filter((track) => track.albumId === album.id).length;
        const confirmed = window.confirm(
          `Supprimer l’album « ${album.title} » ?\n\n${trackCount} piste${trackCount > 1 ? "s" : ""} et leur historique seront supprimés de Streamall.`,
        );
        if (!confirmed) return;

        const response = await fetch("/api/albums", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId: album.id }),
        });
        const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
        if (!response.ok) throw new Error(body?.message ?? body?.error ?? "Suppression impossible");

        tile.remove();
        window.setTimeout(() => window.location.reload(), 120);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Suppression impossible");
      }
    }

    function installButtons() {
      if (disposed) return;
      document.querySelectorAll<HTMLElement>(".album-tile").forEach((tile) => {
        if (tile.querySelector(":scope > .album-delete-shortcut")) return;

        // The delete affordance belongs to the cover itself, not to the action capsule.
        // Force a positioning context here so later layout CSS cannot push it below the card.
        tile.style.position = "relative";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "album-delete-shortcut";
        button.textContent = "×";
        button.title = "Supprimer l’album";
        button.setAttribute("aria-label", "Supprimer l’album");
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void removeAlbum(tile);
        });

        // Insert it before the cover button. Even without CSS it can no longer fall
        // underneath the album metadata/actions at the bottom of the card.
        tile.insertBefore(button, tile.firstChild);
      });
    }

    installButtons();
    const observer = new MutationObserver(installButtons);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      document.querySelectorAll(".album-delete-shortcut").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
