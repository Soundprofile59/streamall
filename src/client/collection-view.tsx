"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Album, Artist, LibrarySnapshot, PlayableItem } from "@/domain/types";

export type LibrarySection = "tracks" | "mixes" | "albums" | "artists" | "genres" | "moods";
type TrackEditablePatch = Partial<Pick<PlayableItem, "genres" | "moods" | "rating" | "favorite" | "frequencyPreference">>;
type AlbumSort = "artist" | "year" | "genre" | "rating";

type Props = {
  section: LibrarySection;
  library: LibrarySnapshot;
  selectedId?: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onQueueItem: (itemId: string) => void;
  onEditItem: (itemId: string, patch: TrackEditablePatch) => void;
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
  return { tracks, playable };
}

function replacePrimary(values: string[], value: string) {
  const tail = values.slice(1).filter((entry) => entry !== value);
  return value ? [value, ...tail] : tail;
}

function AlbumCard({ album, library, onOpen, onInspect, onPlay, onQueue }: {
  album: Album;
  library: LibrarySnapshot;
  onOpen: () => void;
  onInspect: () => void;
  onPlay: () => void;
  onQueue: () => void;
}) {
  const { tracks } = albumStats(album, library);
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
            <span>Ouvrir l’album</span>
          </span>
        </span>
      </button>
      <div className="album-tile-copy">
        <button type="button" className="album-title-button" onClick={onOpen}><strong>{album.title}</strong></button>
        <small>{artists}{album.year ? ` · ${album.year}` : ""}{stars ? ` · ${"★".repeat(stars)}` : ""}</small>
        <small className={`album-tile-genres ${genres.length ? "" : "empty"}`}>{genres.length ? genres.slice(0, 3).join(" · ") : "Genre non renseigné"}</small>
      </div>
      <div className="album-tile-actions">
        <button className="album-info-shortcut" type="button" onClick={onInspect} title="Informations de l’album" aria-label={`Informations de ${album.title}`}>ⓘ</button>
        <button className="album-queue-shortcut" type="button" onClick={onQueue} title="Mettre l’album dans la file d’attente" aria-label={`Mettre ${album.title} dans la file d’attente`}>＋</button>
        <button className="album-quick-play" type="button" onClick={onPlay} title="Lire l’album en priorité">▶</button>
      </div>
    </article>
  );
}

