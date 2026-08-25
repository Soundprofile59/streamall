"use client";

import { useMemo, useState } from "react";
import type { Album, Artist, LibrarySnapshot, PlayableItem, Track } from "@/domain/types";

export type LibrarySection = "tracks" | "mixes" | "albums" | "artists" | "genres" | "moods";

type Props = {
  section: LibrarySection;
  library: LibrarySnapshot;
  selectedId?: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onPlayAlbum: (albumId: string) => void;
  onToggleArtist: (artistId: string) => void;
  onRandomTag: (kind: "genres" | "moods", tag: string) => void;
};

function artistLabel(ids: string[], library: LibrarySnapshot) {
  return ids
    .map((id) => library.artists.find((artist) => artist.id === id)?.name)
    .filter(Boolean)
    .join(", ") || "Artiste inconnu";
}

function duration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function rating(item: PlayableItem) {
  if (item.rating !== undefined) return item.rating;
  if (item.favorite) return 5;
  if (item.frequencyPreference === "MORE") return 4;
  if (item.frequencyPreference === "LESS") return 2;
  return undefined;
}

function sourceCount(itemId: string, library: LibrarySnapshot) {
  return library.sources.filter((source) => source.playableItemId === itemId && source.userEnabled).length;
}

function albumStats(album: Album, library: LibrarySnapshot) {
  const tracks = library.tracks
    .filter((track) => track.albumId === album.id)
    .sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));
  const playable = tracks.filter((track) => sourceCount(track.id, library) > 0).length;
  return { tracks, playable };
}

function searchSources(track: Track, library: LibrarySnapshot) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
  if (!input) return;
  const value = `${artistLabel(track.artistIds, library)} ${track.title}`;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.form?.requestSubmit();
  input.focus();
}

function AlbumCard({ album, library, onOpen, onPlay }: { album: Album; library: LibrarySnapshot; onOpen: () => void; onPlay: () => void }) {
  const { tracks, playable } = albumStats(album, library);
  const artists = artistLabel(album.artistIds, library);
  return (
    <article className="album-tile">
      <button className="album-cover-button" type="button" onClick={onOpen} aria-label={`Ouvrir ${album.title}`}>
        <span className="album-cover" style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>
          {!album.artwork ? <span className="album-cover-fallback">S</span> : null}
          <span className="album-hover-info">
            <strong>{tracks.length} piste{tracks.length > 1 ? "s" : ""}</strong>
            <small>{playable ? `${playable} avec source` : "Sources à trouver"}</small>
            <span>Ouvrir</span>
          </span>
        </span>
      </button>
      <div className="album-tile-copy">
        <button type="button" className="album-title-button" onClick={onOpen}><strong>{album.title}</strong></button>
        <small>{artists}{album.year ? ` · ${album.year}` : ""}</small>
      </div>
      <button className="album-quick-play" type="button" disabled={!playable} onClick={onPlay} title={playable ? "Lire les pistes disponibles" : "Aucune source de lecture disponible"}>▶</button>
    </article>
  );
}

