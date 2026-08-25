"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CatalogApiResponse, CatalogArtist, CatalogReleaseDetail, CatalogReleaseGroup, CatalogTrack } from "@/domain/catalog";

function yearOf(date?: string) {
  return date?.slice(0, 4) || "—";
}

function formatDuration(ms?: number) {
  if (!ms) return "";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function catalogRequest(url: string): Promise<CatalogApiResponse> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as (CatalogApiResponse & { message?: string; error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message ?? body?.error ?? "Catalogue indisponible");
  return body;
}

function pushTrackToMainSearch(track: CatalogTrack) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, `${track.artistName} ${track.title}`);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.form?.requestSubmit();
  input.focus();
  return true;
}

export function CatalogBrowser() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [artists, setArtists] = useState<CatalogArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<CatalogArtist>();
  const [releases, setReleases] = useState<CatalogReleaseGroup[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<CatalogReleaseDetail | null>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openBrowser() {
    if (!query) {
      const mainQuery = document.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]')?.value.trim();
      if (mainQuery) setQuery(mainQuery);
    }
    setOpen(true);
  }

  async function searchArtists(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    setLoading(true);
    setError(undefined);
    setImportStatus(undefined);
    setSelectedArtist(undefined);
    setSelectedRelease(undefined);
    setReleases([]);
    try {
      const body = await catalogRequest(`/api/catalog?q=${encodeURIComponent(value)}`);
      if (body.mode === "artists") setArtists(body.artists);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Catalogue indisponible");
      setArtists([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadArtist(artist: CatalogArtist) {
    setSelectedArtist(artist);
    setSelectedRelease(undefined);
    setImportStatus(undefined);
    setLoading(true);
    setError(undefined);
    try {
      const body = await catalogRequest(`/api/catalog?artistId=${encodeURIComponent(artist.id)}`);
      if (body.mode === "releases") setReleases(body.releases);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Discographie indisponible");
      setReleases([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadRelease(release: CatalogReleaseGroup) {
    setLoading(true);
    setImportStatus(undefined);
    setError(undefined);
    try {
      const body = await catalogRequest(`/api/catalog?releaseGroupId=${encodeURIComponent(release.id)}`);
      if (body.mode === "release") setSelectedRelease(body.release);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tracklist indisponible");
      setSelectedRelease(null);
    } finally {
      setLoading(false);
    }
  }

  async function importAlbum() {
    if (!selectedArtist || !selectedRelease || importing) return;
    setImporting(true);
    setError(undefined);
    setImportStatus(undefined);
    try {
      const response = await fetch("/api/catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist: selectedArtist, release: selectedRelease }),
      });
      const body = (await response.json().catch(() => null)) as {
        addedTracks?: number;
        existingTracks?: number;
        albumCreated?: boolean;
        message?: string;
        error?: string;
      } | null;
      if (!response.ok || !body) throw new Error(body?.message ?? body?.error ?? "Import impossible");

      if ((body.addedTracks ?? 0) === 0 && !body.albumCreated) {
        setImportStatus(`✓ Album déjà présent · ${body.existingTracks ?? selectedRelease.tracks.length} pistes reconnues`);
      } else {
        setImportStatus(`✓ Album ajouté · ${body.addedTracks ?? 0} piste${(body.addedTracks ?? 0) > 1 ? "s" : ""} créée${(body.addedTracks ?? 0) > 1 ? "s" : ""}`);
        window.history.replaceState(null, "", "/?section=albums");
        window.setTimeout(() => window.location.reload(), 900);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import impossible");
    } finally {
      setImporting(false);
    }
  }

  function searchSources(track: CatalogTrack) {
    if (pushTrackToMainSearch(track)) setOpen(false);
  }

  return (
    <>
      <button className="catalog-launcher" type="button" onClick={openBrowser} title="Explorer les albums et EP officiels">
        <span>▦</span> Albums / EP
      </button>

      {open ? <div className="catalog-backdrop" onMouseDown={() => setOpen(false)}>
        <section className="catalog-browser" role="dialog" aria-modal="true" aria-label="Catalogue albums et EP" onMouseDown={(event) => event.stopPropagation()}>
          <header className="catalog-header">
            <div>
              <p>CATALOGUE CANONIQUE · MUSICBRAINZ</p>
              <h2>Albums & EP</h2>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
          </header>

          <form className="catalog-search" onSubmit={(event) => void searchArtists(event)}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un artiste…" autoFocus />
            <button type="submit" disabled={loading || query.trim().length < 2}>{loading ? "…" : "Chercher"}</button>
          </form>

          {error ? <p className="catalog-error">{error}</p> : null}

          <div className="catalog-content">
            {selectedRelease !== undefined ? (
              <div className="catalog-release-detail">
                <button className="catalog-back" type="button" onClick={() => { setSelectedRelease(undefined); setImportStatus(undefined); }}>← Discographie</button>
                {selectedRelease ? <>
                  <div className="catalog-release-hero">
                    <div className="catalog-cover large" style={selectedRelease.artwork ? { backgroundImage: `url("${selectedRelease.artwork}")` } : undefined}>▦</div>
                    <div className="catalog-release-copy">
                      <p>{selectedRelease.status ?? "Release"} · {yearOf(selectedRelease.date)}{selectedRelease.country ? ` · ${selectedRelease.country}` : ""}</p>
                      <h3>{selectedRelease.title}</h3>
                      <span>{selectedRelease.tracks.length} piste{selectedRelease.tracks.length > 1 ? "s" : ""}</span>
                      <div className="catalog-release-actions">
                        <button className="catalog-import-button" type="button" disabled={importing} onClick={() => void importAlbum()}>
                          {importing ? "Ajout…" : "+ Ajouter l’album complet"}
                        </button>
                        <small>Crée l’album et toutes ses pistes dans Streamall. Les sources de lecture peuvent être résolues ensuite.</small>
                      </div>
                      {importStatus ? <div className="catalog-import-status">{importStatus}</div> : null}
                    </div>
                  </div>
                  <div className="catalog-tracklist">
                    {selectedRelease.tracks.map((track) => <div className="catalog-track" key={`${track.position}:${track.title}`}>
                      <span className="catalog-track-number">{track.number ?? track.position}</span>
                      <span><strong>{track.title}</strong><small>{track.artistName}</small></span>
                      <span className="catalog-track-duration">{formatDuration(track.lengthMs)}</span>
                      <button type="button" onClick={() => searchSources(track)}>Sources</button>
                    </div>)}
                  </div>
                </> : <div className="catalog-empty">Aucune édition officielle exploitable trouvée pour cette sortie.</div>}
              </div>
            ) : selectedArtist ? (
              <div>
                <div className="catalog-subhead">
                  <button className="catalog-back" type="button" onClick={() => { setSelectedArtist(undefined); setReleases([]); setImportStatus(undefined); }}>← Artistes</button>
                  <div><p>DISCOGRAPHIE</p><h3>{selectedArtist.name}</h3></div>
                  <span>{releases.length} sortie{releases.length > 1 ? "s" : ""}</span>
                </div>
                <div className="catalog-release-grid">
                  {releases.map((release) => <button className="catalog-release-card" type="button" key={release.id} onClick={() => void loadRelease(release)}>
                    <div className="catalog-cover" style={release.artwork ? { backgroundImage: `url("${release.artwork}")` } : undefined}>▦</div>
                    <span><strong>{release.title}</strong><small>{yearOf(release.firstReleaseDate)} · {release.primaryType ?? "Release"}{release.secondaryTypes.length ? ` · ${release.secondaryTypes.join(", ")}` : ""}</small></span>
                  </button>)}
                  {!loading && !releases.length ? <div className="catalog-empty">Aucun album ou EP trouvé.</div> : null}
                </div>
              </div>
            ) : (
              <div>
                <div className="catalog-subhead"><div><p>RÉSULTATS ARTISTES</p><h3>{artists.length ? `${artists.length} correspondance${artists.length > 1 ? "s" : ""}` : "Cherchez un artiste"}</h3></div></div>
                <div className="catalog-artist-list">
                  {artists.map((artist) => <button type="button" key={artist.id} onClick={() => void loadArtist(artist)}>
                    <span className="catalog-artist-mark">◎</span>
                    <span><strong>{artist.name}</strong><small>{[artist.type, artist.country, artist.disambiguation].filter(Boolean).join(" · ") || "Artiste MusicBrainz"}</small></span>
                    <span>{artist.score !== undefined ? `${artist.score}%` : "→"}</span>
                  </button>)}
                  {!loading && !artists.length ? <div className="catalog-empty">Cherchez d’abord l’artiste, puis choisissez l’album ou l’EP à ajouter à votre bibliothèque.</div> : null}
                </div>
              </div>
            )}
          </div>

          <footer className="catalog-footer">
            <span>MusicBrainz fournit la structure canonique. « Ajouter l’album complet » crée les pistes même sans source ; « Sources » cherche ensuite une lecture disponible.</span>
          </footer>
        </section>
      </div> : null}
    </>
  );
}