function AlbumDetail({ album, library, selectedId, backLabel, onBack, onInspect, onQueue, onSelectItem, onPlayItem, onPlayAlbum }: {
  album: Album;
  library: LibrarySnapshot;
  selectedId?: string;
  backLabel?: string;
  onBack: () => void;
  onInspect: () => void;
  onQueue: () => void;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onPlayAlbum: (albumId: string) => void;
}) {
  const { tracks } = albumStats(album, library);
  const artists = artistLabel(album.artistIds, library);
  const genres = album.genres ?? [];
  const stars = albumRating(album);
  return (
    <div className="album-detail-view">
      <div className="album-detail-toolbar">
        <button className="collection-back" type="button" onClick={onBack}>← {backLabel ?? "Albums"}</button>
        <button className="album-info-button" type="button" onClick={onInspect}>ⓘ Infos album</button>
      </div>
      <div className="album-detail-hero">
        <button className="album-detail-cover album-detail-cover-button" type="button" onClick={onInspect} style={album.artwork ? { backgroundImage: `url("${album.artwork}")` } : undefined}>{!album.artwork ? "S" : null}</button>
        <div className="album-detail-copy">
          <p className="eyebrow">ALBUM</p>
          <button className="album-detail-title-button" type="button" onClick={onInspect}><h2>{album.title}</h2></button>
          <p>{artists}{album.year ? ` · ${album.year}` : ""}{stars ? ` · ${"★".repeat(stars)}` : ""}</p>
          {genres.length ? <div className="album-genre-list">{genres.map((genre) => <span key={genre}>{genre}</span>)}</div> : null}
          <div className="album-detail-stats"><span>{tracks.length} piste{tracks.length > 1 ? "s" : ""}</span></div>
          <div className="album-detail-actions">
            <button className="album-play-all" type="button" onClick={() => onPlayAlbum(album.id)}>▶ Lire l’album</button>
            <button className="album-queue-button" type="button" onClick={onQueue}>＋ File d’attente</button>
          </div>
        </div>
      </div>
      <div className="album-library-tracklist">
        {tracks.map((track) => {
          const playableTrack = sourceCount(track.id, library) > 0;
          const starsForTrack = rating(track);
          return (
            <div key={track.id} className={`album-library-track ${selectedId === track.id ? "selected" : ""}`}>
              <span className="album-track-number">{track.trackNumber ?? "–"}</span>
              <button className="album-track-title" type="button" onClick={() => onSelectItem(track.id)}>
                <strong>{track.title}</strong>
                <small>{artistLabel(track.artistIds, library)}{starsForTrack ? ` · ${"★".repeat(starsForTrack)}` : ""}</small>
              </button>
              <span className="album-track-duration">{duration(track.duration)}</span>
              <button className="album-track-action" type="button" disabled={!playableTrack} onClick={() => onPlayItem(track.id)} title={playableTrack ? "Lire" : "Lecture indisponible pour le moment"}>▶</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlbumInfoPanel({ album, library, onClose, onQueue, onPlay }: {
  album: Album;
  library: LibrarySnapshot;
  onClose: () => void;
  onQueue: () => void;
  onPlay: () => void;
}) {
  const [title, setTitle] = useState(album.title);
  const [year, setYear] = useState(album.year ? String(album.year) : "");
  const [personalRating, setPersonalRating] = useState<number | undefined>(albumRating(album));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const { tracks } = albumStats(album, library);
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
    if (!window.confirm(`Supprimer l’album « ${album.title} » ?\n\n${tracks.length} piste${tracks.length > 1 ? "s" : ""} et leur historique seront supprimés de Streamall.`)) return;
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
        <div className="album-info-stats"><span><strong>{tracks.length}</strong> pistes</span></div>
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
        {status ? <p className="album-info-status">{status}</p> : null}
        <div className="album-info-danger">
          <strong>Supprimer de la bibliothèque</strong>
          <p>Supprime l’album, ses pistes et l’historique associé.</p>
          <button type="button" disabled={busy} onClick={() => void removeAlbum()}>Supprimer l’album</button>
        </div>
      </aside>
    </div>
  );
}

function TrackList({ items, library, selectedId, genreOptions, onSelectItem, onPlayItem, onQueueItem, onEditItem }: {
  items: PlayableItem[];
  library: LibrarySnapshot;
  selectedId?: string;
  genreOptions: string[];
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string) => void;
  onQueueItem: (itemId: string) => void;
  onEditItem: (itemId: string, patch: TrackEditablePatch) => void;
}) {
  return (
    <div className="collection-track-table">
      <div className="collection-track-columns" aria-hidden="true">
        <span>Titre</span><span>Genre</span><span>Mood</span><span>Note</span><span>File</span><span>Lecture</span>
      </div>
      <div className="collection-track-list">
        {items.map((item) => {
          const stars = rating(item);
          const playable = sourceCount(item.id, library) > 0;
          const album = item.kind === "track" && item.albumId ? library.albums.find((candidate) => candidate.id === item.albumId) : undefined;
          return (
            <div key={item.id} className={`collection-track-row rich ${selectedId === item.id ? "selected" : ""}`}>
              <div className="collection-mini-cover" style={item.artwork ? { backgroundImage: `url("${item.artwork}")` } : undefined}>{!item.artwork ? item.title.slice(0, 1) : null}</div>
              <button className="collection-track-copy" type="button" onClick={() => onSelectItem(item.id)} title="Ouvrir les informations du titre">
                <strong>{item.title}</strong>
                <small>{artistLabel(item.artistIds, library)}{album ? ` · ${album.title}` : ""} · {item.kind === "mix" ? "Mix" : duration(item.duration)}</small>
              </button>
              <select className="collection-inline-select" aria-label={`Genre de ${item.title}`} value={item.genres[0] ?? ""} onChange={(event) => onEditItem(item.id, { genres: replacePrimary(item.genres, event.target.value) })}>
                <option value="">—</option>
                {genreOptions.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
              </select>
              <select className="collection-inline-select" aria-label={`Mood de ${item.title}`} value={item.moods[0] ?? ""} onChange={(event) => onEditItem(item.id, { moods: replacePrimary(item.moods, event.target.value) })}>
                <option value="">—</option>
                {library.moods.map((mood) => <option key={mood} value={mood}>{mood}</option>)}
              </select>
              <div className="collection-inline-rating" role="group" aria-label={`Note de ${item.title}`}>
                {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= (stars ?? 0) ? "filled" : ""} title={`${value}/5`} onClick={() => onEditItem(item.id, { rating: stars === value ? undefined : value, favorite: false, frequencyPreference: "NORMAL" })}>★</button>)}
              </div>
              <button className="collection-row-queue" type="button" onClick={() => onQueueItem(item.id)} title="Ajouter à la fin de la file d’attente">＋</button>
              <button className="collection-row-play" type="button" disabled={!playable} onClick={() => onPlayItem(item.id)} title={playable ? "Lire" : "Lecture indisponible pour le moment"}>▶</button>
            </div>
          );
        })}
      </div>
      <p className="collection-correspondence-note">Trouver correspondances : fonction prévue pour une prochaine étape.</p>
    </div>
  );
}

function ArtistList({ artists, library, onToggle, onOpenArtist }: {
  artists: Artist[];
  library: LibrarySnapshot;
  onToggle: (artistId: string) => void;
  onOpenArtist: (artistId: string) => void;
}) {
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
        <button className="artist-card-main" type="button" onClick={() => onOpenArtist(artist.id)} title={`Ouvrir les albums de ${artist.name} déjà présents dans Streamall`}><strong>{artist.name}</strong><small>{albums} album{albums > 1 ? "s" : ""} · {tracks} titre{tracks > 1 ? "s" : ""}</small></button>
        <button className="artist-disable-button" type="button" onClick={() => onToggle(artist.id)}>{artist.disabled ? "Réactiver" : "Désactiver"}</button>
      </article>;
    })}</div>
    {!visibleArtists.length ? <div className="empty-state"><p>Aucun artiste actif.</p>{disabledCount ? <span>Utilisez « Afficher les désactivés » pour les réactiver.</span> : null}</div> : null}
  </>;
}