function AlbumDetail({ album, library, selectedId, onBack, onSelectItem, onPlayItem, onPlayAlbum }: {
  album: Album;
  library: LibrarySnapshot;
  selectedId?: string;
  onBack: () => void;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onPlayAlbum: (albumId: string) => void;
}) {
  const { tracks, playable } = albumStats(album, library);
  const artists = artistLabel(album.artistIds, library);
  return (
    <div className="album-detail-view">
      <button className="collection-back" type="button" onClick={onBack}>← Albums</button>
      <div className="album-detail-hero">
        <div className="album-detail-cover" style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>{!album.artwork ? "S" : null}</div>
        <div className="album-detail-copy">
          <p className="eyebrow">ALBUM</p>
          <h2>{album.title}</h2>
          <p>{artists}{album.year ? ` · ${album.year}` : ""}</p>
          <div className="album-detail-stats"><span>{tracks.length} piste{tracks.length > 1 ? "s" : ""}</span><span>{playable}/{tracks.length} avec source</span></div>
          <button className="album-play-all" type="button" disabled={!playable} onClick={() => onPlayAlbum(album.id)}>▶ Lire les pistes disponibles</button>
        </div>
      </div>
      <div className="album-library-tracklist">
        {tracks.map((track) => {
          const sources = sourceCount(track.id, library);
          const stars = rating(track);
          return (
            <div key={track.id} className={`album-library-track ${selectedId === track.id ? "selected" : ""}`}>
              <span className="album-track-number">{track.trackNumber ?? "–"}</span>
              <button className="album-track-title" type="button" onClick={() => onSelectItem(track.id)}>
                <strong>{track.title}</strong>
                <small>{artistLabel(track.artistIds, library)}{stars ? ` · ${"★".repeat(stars)}` : ""}</small>
              </button>
              <span className="album-track-duration">{duration(track.duration)}</span>
              <span className={`album-source-state ${sources ? "ready" : "missing"}`}>{sources ? `${sources} source${sources > 1 ? "s" : ""}` : "Sans source"}</span>
              {sources ? <button className="album-track-action" type="button" onClick={() => onPlayItem(track.id)}>▶</button> : <button className="album-track-action find" type="button" onClick={() => searchSources(track, library)}>Trouver</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackList({ items, library, selectedId, onSelectItem, onPlayItem }: { items: PlayableItem[]; library: LibrarySnapshot; selectedId?: string; onSelectItem: (itemId: string) => void; onPlayItem: (itemId: string) => void }) {
  return (
    <div className="collection-track-list">
      {items.map((item) => {
        const stars = rating(item);
        const sources = sourceCount(item.id, library);
        const album = item.kind === "track" && item.albumId ? library.albums.find((candidate) => candidate.id === item.albumId) : undefined;
        return (
          <div key={item.id} className={`collection-track-row ${selectedId === item.id ? "selected" : ""}`}>
            <div className="collection-mini-cover" style={item.artwork ? { backgroundImage: `url("${item.artwork}")` } : undefined}>{!item.artwork ? item.title.slice(0, 1) : null}</div>
            <button className="collection-track-copy" type="button" onClick={() => onSelectItem(item.id)}>
              <strong>{item.title}</strong>
              <small>{artistLabel(item.artistIds, library)}{album ? ` · ${album.title}` : ""} · {item.kind === "mix" ? "Mix" : duration(item.duration)}</small>
            </button>
            <span className="collection-track-meta">{stars ? "★".repeat(stars) : "Non noté"}</span>
            {sources ? <button className="collection-row-play" type="button" onClick={() => onPlayItem(item.id)}>▶</button> : item.kind === "track" ? <button className="collection-find-source" type="button" onClick={() => searchSources(item, library)}>Source</button> : <span className="collection-no-source">—</span>}
          </div>
        );
      })}
    </div>
  );
}

function ArtistList({ artists, library, onToggle }: { artists: Artist[]; library: LibrarySnapshot; onToggle: (artistId: string) => void }) {
  return <div className="artist-card-grid">{artists.map((artist) => {
    const albums = library.albums.filter((album) => album.artistIds.includes(artist.id)).length;
    const tracks = library.tracks.filter((track) => track.artistIds.includes(artist.id)).length;
    return <article key={artist.id} className={`artist-card ${artist.disabled ? "disabled" : ""}`}><span className="artist-card-mark">◎</span><div><strong>{artist.name}</strong><small>{albums} album{albums > 1 ? "s" : ""} · {tracks} titre{tracks > 1 ? "s" : ""}</small></div><button type="button" onClick={() => onToggle(artist.id)}>{artist.disabled ? "Réactiver" : "Désactiver"}</button></article>;
  })}</div>;
}

export function CollectionView({ section, library, selectedId, onSelectItem, onPlayItem, onPlayAlbum, onToggleArtist, onRandomTag }: Props) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>();
  const selectedAlbum = library.albums.find((album) => album.id === selectedAlbumId);
  const looseTracks = useMemo(() => library.tracks.filter((track) => !track.albumId), [library.tracks]);

  const title = section === "albums" ? "Vos albums" : section === "tracks" ? "Tous les titres" : section === "mixes" ? "Vos mixes" : section === "artists" ? "Vos artistes" : section === "genres" ? "Genres" : "Ambiances";

  if (section === "albums" && selectedAlbum) {
    return <AlbumDetail album={selectedAlbum} library={library} selectedId={selectedId} onBack={() => setSelectedAlbumId(undefined)} onSelectItem={onSelectItem} onPlayItem={onPlayItem} onPlayAlbum={onPlayAlbum} />;
  }

  return (
    <div className={`collection-view section-${section}`}>
      <div className="section-heading collection-heading">
        <div><p className="eyebrow">{section.toUpperCase()}</p><h2>{title}</h2></div>
        {section === "albums" && looseTracks.length ? <span className="collection-summary">{looseTracks.length} titre{looseTracks.length > 1 ? "s" : ""} hors album</span> : null}
      </div>

      {section === "albums" ? (
        library.albums.length ? <div className="album-mosaic">{library.albums.map((album) => <AlbumCard key={album.id} album={album} library={library} onOpen={() => setSelectedAlbumId(album.id)} onPlay={() => onPlayAlbum(album.id)} />)}</div> : <div className="empty-state"><p>Aucun album pour l’instant.</p><span>Ajoutez un album depuis le catalogue MusicBrainz.</span></div>
      ) : null}

      {section === "tracks" ? (library.tracks.length ? <TrackList items={library.tracks} library={library} selectedId={selectedId} onSelectItem={onSelectItem} onPlayItem={onPlayItem} /> : <div className="empty-state"><p>Votre collection est prête à être remplie.</p><span>Utilisez la recherche ou le catalogue Albums / EP.</span></div>) : null}
      {section === "mixes" ? (library.mixes.length ? <TrackList items={library.mixes} library={library} selectedId={selectedId} onSelectItem={onSelectItem} onPlayItem={onPlayItem} /> : <div className="empty-state"><p>Aucun mix pour l’instant.</p></div>) : null}
      {section === "artists" ? <ArtistList artists={library.artists} library={library} onToggle={onToggleArtist} /> : null}
      {(section === "genres" || section === "moods") ? <div className="tag-card-grid">{(section === "genres" ? library.genres : library.moods).map((tag) => <button key={tag} className="tag-tile" type="button" onClick={() => onRandomTag(section, tag)}><strong>{tag}</strong><span>Lancer Random</span></button>)}</div> : null}
    </div>
  );
}
