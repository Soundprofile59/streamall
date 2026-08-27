"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { CatalogApiResponse, CatalogArtist, CatalogReleaseDetail, CatalogReleaseGroup, CatalogTrack } from "@/domain/catalog";

const SEARCH_HISTORY_KEY = "streamall:search-history:v1";

function yearOf(date?: string) { return date?.slice(0, 4) || "—"; }
function formatDuration(ms?: number) { if (!ms) return ""; const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

async function catalogRequest(url: string): Promise<CatalogApiResponse> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as (CatalogApiResponse & { message?: string; error?: string }) | null;
  if (!response.ok || !body) {
    const message = body?.error === "CATALOG_UNAVAILABLE" ? "MusicBrainz est temporairement indisponible. Streamall a déjà réessayé automatiquement ; relancez la recherche dans quelques secondes." : body?.message ?? body?.error ?? "Catalogue indisponible";
    throw new Error(message);
  }
  return body;
}

function rememberCatalogSearch(query: string) {
  try {
    const normalized = query.trim(); if (normalized.length < 2) return;
    const current = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]") as Array<{ query?: string; mode?: string }>;
    const next = [{ query: normalized, mode: "catalog" }, ...current.filter((entry) => entry?.query?.toLocaleLowerCase() !== normalized.toLocaleLowerCase())].slice(0, 8);
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next)); window.dispatchEvent(new Event("streamall:search-history-updated"));
  } catch { /* confort local */ }
}

