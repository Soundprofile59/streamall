"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Album, Artist, LibrarySnapshot, PlayableItem, Track } from "@/domain/types";

export type LibrarySection = "tracks" | "mixes" | "albums" | "artists" | "genres" | "moods";

type Props = {
  section: LibrarySection;
  library: LibrarySnapshot;
  selectedId?: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onPlayAlbum: (albumId: string) => void;
  onQueueAlbum: (albumId: string) => void;
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

function albumRating(album: Album) {
  return album.rating ?? (album.favorite ? 5 : undefined);
}

function ratingMeaning(value?: number) {
  return value === 1
    ? "Très rarement"
    : value === 2
      ? "Moins souvent"
      : value === 3
        ? "Fréquence normale"
        : value === 4
          ? "Souvent"
          : value === 5
            ? "Très souvent"
            : "Non noté · fréquence normale";
}

function sourceCount(itemId: string, library: LibrarySnapshot) {
  return library.sources.filter((source) => source.playableItemId === itemId && source.userEnabled).length;
}

function albumStats(album: Album, library: LibrarySnapshot) {
  const tracks = library.tracks
    .filter((track) => track.albumId === album.id)
    .sort((a, b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));
  const playable = tracks.filter((track) => sourceCount(track.id, library) > 0).length;
  const sources = tracks.reduce((total, track) => total + sourceCount(track.id, library), 0);
  return { tracks, playable, sources };
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

function openArtistDiscography(artist: Artist) {
  window.dispatchEvent(new CustomEvent("streamall:open-catalog-artist", { detail: { name: artist.name } }));
}

function AlbumCard({ album, library, onOpen, onInspect, onPlay, onQueue }: {
  album: Album;
  library: LibrarySnapshot;
  onOpen: () => void;
  onInspect: () => void;
  onPlay: () => void;
  onQueue: () => void;
}) {
  const { tracks, playable } = albumStats(album, library);
  const artists = artistLabel(album.artistIds, library);
  const genres = album.genres ?? [];
  const stars = albumRating(album);
  return (
    <article className="album-tile">
      <button className="album-cover-button" type="button" onClick={onOpen} aria-label={`Ouvrir ${album.title}`}>
        <span className="album-cover" style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>
          {!album.artwork ? <span className="album-cover-fallback">S</span> : null}
          <span className="album-hover-info">
            <strong>{tracks.length} piste{tracks.length > 1 ? "s" : ""}</strong>
            <small>{playable ? `${playable} avec source` : "Sources à trouver"}</small>
            {genres.length ? <small>{genres.slice(0, 2).join(" · ")}</small> : null}
            <span>Ouvrir l’album</span>
          </span>
        </span>
      </button>
      <div className="album-tile-copy">
        <button type="button" className="album-title-button" onClick={onOpen}><strong>{album.title}</strong></button>
        <small>{artists}{album.year ? ` · ${album.year}` : ""}{stars ? ` · ${"★".repeat(stars)}` : ""}</small>
      </div>
      <div className="album-tile-actions">
        <button className="album-info-shortcut" type="button" onClick={onInspect} title="Informations de l’album" aria-label={`Informations de ${album.title}`}>ⓘ</button>
        <button className="album-queue-shortcut" type="button" onClick={onQueue} title="Mettre l’album dans la file d’attente" aria-label={`Mettre ${album.title} dans la file d’attente`}>＋</button>
        <button className="album-quick-play" type="button" onClick={onPlay} title={playable ? "Lire l’album en priorité" : "Chercher automatiquement une source puis lire"}>▶</button>
      </div>
    </article>
  );
}

function AlbumDetail({ album, library, selectedId, resolving, resolveStatus, onBack, onInspect, onResolve, onQueue, onSelectItem, onPlayItem, onPlayAlbum }: {
  album: Album;
  library: LibrarySnapshot;
  selectedId?: string;
  resolving: boolean;
  resolveStatus?: string;
  onBack: () => void;
  onInspect: () => void;
  onResolve: () => void;
  onQueue: () => void;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onPlayAlbum: (albumId: string) => void;
}) {
  const { tracks, playable, sources } = albumStats(album, library);
  const artists = artistLabel(album.artistIds, library);
  const genres = album.genres ?? [];
  const stars = albumRating(album);
  return (
    <div className="album-detail-view">
      <div className="album-detail-toolbar">
        <button className="collection-back" type="button" onClick={onBack}>← Albums</button>
        <button className="album-info-button" type="button" onClick={onInspect}>ⓘ Infos album</button>
      </div>
      <div className="album-detail-hero">
        <button className="album-detail-cover album-detail-cover-button" type="button" onClick={onInspect} style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>{!album.artwork ? "S" : null}</button>
        <div className="album-detail-copy">
          <p className="eyebrow">ALBUM</p>
          <button className="album-detail-title-button" type="button" onClick={onInspect}><h2>{album.title}</h2></button>
          <p>{artists}{album.year ? ` · ${album.year}` : ""}{stars ? ` · ${"★".repeat(stars)}` : ""}</p>
          {genres.length ? <div className="album-genre-list">{genres.map((genre) => <span key={genre}>{genre}</span>)}</div> : null}
          <div className="album-detail-stats"><span>{tracks.length} piste{tracks.length > 1 ? "s" : ""}</span><span>{playable}/{tracks.length} avec source</span><span>{sources} source{sources > 1 ? "s" : ""}</span></div>
          <div className="album-detail-actions">
            <button className="album-play-all" type="button" onClick={() => onPlayAlbum(album.id)}>▶ Lire l’album</button>
            <button className="album-queue-button" type="button" onClick={onQueue}>＋ File d’attente</button>
            <button className="album-resolve-button" type="button" disabled={resolving} onClick={onResolve}>{resolving ? "Recherche…" : "⟳ Rechercher les sources"}</button>
          </div>
          {resolveStatus ? <p className="album-resolve-status">{resolveStatus}</p> : null}
        </div>
      </div>
      <div className="album-library-tracklist">
        {tracks.map((track) => {
          const sourcesForTrack = sourceCount(track.id, library);
          const starsForTrack = rating(track);
          return (
            <div key={track.id} className={`album-library-track ${selectedId === track.id ? "selected" : ""}`}>
              <span className="album-track-number">{track.trackNumber ?? "–"}</span>
              <button className="album-track-title" type="button" onClick={() => onSelectItem(track.id)}>
                <strong>{track.title}</strong>
                <small>{artistLabel(track.artistIds, library)}{starsForTrack ? ` · ${"★".repeat(starsForTrack)}` : ""}</small>
              </button>
              <span className="album-track-duration">{duration(track.duration)}</span>
              <span className={`album-source-state ${sourcesForTrack ? "ready" : "missing"}`}>{sourcesForTrack ? `${sourcesForTrack} source${sourcesForTrack > 1 ? "s" : ""}` : "Sans source"}</span>
              {sourcesForTrack ? <button className="album-track-action" type="button" onClick={() => onPlayItem(track.id)}>▶</button> : <button className="album-track-action find" type="button" onClick={() => searchSources(track, library)}>Trouver</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlbumInfoPanel({ album, library, resolving, resolveStatus, onClose, onResolve, onQueue, onPlay }: {
  album: Album;
  library: LibrarySnapshot;
  resolving: boolean;
  resolveStatus?: string;
  onClose: () => void;
  onResolve: () => void;
  onQueue: () => void;
  onPlay: () => void;
}) {
  const [title, setTitle] = useState(album.title);
  const [year, setYear] = useState(album.year ? String(album.year) : "");
  const [personalRating, setPersonalRating] = useState<number | undefined>(albumRating(album));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const { tracks, playable, sources } = albumStats(album, library);
  const artists = artistLabel(album.artistIds, library);
  const genres = album.genres ?? [];

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setStatus(undefined);
    try {
      const response = await fetch("/api/albums", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: album.id, title: title.trim(), ...(year ? { year: Number(year) } : {}), rating: personalRating ?? null }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? body?.error ?? "Modification impossible");
      setStatus("✓ Informations enregistrées");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Modification impossible");
    } finally {
      setBusy(false);
    }
  }

  async function removeAlbum() {
    if (busy) return;
    if (!window.confirm(`Supprimer l’album « ${album.title} » ?\n\n${tracks.length} piste${tracks.length > 1 ? "s" : ""}, leurs sources et leur historique seront supprimés de Streamall.`)) return;
    setBusy(true);
    setStatus("Suppression…");
    try {
      const response = await fetch("/api/albums", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: album.id }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? body?.error ?? "Suppression impossible");
      window.history.replaceState(null, "", "/?section=albums");
      window.location.reload();
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Suppression impossible");
      setBusy(false);
    }
  }

  return (
    <div className="album-info-backdrop" onMouseDown={onClose}>
      <aside className="album-info-drawer panel" role="dialog" aria-modal="true" aria-label={`Informations de l’album ${album.title}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="album-info-header">
          <div><p className="eyebrow">MÉTADONNÉES ALBUM</p><h2>{album.title}</h2><p>{artists}</p></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="album-info-cover" style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>{!album.artwork ? "S" : null}</div>
        <div className="album-info-primary-actions">
          <button type="button" onClick={onPlay}>▶ Lire</button>
          <button type="button" onClick={onQueue}>＋ File d’attente</button>
        </div>
        <div className="album-info-stats"><span><strong>{tracks.length}</strong> pistes</span><span><strong>{playable}</strong> jouables</span><span><strong>{sources}</strong> sources</span></div>
        {genres.length ? <div className="album-genre-list info">{genres.map((genre) => <span key={genre}>{genre}</span>)}</div> : <p className="album-no-genres">Genres non renseignés · ils seront ajoutés automatiquement lors de l’enrichissement catalogue.</p>}
        <form className="album-info-form" onSubmit={(event) => void save(event)}>
          <div className="rating-row album-rating-row">
            <div><strong>Préférence de l’album</strong><small>{ratingMeaning(personalRating)} · sert de préférence par défaut pour ses pistes dans Random</small></div>
            <div className="star-rating" role="group" aria-label="Préférence de l’album de 1 à 5 étoiles">
              {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= (personalRating ?? 0) ? "filled" : ""} aria-label={`${value} étoile${value > 1 ? "s" : ""}`} aria-pressed={personalRating === value} title={`${value}/5 · ${ratingMeaning(value)}`} onClick={() => setPersonalRating(personalRating === value ? undefined : value)}>★</button>)}
            </div>
          </div>
          <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={400} /></label>
          <label>Année<input type="number" min="1000" max="3000" value={year} onChange={(event) => setYear(event.target.value)} placeholder="Non renseignée" /></label>
          <button className="album-save-button" type="submit" disabled={busy || !title.trim()}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </form>
        <div className="album-info-source-block">
          <strong>Sources de lecture</strong>
          <p>Streamall relie les pistes aux plateformes sans modifier l’identité canonique de l’album.</p>
          <button type="button" disabled={resolving || busy} onClick={onResolve}>{resolving ? "Recherche en cours…" : "⟳ Rechercher les sources manquantes"}</button>
          {resolveStatus ? <small>{resolveStatus}</small> : null}
        </div>
        {status ? <p className="album-info-status">{status}</p> : null}
        <div className="album-info-danger">
          <strong>Supprimer de la bibliothèque</strong>
          <p>Supprime l’album, ses pistes, leurs sources et l’historique associé.</p>
          <button type="button" disabled={busy} onClick={() => void removeAlbum()}>Supprimer l’album</button>
        </div>
      </aside>
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
  const [showDisabled, setShowDisabled] = useState(false);
  const disabledCount = artists.filter((artist) => artist.disabled).length;
  const visibleArtists = [...artists]
    .filter((artist) => showDisabled || !artist.disabled)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  return <>
    <div className="artist-list-toolbar">
      <span>{visibleArtists.length} artiste{visibleArtists.length > 1 ? "s" : ""}</span>
      {disabledCount ? <button type="button" onClick={() => setShowDisabled((value) => !value)}>{showDisabled ? "Masquer les désactivés" : `Afficher ${disabledCount} désactivé${disabledCount > 1 ? "s" : ""}`}</button> : null}
    </div>
    <div className="artist-card-grid">{visibleArtists.map((artist) => {
      const albums = library.albums.filter((album) => album.artistIds.includes(artist.id)).length;
      const tracks = library.tracks.filter((track) => track.artistIds.includes(artist.id)).length;
      return <article key={artist.id} className={`artist-card ${artist.disabled ? "disabled" : ""}`}>
        <span className="artist-card-mark">◎</span>
        <button className="artist-card-main" type="button" onClick={() => openArtistDiscography(artist)} title={`Ouvrir la discographie de ${artist.name}`}><strong>{artist.name}</strong><small>{albums} album{albums > 1 ? "s" : ""} · {tracks} titre{tracks > 1 ? "s" : ""}</small></button>
        <button className="artist-disable-button" type="button" onClick={() => onToggle(artist.id)}>{artist.disabled ? "Réactiver" : "Désactiver"}</button>
      </article>;
    })}</div>
    {!visibleArtists.length ? <div className="empty-state"><p>Aucun artiste actif.</p>{disabledCount ? <span>Utilisez « Afficher les désactivés » pour les réactiver.</span> : null}</div> : null}
  </>;
}

export function CollectionView({ section, library, selectedId, onSelectItem, onPlayItem, onPlayAlbum, onQueueAlbum, onToggleArtist, onRandomTag }: Props) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>();
  const [inspectedAlbumId, setInspectedAlbumId] = useState<string>();
  const [resolvingAlbumId, setResolvingAlbumId] = useState<string>();
  const [resolveStatus, setResolveStatus] = useState<string>();
  const selectedAlbum = library.albums.find((album) => album.id === selectedAlbumId);
  const inspectedAlbum = library.albums.find((album) => album.id === inspectedAlbumId);
  const looseTracks = useMemo(() => library.tracks.filter((track) => !track.albumId), [library.tracks]);
  const genreTags = useMemo(() => [...new Set([
    ...library.albums.flatMap((album) => album.genres ?? []),
    ...library.tracks.flatMap((track) => track.genres),
    ...library.mixes.flatMap((mix) => mix.genres),
  ])].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })), [library.albums, library.tracks, library.mixes]);

  async function resolveAlbum(albumId: string) {
    if (resolvingAlbumId) return;
    setResolvingAlbumId(albumId);
    setResolveStatus("Recherche sur YouTube, Audius et Jamendo…");
    try {
      const response = await fetch("/api/albums/resolve-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId }),
      });
      const body = (await response.json().catch(() => null)) as { addedSources?: number; matchedTracks?: number; searchedCandidates?: number; message?: string; error?: string } | null;
      if (!response.ok || !body) throw new Error(body?.message ?? body?.error ?? "Recherche impossible");
      const message = body.addedSources
        ? `✓ ${body.matchedTracks ?? 0} piste${(body.matchedTracks ?? 0) > 1 ? "s" : ""} reliée${(body.matchedTracks ?? 0) > 1 ? "s" : ""} · ${body.addedSources} nouvelle${body.addedSources > 1 ? "s" : ""} source${body.addedSources > 1 ? "s" : ""}`
        : `Aucune correspondance suffisamment sûre parmi ${body.searchedCandidates ?? 0} résultats.`;
      setResolveStatus(message);
      if (body.addedSources) window.setTimeout(() => window.location.reload(), 900);
    } catch (caught) {
      setResolveStatus(caught instanceof Error ? caught.message : "Recherche impossible");
    } finally {
      setResolvingAlbumId(undefined);
    }
  }

  const title = section === "albums" ? "Vos albums" : section === "tracks" ? "Tous les titres" : section === "mixes" ? "Vos mixes" : section === "artists" ? "Vos artistes" : section === "genres" ? "Genres" : "Ambiances";

  const albumDetail = section === "albums" && selectedAlbum
    ? <AlbumDetail
        album={selectedAlbum}
        library={library}
        selectedId={selectedId}
        resolving={resolvingAlbumId === selectedAlbum.id}
        resolveStatus={resolveStatus}
        onBack={() => { setSelectedAlbumId(undefined); setResolveStatus(undefined); }}
        onInspect={() => setInspectedAlbumId(selectedAlbum.id)}
        onResolve={() => void resolveAlbum(selectedAlbum.id)}
        onQueue={() => onQueueAlbum(selectedAlbum.id)}
        onSelectItem={onSelectItem}
        onPlayItem={onPlayItem}
        onPlayAlbum={onPlayAlbum}
      />
    : null;

  return (
    <>
      {albumDetail ?? <div className={`collection-view section-${section}`}>
        <div className="section-heading collection-heading">
          <div><p className="eyebrow">{section.toUpperCase()}</p><h2>{title}</h2></div>
          {section === "albums" && looseTracks.length ? <span className="collection-summary">{looseTracks.length} titre{looseTracks.length > 1 ? "s" : ""} hors album</span> : null}
        </div>

        {section === "albums" ? (
          library.albums.length ? <div className="album-mosaic">{library.albums.map((album) => <AlbumCard key={album.id} album={album} library={library} onOpen={() => { setSelectedAlbumId(album.id); setResolveStatus(undefined); }} onInspect={() => setInspectedAlbumId(album.id)} onPlay={() => onPlayAlbum(album.id)} onQueue={() => onQueueAlbum(album.id)} />)}</div> : <div className="empty-state"><p>Aucun album pour l’instant.</p><span>Ajoutez un album depuis le catalogue MusicBrainz.</span></div>
        ) : null}

        {section === "tracks" ? (library.tracks.length ? <TrackList items={library.tracks} library={library} selectedId={selectedId} onSelectItem={onSelectItem} onPlayItem={onPlayItem} /> : <div className="empty-state"><p>Votre collection est prête à être remplie.</p><span>Utilisez la recherche ou le catalogue Albums / EP.</span></div>) : null}
        {section === "mixes" ? (library.mixes.length ? <TrackList items={library.mixes} library={library} selectedId={selectedId} onSelectItem={onSelectItem} onPlayItem={onPlayItem} /> : <div className="empty-state"><p>Aucun mix pour l’instant.</p></div>) : null}
        {section === "artists" ? <ArtistList artists={library.artists} library={library} onToggle={onToggleArtist} /> : null}
        {section === "genres" ? (genreTags.length ? <div className="tag-card-grid">{genreTags.map((tag) => <button key={tag} className="tag-tile" type="button" onClick={() => onRandomTag("genres", tag)}><strong>{tag}</strong><span>Lancer Random</span></button>)}</div> : <div className="empty-state"><p>Aucun genre renseigné.</p><span>Les genres apparaissent automatiquement au fur et à mesure des albums ajoutés et enrichis.</span></div>) : null}
        {section === "moods" ? <div className="tag-card-grid">{library.moods.map((tag) => <button key={tag} className="tag-tile" type="button" onClick={() => onRandomTag("moods", tag)}><strong>{tag}</strong><span>Lancer Random</span></button>)}</div> : null}
      </div>}

      {inspectedAlbum ? <AlbumInfoPanel
        key={inspectedAlbum.id}
        album={inspectedAlbum}
        library={library}
        resolving={resolvingAlbumId === inspectedAlbum.id}
        resolveStatus={resolveStatus}
        onClose={() => setInspectedAlbumId(undefined)}
        onResolve={() => void resolveAlbum(inspectedAlbum.id)}
        onQueue={() => onQueueAlbum(inspectedAlbum.id)}
        onPlay={() => onPlayAlbum(inspectedAlbum.id)}
      /> : null}
    </>
  );
}