export function CollectionView({ section, library, selectedId, onSelectItem, onPlayItem, onQueueItem, onEditItem, onPlayAlbum, onQueueAlbum, onToggleArtist, onRandomTag }: Props) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>();
  const [selectedArtistId, setSelectedArtistId] = useState<string>();
  const [inspectedAlbumId, setInspectedAlbumId] = useState<string>();
  const [albumSort, setAlbumSort] = useState<AlbumSort>("artist");

  const selectedAlbum = library.albums.find((album) => album.id === selectedAlbumId);
  const selectedArtist = library.artists.find((artist) => artist.id === selectedArtistId);
  const inspectedAlbum = library.albums.find((album) => album.id === inspectedAlbumId);
  const artistAlbums = useMemo(() => selectedArtist
    ? library.albums
        .filter((album) => album.artistIds.includes(selectedArtist.id))
        .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title, "fr", { sensitivity: "base" }))
    : [], [library.albums, selectedArtist]);
  const sortedAlbums = useMemo(() => {
    const albums = [...library.albums];
    const byArtistThenTitle = (a: Album, b: Album) => {
      const artistCompare = artistLabel(a.artistIds, library).localeCompare(artistLabel(b.artistIds, library), "fr", { sensitivity: "base" });
      return artistCompare || a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
    };

    if (albumSort === "year") {
      return albums.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byArtistThenTitle(a, b));
    }
    if (albumSort === "genre") {
      return albums.sort((a, b) => {
        const genreA = a.genres?.[0] ?? "zzzzzz";
        const genreB = b.genres?.[0] ?? "zzzzzz";
        return genreA.localeCompare(genreB, "fr", { sensitivity: "base" }) || byArtistThenTitle(a, b);
      });
    }
    if (albumSort === "rating") {
      return albums.sort((a, b) => (albumRating(b) ?? 0) - (albumRating(a) ?? 0) || byArtistThenTitle(a, b));
    }
    return albums.sort(byArtistThenTitle);
  }, [albumSort, library]);
  const looseTracks = useMemo(() => library.tracks.filter((track) => !track.albumId), [library.tracks]);
  const genreTags = useMemo(() => [...new Set([
    ...library.genres,
    ...library.albums.flatMap((album) => album.genres ?? []),
    ...library.tracks.flatMap((track) => track.genres),
    ...library.mixes.flatMap((mix) => mix.genres),
  ])].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })), [library.albums, library.genres, library.tracks, library.mixes]);

  const title = section === "albums" ? "Vos albums" : section === "tracks" ? "Tous les titres" : section === "mixes" ? "Vos mixes" : section === "artists" ? "Vos artistes" : section === "genres" ? "Genres" : "Ambiances";

  const albumDetail = selectedAlbum && (section === "albums" || (section === "artists" && selectedArtist))
    ? <AlbumDetail
        album={selectedAlbum}
        library={library}
        selectedId={selectedId}
        backLabel={section === "artists" && selectedArtist ? selectedArtist.name : "Albums"}
        onBack={() => setSelectedAlbumId(undefined)}
        onInspect={() => setInspectedAlbumId(selectedAlbum.id)}
        onQueue={() => onQueueAlbum(selectedAlbum.id)}
        onSelectItem={onSelectItem}
        onPlayItem={onPlayItem}
        onPlayAlbum={onPlayAlbum}
      />
    : null;

  const artistDiscography = section === "artists" && selectedArtist && !selectedAlbum
    ? <div className="collection-view section-artists artist-discography-inline">
        <div className="section-heading collection-heading">
          <div>
            <button className="collection-back" type="button" onClick={() => setSelectedArtistId(undefined)}>← Artistes</button>
            <p className="eyebrow">DISCOGRAPHIE STREAMALL</p>
            <h2>{selectedArtist.name}</h2>
          </div>
          <span className="collection-summary">{artistAlbums.length} album{artistAlbums.length > 1 ? "s" : ""}</span>
        </div>
        {artistAlbums.length
          ? <div className="album-mosaic">{artistAlbums.map((album) => <AlbumCard key={album.id} album={album} library={library} onOpen={() => setSelectedAlbumId(album.id)} onInspect={() => setInspectedAlbumId(album.id)} onPlay={() => onPlayAlbum(album.id)} onQueue={() => onQueueAlbum(album.id)} />)}</div>
          : <div className="empty-state"><p>Aucun album de cet artiste dans Streamall.</p><span>Seuls les albums déjà ajoutés à votre bibliothèque apparaissent ici.</span></div>}
      </div>
    : null;

  return (
    <>
      {albumDetail ?? artistDiscography ?? <div className={`collection-view section-${section}`}>
        <div className="section-heading collection-heading">
          <div><p className="eyebrow">{section.toUpperCase()}</p><h2>{title}</h2></div>
          {section === "albums" ? <div className="album-heading-tools">
            <label>Trier
              <select value={albumSort} onChange={(event) => setAlbumSort(event.target.value as AlbumSort)}>
                <option value="artist">Artiste A–Z</option>
                <option value="year">Année · récent d’abord</option>
                <option value="genre">Genre A–Z</option>
                <option value="rating">Note · meilleure d’abord</option>
              </select>
            </label>
            {looseTracks.length ? <span className="collection-summary">{looseTracks.length} titre{looseTracks.length > 1 ? "s" : ""} hors album</span> : null}
          </div> : null}
        </div>

        {section === "albums" ? (
          library.albums.length ? <div className="album-mosaic">{sortedAlbums.map((album) => <AlbumCard key={album.id} album={album} library={library} onOpen={() => setSelectedAlbumId(album.id)} onInspect={() => setInspectedAlbumId(album.id)} onPlay={() => onPlayAlbum(album.id)} onQueue={() => onQueueAlbum(album.id)} />)}</div> : <div className="empty-state"><p>Aucun album pour l’instant.</p><span>Ajoutez un album depuis la recherche Catalogue.</span></div>
        ) : null}

        {section === "tracks" ? (library.tracks.length ? <TrackList items={library.tracks} library={library} selectedId={selectedId} genreOptions={genreTags} onSelectItem={onSelectItem} onPlayItem={onPlayItem} onQueueItem={onQueueItem} onEditItem={onEditItem} /> : <div className="empty-state"><p>Votre collection est prête à être remplie.</p><span>Utilisez la recherche Catalogue.</span></div>) : null}
        {section === "mixes" ? (library.mixes.length ? <TrackList items={library.mixes} library={library} selectedId={selectedId} genreOptions={genreTags} onSelectItem={onSelectItem} onPlayItem={onPlayItem} onQueueItem={onQueueItem} onEditItem={onEditItem} /> : <div className="empty-state"><p>Aucun mix pour l’instant.</p></div>) : null}
        {section === "artists" ? <ArtistList artists={library.artists} library={library} onToggle={onToggleArtist} onOpenArtist={(artistId) => { setSelectedArtistId(artistId); setSelectedAlbumId(undefined); }} /> : null}
        {section === "genres" ? (genreTags.length ? <div className="tag-card-grid">{genreTags.map((tag) => <button key={tag} className="tag-tile" type="button" onClick={() => onRandomTag("genres", tag)}><strong>{tag}</strong><span>Lancer Random</span></button>)}</div> : <div className="empty-state"><p>Aucun genre renseigné.</p><span>Les genres apparaissent automatiquement au fur et à mesure des albums ajoutés.</span></div>) : null}
        {section === "moods" ? <div className="tag-card-grid">{library.moods.map((tag) => <button key={tag} className="tag-tile" type="button" onClick={() => onRandomTag("moods", tag)}><strong>{tag}</strong><span>Lancer Random</span></button>)}</div> : null}
      </div>}

      {inspectedAlbum ? <AlbumInfoPanel
        key={inspectedAlbum.id}
        album={inspectedAlbum}
        library={library}
        onClose={() => setInspectedAlbumId(undefined)}
        onQueue={() => onQueueAlbum(inspectedAlbum.id)}
        onPlay={() => onPlayAlbum(inspectedAlbum.id)}
      /> : null}
    </>
  );
}
