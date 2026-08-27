"use client";

import { useEffect, useMemo, useState } from "react";
import type { Album, Artist, LibrarySnapshot } from "@/domain/types";

type ArtistEvent = CustomEvent<{ name?: string }>;

function albumTracks(albumId: string, library: LibrarySnapshot) {
  return library.tracks.filter((track) => track.albumId === albumId);
}

export function LibraryArtistBrowser() {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<LibrarySnapshot>();
  const [artist, setArtist] = useState<Artist>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const onArtist = (event: Event) => {
      const name = (event as ArtistEvent).detail?.name?.trim();
      if (!name) return;

      setOpen(true);
      setLoading(true);
      setError(undefined);
      setArtist(undefined);

      void fetch("/api/library")
        .then(async (response) => {
          if (!response.ok) throw new Error("Bibliothèque indisponible");
          return response.json() as Promise<LibrarySnapshot>;
        })
        .then((snapshot) => {
          const exact = snapshot.artists.find((candidate) => candidate.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
          if (!exact) throw new Error(`« ${name} » n’est plus présent dans la bibliothèque.`);
          setLibrary(snapshot);
          setArtist(exact);
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Discographie indisponible"))
        .finally(() => setLoading(false));
    };

    window.addEventListener("streamall:open-library-artist", onArtist);
    return () => window.removeEventListener("streamall:open-library-artist", onArtist);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const albums = useMemo(() => {
    if (!library || !artist) return [] as Album[];
    return library.albums
      .filter((album) => album.artistIds.includes(artist.id))
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
  }, [artist, library]);

  const looseTracks = useMemo(() => {
    if (!library || !artist) return 0;
    return library.tracks.filter((track) => !track.albumId && track.artistIds.includes(artist.id)).length;
  }, [artist, library]);

  function goToAlbums() {
    setOpen(false);
    const albumsButton = [...document.querySelectorAll<HTMLButtonElement>(".library-nav > button")]
      .find((button) => button.textContent?.trim().startsWith("Albums"));
    albumsButton?.click();
  }

  if (!open) return null;

  return (
    <div className="library-artist-backdrop" onMouseDown={() => setOpen(false)}>
      <section className="library-artist-browser panel" role="dialog" aria-modal="true" aria-label={artist ? `Discographie Streamall de ${artist.name}` : "Discographie Streamall"} onMouseDown={(event) => event.stopPropagation()}>
        <header className="library-artist-header">
          <div>
            <p className="eyebrow">DISCOGRAPHIE STREAMALL</p>
            <h2>{artist?.name ?? "Artiste"}</h2>
            {artist && library ? <p>{albums.length} album{albums.length > 1 ? "s" : ""}{looseTracks ? ` · ${looseTracks} titre${looseTracks > 1 ? "s" : ""} hors album` : ""}</p> : null}
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
        </header>

        {loading ? <div className="library-artist-empty">Chargement de votre discographie…</div> : null}
        {error ? <div className="library-artist-empty error">{error}</div> : null}

        {!loading && !error && library && artist ? (
          albums.length ? <div className="library-artist-albums">
            {albums.map((album) => {
              const tracks = albumTracks(album.id, library);
              const playable = tracks.filter((track) => library.sources.some((source) => source.playableItemId === track.id && source.userEnabled)).length;
              return <article key={album.id} className="library-artist-album">
                <div className="library-artist-cover" style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>{!album.artwork ? "S" : null}</div>
                <strong>{album.title}</strong>
                <small>{album.year ?? "Année inconnue"} · {tracks.length} piste{tracks.length > 1 ? "s" : ""}</small>
                <span>{playable}/{tracks.length} jouable{playable > 1 ? "s" : ""}</span>
              </article>;
            })}
          </div> : <div className="library-artist-empty">Aucun album de cet artiste n’est encore ajouté dans Streamall.</div>
        ) : null}

        <footer className="library-artist-footer">
          <span>Uniquement les albums déjà ajoutés à votre bibliothèque.</span>
          <button type="button" onClick={goToAlbums}>Voir la bibliothèque Albums</button>
        </footer>
      </section>
    </div>
  );
}
