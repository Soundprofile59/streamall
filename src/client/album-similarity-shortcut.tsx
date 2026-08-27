"use client";

import { useEffect, useState } from "react";
import type { Album, LibrarySnapshot } from "@/domain/types";

interface SimilarArtistResult {
  artistMbid?: string;
  name: string;
  score: number;
  albumScore: number;
  artistScore: number;
  signals: Array<"album" | "artist">;
}

interface SimilarityResponse {
  seed: {
    albumId: string;
    albumTitle: string;
    artistName: string;
    artistMbid: string;
    releaseGroupId?: string;
    recordingSeeds: number;
    strategy: "album+artist" | "artist";
  };
  results: SimilarArtistResult[];
}

type Selection = { album: Album; artistName: string };

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("fr");
}

function albumArtists(snapshot: LibrarySnapshot, artistIds: string[]) {
  return artistIds
    .map((id) => snapshot.artists.find((artist) => artist.id === id)?.name)
    .filter(Boolean)
    .join(", ");
}

function SimilarityDialog({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const [data, setData] = useState<SimilarityResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/similarity?albumId=${encodeURIComponent(selection.album.id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as (SimilarityResponse & { error?: string; message?: string }) | null;
        if (!response.ok || !body?.seed) {
          const message = body?.error === "RATE_LIMITED"
            ? "Trop de recherches rapprochées. Réessayez dans quelques secondes."
            : body?.message ?? "Recherche par ressemblance indisponible.";
          throw new Error(message);
        }
        setData(body);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Recherche par ressemblance indisponible.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selection.album.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function openArtist(name: string) {
    onClose();
    window.dispatchEvent(new CustomEvent("streamall:open-catalog-artist", { detail: { name } }));
  }

  const mode = data?.seed.strategy === "album+artist"
    ? `Album + artiste · ${data.seed.recordingSeeds} morceaux-sondes`
    : "Proximité artiste";

  return <div className="similarity-backdrop" onMouseDown={onClose}>
    <section className="similarity-dialog panel" role="dialog" aria-modal="true" aria-label={`Artistes similaires à ${selection.album.title}`} onMouseDown={(event) => event.stopPropagation()}>
      <header className="similarity-header">
        <div>
          <p className="eyebrow">RECHERCHE PAR RESSEMBLANCE</p>
          <h2>{selection.album.title}</h2>
          <p>{selection.artistName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer">×</button>
      </header>

      {loading ? <div className="similarity-loading"><strong>Analyse en cours…</strong><span>MusicBrainz identifie l’album, puis ListenBrainz mesure les proximités d’écoute.</span></div> : null}
      {error ? <div className="similarity-error"><strong>Recherche impossible</strong><span>{error}</span></div> : null}

      {data && !loading ? <>
        <div className="similarity-mode"><span>{mode}</span><small>Indice calculé à partir des habitudes d’écoute ; les genres ne sont pas le critère principal.</small></div>
        <div className="similarity-results">
          {data.results.map((artist, index) => <article className="similarity-row" key={artist.artistMbid ?? `${artist.name}:${index}`}>
            <span className="similarity-rank">{String(index + 1).padStart(2, "0")}</span>
            <button className="similarity-artist" type="button" onClick={() => openArtist(artist.name)} title={`Ouvrir la discographie de ${artist.name}`}>
              <strong>{artist.name}</strong>
              <small>{artist.signals.includes("album") ? "proximité album" : ""}{artist.signals.includes("album") && artist.signals.includes("artist") ? " + " : ""}{artist.signals.includes("artist") ? "proximité artiste" : ""}</small>
            </button>
            <div className="similarity-score" title={`Album ${artist.albumScore}/100 · Artiste ${artist.artistScore}/100`}><strong>{artist.score}</strong><small>/100</small></div>
            <button className="similarity-open" type="button" onClick={() => openArtist(artist.name)}>Discographie →</button>
          </article>)}
          {!data.results.length ? <div className="similarity-empty">ListenBrainz n’a pas encore assez de données pour cette recherche.</div> : null}
        </div>
        <footer className="similarity-footer">ListenBrainz fournit le graphe de proximité d’écoute · MusicBrainz fournit l’identité et les enregistrements de l’album.</footer>
      </> : null}
    </section>
  </div>;
}

export function AlbumSimilarityShortcut() {
  const [selection, setSelection] = useState<Selection>();

  useEffect(() => {
    let disposed = false;
    let libraryCache: { expiresAt: number; snapshot: LibrarySnapshot } | undefined;

    async function loadLibrary() {
      if (libraryCache && libraryCache.expiresAt > Date.now()) return libraryCache.snapshot;
      const response = await fetch("/api/library", { cache: "no-store" });
      if (!response.ok) throw new Error("Bibliothèque indisponible");
      const snapshot = (await response.json()) as LibrarySnapshot;
      libraryCache = { expiresAt: Date.now() + 15_000, snapshot };
      return snapshot;
    }

    async function openSimilarity(tile: HTMLElement) {
      const title = tile.querySelector<HTMLElement>(".album-title-button strong")?.textContent?.trim();
      const meta = tile.querySelector<HTMLElement>(".album-tile-copy > small:not(.album-tile-genres)")?.textContent?.trim() ?? "";
      if (!title) return;

      try {
        const snapshot = await loadLibrary();
        const candidates = snapshot.albums.filter((album) => normalized(album.title) === normalized(title));
        const album = candidates.length === 1
          ? candidates[0]
          : candidates.find((candidate) => {
              const artists = albumArtists(snapshot, candidate.artistIds);
              return artists && normalized(meta).startsWith(normalized(artists));
            });
        if (!album) throw new Error(`Impossible d’identifier précisément l’album « ${title} ».`);
        const artistName = albumArtists(snapshot, album.artistIds) || "Artiste inconnu";
        if (!disposed) setSelection({ album, artistName });
      } catch (caught) {
        window.alert(caught instanceof Error ? caught.message : "Recherche par ressemblance indisponible");
      }
    }

    function installButtons() {
      if (disposed) return;
      document.querySelectorAll<HTMLElement>(".album-tile").forEach((tile) => {
        const actions = tile.querySelector<HTMLElement>(":scope > .album-tile-actions");
        if (!actions || actions.querySelector(":scope > .album-similarity-shortcut")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "album-similarity-shortcut";
        button.textContent = "R";
        button.title = "Rechercher des artistes similaires";
        button.setAttribute("aria-label", `Rechercher des artistes similaires à ${tile.querySelector<HTMLElement>(".album-title-button strong")?.textContent?.trim() ?? "cet album"}`);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void openSimilarity(tile);
        });
        actions.insertBefore(button, actions.firstChild);
      });
    }

    installButtons();
    const observer = new MutationObserver(installButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer.disconnect();
      document.querySelectorAll(".album-similarity-shortcut").forEach((node) => node.remove());
    };
  }, []);

  return selection ? <SimilarityDialog selection={selection} onClose={() => setSelection(undefined)} /> : null;
}