export function CatalogBrowser() {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement>();
  const [query, setQuery] = useState("");
  const [artists, setArtists] = useState<CatalogArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<CatalogArtist>();
  const [releases, setReleases] = useState<CatalogReleaseGroup[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<CatalogReleaseDetail | null>();
  const [loading, setLoading] = useState(false);
  const [importingReleaseIds, setImportingReleaseIds] = useState<string[]>([]);
  const [addedReleaseIds, setAddedReleaseIds] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const libraryDirty = useRef(false);

  function activateBrowser() {
    const contentHost = document.querySelector<HTMLElement>(".content-panel");
    if (!contentHost) return false;
    contentHost.classList.add("catalog-inline-active"); setHost(contentHost); setOpen(true); return true;
  }

  const closeBrowser = useCallback(() => {
    host?.classList.remove("catalog-inline-active");
    setOpen(false); setHost(undefined);
    if (libraryDirty.current) { libraryDirty.current = false; window.setTimeout(() => window.location.reload(), 0); }
  }, [host]);

  useEffect(() => () => { document.querySelector<HTMLElement>(".content-panel")?.classList.remove("catalog-inline-active"); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeBrowser(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [open, closeBrowser]);

  useEffect(() => {
    const onLibraryArtist = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; artistMbid?: string }>).detail;
      const name = detail?.name?.trim();
      const artistMbid = detail?.artistMbid?.trim();
      if (!name || !activateBrowser()) return;
      setQuery(name); setLoading(true); setError(undefined); setImportStatus(undefined); setSelectedRelease(undefined); setReleases([]); setSelectedArtist(undefined); setArtists([]);
      void (async () => {
        try {
          if (artistMbid) {
            const artist: CatalogArtist = { id: artistMbid, name };
            setArtists([artist]);
            setSelectedArtist(artist);
            const releaseBody = await catalogRequest(`/api/catalog?artistId=${encodeURIComponent(artist.id)}`); if (releaseBody.mode === "releases") setReleases(releaseBody.releases);
            return;
          }
          const artistBody = await catalogRequest(`/api/catalog?q=${encodeURIComponent(name)}`); if (artistBody.mode !== "artists") return;
          setArtists(artistBody.artists);
          const exact = artistBody.artists.find((artist) => artist.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
          const artist = exact ?? artistBody.artists[0];
          if (!artist) { setSelectedArtist(undefined); setError("Aucune discographie MusicBrainz trouvée pour cet artiste."); return; }
          setSelectedArtist(artist);
          const releaseBody = await catalogRequest(`/api/catalog?artistId=${encodeURIComponent(artist.id)}`); if (releaseBody.mode === "releases") setReleases(releaseBody.releases);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Discographie indisponible"); } finally { setLoading(false); }
      })();
    };
    window.addEventListener("streamall:open-catalog-artist", onLibraryArtist); return () => window.removeEventListener("streamall:open-catalog-artist", onLibraryArtist);
  }, []);

  function openBrowser() {
    if (!activateBrowser()) return;
    if (!query) { const mainQuery = document.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]')?.value.trim(); if (mainQuery) setQuery(mainQuery); }
  }

  async function searchArtists(event: FormEvent) {
    event.preventDefault(); const value = query.trim(); if (value.length < 2) return; rememberCatalogSearch(value);
    setLoading(true); setError(undefined); setImportStatus(undefined); setSelectedArtist(undefined); setSelectedRelease(undefined); setReleases([]);
    try { const body = await catalogRequest(`/api/catalog?q=${encodeURIComponent(value)}`); if (body.mode === "artists") setArtists(body.artists); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Catalogue indisponible"); setArtists([]); }
    finally { setLoading(false); }
  }

  async function loadArtist(artist: CatalogArtist) {
    setSelectedArtist(artist); setSelectedRelease(undefined); setImportStatus(undefined); setLoading(true); setError(undefined);
    try { const body = await catalogRequest(`/api/catalog?artistId=${encodeURIComponent(artist.id)}`); if (body.mode === "releases") setReleases(body.releases); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Discographie indisponible"); setReleases([]); }
    finally { setLoading(false); }
  }

  async function loadRelease(release: CatalogReleaseGroup) {
    setLoading(true); setImportStatus(undefined); setError(undefined);
    try { const body = await catalogRequest(`/api/catalog?releaseGroupId=${encodeURIComponent(release.id)}`); if (body.mode === "release") setSelectedRelease(body.release ? { ...body.release, genres: release.genres } : null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Tracklist indisponible"); setSelectedRelease(null); }
    finally { setLoading(false); }
  }

  function setReleaseBusy(releaseGroupId: string, busy: boolean) { setImportingReleaseIds((current) => busy ? [...new Set([...current, releaseGroupId])] : current.filter((id) => id !== releaseGroupId)); }

  async function persistAlbum(release: CatalogReleaseDetail) {
    if (!selectedArtist) throw new Error("Artiste introuvable pour cet album.");
    const response = await fetch("/api/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artist: selectedArtist, release }) });
    const body = (await response.json().catch(() => null)) as { albumId?: string; addedTracks?: number; existingTracks?: number; albumCreated?: boolean; message?: string; error?: string } | null;
    if (!response.ok || !body?.albumId) throw new Error(body?.message ?? body?.error ?? "Import impossible");
    const imported = (body.addedTracks ?? 0) > 0 || Boolean(body.albumCreated);
    setAddedReleaseIds((current) => current.includes(release.releaseGroupId) ? current : [...current, release.releaseGroupId]); libraryDirty.current = true;
    setImportStatus(`✓ ${release.title} ${imported ? "ajouté" : "déjà présent"} · ${body.addedTracks ?? 0} nouvelle${(body.addedTracks ?? 0) > 1 ? "s" : ""} piste${(body.addedTracks ?? 0) > 1 ? "s" : ""} · recherche des sources en arrière-plan`);
    void fetch("/api/albums/resolve-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId: body.albumId }) }).catch(() => undefined);
  }

  async function quickAddRelease(release: CatalogReleaseGroup) {
    if (!selectedArtist || importingReleaseIds.includes(release.id) || addedReleaseIds.includes(release.id)) return;
    setReleaseBusy(release.id, true); setError(undefined); setImportStatus(`Ajout de ${release.title}…`);
    try { const body = await catalogRequest(`/api/catalog?releaseGroupId=${encodeURIComponent(release.id)}`); if (body.mode !== "release" || !body.release) throw new Error("Aucune édition officielle exploitable pour cet album."); await persistAlbum({ ...body.release, genres: release.genres }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Import impossible"); }
    finally { setReleaseBusy(release.id, false); }
  }

  async function importSelectedAlbum() {
    if (!selectedRelease || importingReleaseIds.includes(selectedRelease.releaseGroupId) || addedReleaseIds.includes(selectedRelease.releaseGroupId)) return;
    setReleaseBusy(selectedRelease.releaseGroupId, true); setError(undefined); setImportStatus(`Ajout de ${selectedRelease.title}…`);
    try { await persistAlbum(selectedRelease); } catch (caught) { setError(caught instanceof Error ? caught.message : "Import impossible"); } finally { setReleaseBusy(selectedRelease.releaseGroupId, false); }
  }

  function previewTrack(track: CatalogTrack) { window.dispatchEvent(new CustomEvent("streamall:preview-catalog-track", { detail: { artistName: track.artistName, title: track.title } })); }

  const browser = <div className="catalog-inline-mount"><section className="catalog-browser catalog-browser-inline" aria-label="Catalogue albums et EP">
    <header className="catalog-header"><div><p>CATALOGUE CANONIQUE · MUSICBRAINZ</p><h2>Albums & EP</h2></div><button type="button" onClick={closeBrowser} aria-label="Retour à la bibliothèque" title="Retour à la bibliothèque">×</button></header>
    <form className="catalog-search" onSubmit={(event) => void searchArtists(event)}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un artiste…" autoFocus /><button type="submit" disabled={loading || query.trim().length < 2}>{loading ? "…" : "Chercher"}</button></form>
    {error ? <p className="catalog-error">{error}</p> : null}
    <div className="catalog-content">
      {selectedRelease !== undefined ? <div className="catalog-release-detail"><button className="catalog-back" type="button" onClick={() => { setSelectedRelease(undefined); setImportStatus(undefined); }}>← Discographie</button>{selectedRelease ? <>
        <div className="catalog-release-hero"><div className="catalog-cover large" style={selectedRelease.artwork ? { backgroundImage: `url("${selectedRelease.artwork}")` } : undefined}>▦</div><div className="catalog-release-copy"><p>{selectedArtist?.name ?? "Artiste inconnu"} · {selectedRelease.status ?? "Release"} · {yearOf(selectedRelease.date)}{selectedRelease.country ? ` · ${selectedRelease.country}` : ""}</p><h3>{selectedRelease.title}</h3><span>{selectedRelease.tracks.length} piste{selectedRelease.tracks.length > 1 ? "s" : ""}</span>{selectedRelease.genres.length ? <div className="catalog-genre-list">{selectedRelease.genres.map((genre) => <span key={genre}>{genre}</span>)}</div> : null}<div className="catalog-release-actions"><button className="catalog-import-button" type="button" disabled={importingReleaseIds.includes(selectedRelease.releaseGroupId) || addedReleaseIds.includes(selectedRelease.releaseGroupId)} onClick={() => void importSelectedAlbum()}>{addedReleaseIds.includes(selectedRelease.releaseGroupId) ? "✓ Ajouté" : importingReleaseIds.includes(selectedRelease.releaseGroupId) ? "Ajout…" : "+ Ajouter l’album"}</button><small>L’album reste affiché après l’ajout ; les sources de lecture sont recherchées automatiquement en interne.</small></div>{importStatus ? <div className="catalog-import-status">{importStatus}</div> : null}</div></div>
        <div className="catalog-tracklist">{selectedRelease.tracks.map((track) => <div className="catalog-track" key={`${track.position}:${track.title}`}><span className="catalog-track-number">{track.number ?? track.position}</span><span><strong>{track.title}</strong><small>{track.artistName}</small></span><span className="catalog-track-duration">{formatDuration(track.lengthMs)}</span><button className="catalog-track-preview" type="button" onClick={() => previewTrack(track)} title={`Lire ${track.title} dans le lecteur principal`}>▶ Lire</button></div>)}</div>
      </> : <div className="catalog-empty">Aucune édition officielle exploitable trouvée pour cette sortie.</div>}</div>
      : selectedArtist ? <div><div className="catalog-subhead"><button className="catalog-back" type="button" onClick={() => { setSelectedArtist(undefined); setReleases([]); setImportStatus(undefined); }}>← Artistes</button><div><p>DISCOGRAPHIE</p><h3>{selectedArtist.name}</h3></div><span>{releases.length} sortie{releases.length > 1 ? "s" : ""}</span></div>{importStatus ? <div className="catalog-import-status catalog-import-status-grid">{importStatus}</div> : null}<div className="catalog-release-grid">{releases.map((release) => { const busy = importingReleaseIds.includes(release.id); const added = addedReleaseIds.includes(release.id); return <article className="catalog-release-card" key={release.id}><div className="catalog-release-cover-wrap"><button className="catalog-release-cover-open" type="button" onClick={() => void loadRelease(release)} aria-label={`Ouvrir ${release.title}`}><div className="catalog-cover" style={release.artwork ? { backgroundImage: `url("${release.artwork}")` } : undefined}>▦</div></button><button className={`catalog-release-add ${added ? "added" : ""}`} type="button" disabled={busy || added} onClick={() => void quickAddRelease(release)}>{added ? "✓ Ajouté" : busy ? "Ajout…" : "+ Ajouter l’album"}</button></div><button className="catalog-release-copy" type="button" onClick={() => void loadRelease(release)}><strong>{release.title}</strong><small>{release.artistName ?? selectedArtist.name} · {yearOf(release.firstReleaseDate)} · {release.primaryType ?? "Release"}{release.secondaryTypes.length ? ` · ${release.secondaryTypes.join(", ")}` : ""}{release.genres.length ? ` · ${release.genres.slice(0, 2).join(", ")}` : ""}</small></button></article>; })}{!loading && !releases.length ? <div className="catalog-empty">Aucun album ou EP trouvé.</div> : null}</div></div>
      : <div><div className="catalog-subhead"><div><p>RÉSULTATS ARTISTES</p><h3>{artists.length ? `${artists.length} correspondance${artists.length > 1 ? "s" : ""}` : "Cherchez un artiste"}</h3></div></div><div className="catalog-artist-list">{artists.map((artist) => <button type="button" key={artist.id} onClick={() => void loadArtist(artist)}><span className="catalog-artist-mark">◎</span><span><strong>{artist.name}</strong><small>{[artist.type, artist.country, artist.disambiguation].filter(Boolean).join(" · ") || "Artiste MusicBrainz"}</small></span><span>{artist.score !== undefined ? `${artist.score}%` : "→"}</span></button>)}{!loading && !artists.length ? <div className="catalog-empty">Cherchez d’abord l’artiste, puis choisissez l’album ou l’EP à ajouter à votre bibliothèque.</div> : null}</div></div>}
    </div>
    <footer className="catalog-footer"><span>MusicBrainz fournit l’identité, la discographie et les genres. Streamall gère ensuite les sources de lecture automatiquement en interne.</span></footer>
  </section></div>;

  return <><button className="catalog-launcher" type="button" onClick={openBrowser} title="Explorer les albums et EP officiels"><span>▦</span> Albums / EP</button>{open && host ? createPortal(browser, host) : null}</>;
}
