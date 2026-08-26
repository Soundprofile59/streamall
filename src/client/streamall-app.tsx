"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { addExternalResult, allPlayable, deletePlayableItem, streamallId } from "@/domain/library";
import { PlayerOrchestrator, type PlayerSnapshot } from "@/domain/player";
import { generateRandomQueue } from "@/domain/random";
import { resolveSources } from "@/domain/providers";
import type { ExternalSearchResult, HistoryOutcome, LibrarySnapshot, PlayableItem, Provider, QueueEntry, RandomFilters, Source } from "@/domain/types";
import { CollectionView, type LibrarySection } from "./collection-view";
import { HtmlAudioAdapter, MixcloudAdapter, YouTubeAdapter } from "./playback-adapters";
import { ServiceWorkerRegistration } from "./service-worker-registration";

type Section = LibrarySection;
type ProviderStatus = { provider: Provider; status: string; message?: string };
type EditablePatch = Partial<Pick<PlayableItem, "moods" | "genres" | "energy" | "rating" | "favorite" | "frequencyPreference" | "disabled">>;

const SECTIONS: Section[] = ["albums", "artists", "tracks", "mixes", "genres", "moods"];

function playbackContext() {
  return { isMobile: /iPhone|iPad|Android/i.test(navigator.userAgent), isStandalone: window.matchMedia("(display-mode: standalone)").matches, hasUserActivation: navigator.userActivation?.hasBeenActive ?? true };
}

function itemLabel(item: PlayableItem, library: LibrarySnapshot) {
  const artists = item.artistIds.map((id) => library.artists.find((artist) => artist.id === id)?.name).filter(Boolean).join(", ");
  return { title: item.title, artist: artists || "Artiste inconnu" };
}

function queueItemMeta(item: PlayableItem, library: LibrarySnapshot) {
  if (item.kind === "track" && item.albumId) {
    const album = library.albums.find((candidate) => candidate.id === item.albumId);
    const track = item.trackNumber !== undefined ? `Piste ${item.trackNumber}` : "Piste";
    return `${album?.title ?? "Album"} · ${track}`;
  }
  return itemLabel(item, library).artist;
}

function formatTime(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

function sameExternalResult(a: ExternalSearchResult | undefined, b: ExternalSearchResult) { return a?.provider === b.provider && a.externalId === b.externalId; }
function effectiveRating(item: PlayableItem) { if (item.rating !== undefined) return item.rating; if (item.favorite) return 5; if (item.frequencyPreference === "MORE") return 4; if (item.frequencyPreference === "LESS") return 2; return undefined; }
function ratingMeaning(rating?: number) { return rating === 1 ? "Très rarement" : rating === 2 ? "Moins souvent" : rating === 3 ? "Fréquence normale" : rating === 4 ? "Souvent" : rating === 5 ? "Très souvent" : "Non noté · fréquence normale"; }

function albumPlayableTracks(snapshot: LibrarySnapshot, albumId: string) {
  return snapshot.tracks.filter((track) => track.albumId === albumId && snapshot.sources.some((source) => source.playableItemId === track.id && source.userEnabled)).sort((a,b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));
}

function allAlbumTracks(snapshot: LibrarySnapshot, albumId: string) {
  return snapshot.tracks.filter((track) => track.albumId === albumId).sort((a,b) => (a.trackNumber ?? 999) - (b.trackNumber ?? 999));
}

export function StreamallApp() {
  const [library, setLibrary] = useState<LibrarySnapshot>();
  const libraryLoaded = library !== undefined;
  const libraryRef = useRef<LibrarySnapshot | undefined>(undefined);
  const persistedRevision = useRef(0);
  const pendingSave = useRef<LibrarySnapshot | undefined>(undefined);
  const saving = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [section, setSection] = useState<Section>("tracks");
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ExternalSearchResult[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [previewResult, setPreviewResult] = useState<ExternalSearchResult>();
  const previewRef = useRef<ExternalSearchResult | undefined>(undefined);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const queueRef = useRef<QueueEntry[]>([]);
  const [past, setPast] = useState<string[]>([]);
  const pastRef = useRef<string[]>([]);
  const [filters, setFilters] = useState<RandomFilters>({});
  const [notice, setNotice] = useState("Prêt à lancer votre discothèque.");
  const [player, setPlayer] = useState<PlayerSnapshot>({ state: "IDLE", position: 0 });
  const playerRef = useRef<PlayerSnapshot>(player);
  const currentHistoryId = useRef<string | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeRef = useRef<HTMLDivElement>(null);
  const mixcloudRef = useRef<HTMLIFrameElement>(null);
  const orchestratorRef = useRef<PlayerOrchestrator | undefined>(undefined);
  const endedRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    fetch("/api/library").then(async (response) => { if (!response.ok) throw new Error("Bibliothèque indisponible"); return response.json() as Promise<LibrarySnapshot>; }).then((snapshot) => {
      libraryRef.current = snapshot; persistedRevision.current = snapshot.revision; setLibrary(snapshot);
      const requested = new URLSearchParams(window.location.search).get("section");
      if (requested && SECTIONS.includes(requested as Section)) setSection(requested as Section); else if (snapshot.albums.length) setSection("albums");
    }).catch((error: Error) => setNotice(error.message));
  }, []);

  const drainSaves = useCallback(async () => {
    if (saving.current) return;
    saving.current = true; setSaveState("saving");
    while (pendingSave.current) {
      const target = pendingSave.current; pendingSave.current = undefined;
      const response = await fetch("/api/library", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: target, expectedRevision: persistedRevision.current, operationId: crypto.randomUUID() }) });
      if (response.status === 409) {
        const latest = await fetch("/api/library").then((result) => result.json() as Promise<LibrarySnapshot>);
        libraryRef.current = latest; persistedRevision.current = latest.revision; setLibrary(latest); pendingSave.current = undefined; setNotice("Une modification plus récente a été détectée. La bibliothèque a été rechargée."); setSaveState("error"); break;
      }
      if (!response.ok) { pendingSave.current = target; setSaveState("error"); setNotice("Sauvegarde temporairement indisponible. Les changements restent dans cette session."); break; }
      const persisted = (await response.json()) as LibrarySnapshot; persistedRevision.current = persisted.revision;
      if (!pendingSave.current) { libraryRef.current = persisted; setLibrary(persisted); }
    }
    saving.current = false; setSaveState((state) => state === "error" ? state : "saved");
  }, []);

  const mutateLibrary = useCallback((mutation: (snapshot: LibrarySnapshot) => LibrarySnapshot) => {
    const current = libraryRef.current; if (!current) return;
    const mutated = mutation(structuredClone(current));
    const next = { ...mutated, revision: Math.max(current.revision + 1, mutated.revision), updatedAt: new Date().toISOString() };
    libraryRef.current = next; pendingSave.current = next; setLibrary(next); window.setTimeout(() => void drainSaves(), 650);
  }, [drainSaves]);

  const reloadLibrary = useCallback(async () => {
    const latest = await fetch("/api/library").then(async (response) => { if (!response.ok) throw new Error("Bibliothèque indisponible"); return response.json() as Promise<LibrarySnapshot>; });
    libraryRef.current = latest; persistedRevision.current = latest.revision; pendingSave.current = undefined; setLibrary(latest); return latest;
  }, []);

  const finishHistory = useCallback((outcome: HistoryOutcome) => {
    const historyId = currentHistoryId.current; if (!historyId) return; currentHistoryId.current = undefined;
    mutateLibrary((snapshot) => ({ ...snapshot, history: snapshot.history.map((entry) => entry.id === historyId ? { ...entry, outcome, completedAt: new Date().toISOString(), playedDuration: playerRef.current.position, updatedAt: new Date().toISOString(), revision: entry.revision + 1 } : entry) }));
  }, [mutateLibrary]);

  const playItem = useCallback(async (itemId: string, rememberCurrent = true) => {
    let snapshot = libraryRef.current; if (!snapshot) return;
    let item = allPlayable(snapshot).find((candidate) => candidate.id === itemId); if (!item) return;
    const orchestrator = orchestratorRef.current; if (!orchestrator) return;
    const currentId = playerRef.current.item?.id;
    const currentIsLibraryItem = Boolean(currentId && allPlayable(snapshot).some((candidate) => candidate.id === currentId));
    if (previewRef.current) { previewRef.current = undefined; setPreviewResult(undefined); }
    if (rememberCurrent && currentId && currentIsLibraryItem && currentId !== itemId) { pastRef.current = [...pastRef.current, currentId].slice(-100); setPast(pastRef.current); }
    if (currentHistoryId.current && currentId && currentId !== itemId) finishHistory("STOPPED");

    let sources = snapshot.sources.filter((source) => source.playableItemId === itemId && source.userEnabled);
    if (!sources.length && item.kind === "track" && item.albumId) {
      setNotice(`Préparation de ${item.title}…`);
      try {
        await fetch("/api/albums/resolve-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId: item.albumId }) });
        snapshot = await reloadLibrary(); item = allPlayable(snapshot).find((candidate) => candidate.id === itemId); sources = snapshot.sources.filter((source) => source.playableItemId === itemId && source.userEnabled);
      } catch { /* résolution interne */ }
    }
    if (!item || !sources.length) { setNotice("Lecture indisponible pour le moment. Streamall réessaiera automatiquement plus tard."); return; }

    const ordered = resolveSources(sources, playbackContext());
    const historyId = streamallId("history"); currentHistoryId.current = historyId;
    mutateLibrary((current) => ({ ...current, history: [...current.history, { id: historyId, revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), playSessionId: crypto.randomUUID(), itemId, itemKind: item.kind, sourceId: ordered[0]?.id, provider: ordered[0]?.provider, startedAt: new Date().toISOString(), itemDuration: item.duration, outcome: "STOPPED" }] }));
    await orchestrator.load(item, sources, true);
  }, [finishHistory, mutateLibrary, reloadLibrary]);

  const playNext = useCallback(async (finish = true) => {
    if (finish && playerRef.current.item && !previewRef.current) { const progress = playerRef.current.duration ? playerRef.current.position / playerRef.current.duration : 0; finishHistory(progress > 0.7 ? "SKIPPED_LATE" : "SKIPPED_EARLY"); }
    let upcoming = queueRef.current;
    if (!upcoming.length && libraryRef.current) { const generated = generateRandomQueue(libraryRef.current, filters, Date.now(), libraryRef.current.settings.random.queueTarget); upcoming = generated.entries; }
    const [next, ...rest] = upcoming; queueRef.current = rest; setQueue(rest);
    if (next) await playItem(next.itemId); else setNotice("Aucun morceau ne respecte les filtres actifs.");
  }, [filters, finishHistory, playItem]);

  useEffect(() => { endedRef.current = async () => { if (previewRef.current) { previewRef.current = undefined; setPreviewResult(undefined); await orchestratorRef.current?.stop(); setNotice("Préécoute terminée."); return; } finishHistory("COMPLETED"); await playNext(false); }; }, [finishHistory, playNext]);

  useEffect(() => {
    if (!libraryLoaded || !audioRef.current || !youtubeRef.current || !mixcloudRef.current) return;
    const direct = new HtmlAudioAdapter(audioRef.current); const youtube = new YouTubeAdapter(youtubeRef.current); const mixcloud = new MixcloudAdapter(mixcloudRef.current);
    const orchestrator = new PlayerOrchestrator({
      adapterFor(source) { if (source.provider === "youtube") return youtube; if (source.provider === "mixcloud") return mixcloud; if (["audius", "jamendo"].includes(source.provider)) return direct; throw new Error(`${source.provider} playback is not enabled`); },
      context: playbackContext,
      onEnded: () => endedRef.current(),
      onSourceFailure(source, error) {
        if (source.providerMetadata.streamallPreview === true) { setNotice(`Préécoute ${source.provider} indisponible : ${error.message}`); return; }
        mutateLibrary((snapshot) => ({ ...snapshot, sources: snapshot.sources.map((entry) => entry.id === source.id ? { ...entry, healthStatus: "TEMPORARILY_UNAVAILABLE", consecutiveFailures: entry.consecutiveFailures + 1, failureReason: error.message, lastFailureAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: entry.revision + 1 } : entry) }));
      },
    });
    orchestratorRef.current = orchestrator; void orchestrator.setVolume(libraryRef.current?.settings.volume ?? 0.8);
    const unsubscribe = orchestrator.subscribe((snapshot) => { playerRef.current = snapshot; setPlayer(snapshot); });
    return () => { unsubscribe(); void orchestrator.stop(); };
  }, [libraryLoaded, mutateLibrary]);

  async function runSearch() {
    if (query.trim().length < 2) return; setSearching(true);
    const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
    const body = (await response.json().catch(() => null)) as { results?: ExternalSearchResult[]; providers?: ProviderStatus[]; error?: string } | null;
    setSearchResults(body?.results ?? []); setProviderStatuses(body?.providers ?? []); setSearching(false); if (!response.ok) setNotice(body?.error ?? "Recherche indisponible");
  }

  async function previewExternal(result: ExternalSearchResult) {
    const snapshot = libraryRef.current; const orchestrator = orchestratorRef.current; if (!snapshot || !orchestrator) return;
    if (sameExternalResult(previewRef.current, result)) { if (playerRef.current.state === "PLAYING") { await orchestrator.pause(); return; } if (playerRef.current.state === "PAUSED" || playerRef.current.state === "READY") { await orchestrator.play(); return; } }
    if (currentHistoryId.current) finishHistory("STOPPED");
    const now = new Date().toISOString();
    const item = { id: streamallId(result.kind), revision: 0, createdAt: now, updatedAt: now, kind: result.kind, title: result.title, artistIds: [], duration: result.duration, artwork: result.artwork, genres: [], moods: [], favorite: false, frequencyPreference: "NORMAL" as const, disabled: false } as PlayableItem;
    const source: Source = { id: streamallId("source"), revision: 0, createdAt: now, updatedAt: now, playableItemId: item.id, provider: result.provider, providerId: result.externalId, url: result.url, priority: Math.max(0, snapshot.settings.providerPriority.indexOf(result.provider)), userEnabled: true, healthStatus: "UNKNOWN", providerMetadata: { ...result.providerMetadata, streamallPreview: true }, metadataFetchedAt: now, consecutiveFailures: 0 };
    previewRef.current = result; setPreviewResult(result); setNotice(`Préécoute · ${result.artistName} — ${result.title}`); await orchestrator.load(item, [source], true);
  }

  function addResult(result: ExternalSearchResult) {
    const snapshot = libraryRef.current; if (!snapshot) return;
    if (snapshot.sources.some((source) => source.provider === result.provider && source.providerId === result.externalId)) { setNotice(`${result.title} est déjà dans votre bibliothèque.`); return; }
    const addition = addExternalResult(snapshot, result); mutateLibrary(() => addition.snapshot); setNotice(`${result.title} ajouté à votre bibliothèque.`);
  }

  async function startRandom(activeFilters: RandomFilters = filters) {
    const snapshot = libraryRef.current; if (!snapshot) return;
    const generated = generateRandomQueue(snapshot, activeFilters, Date.now(), snapshot.settings.random.queueTarget);
    if (!generated.entries.length) { setNotice("Aucun élément jouable ne respecte les filtres actifs."); return; }
    const [first, ...rest] = generated.entries; queueRef.current = rest; setQueue(rest); setNotice(`Queue générée · ${rest.length + (first ? 1 : 0)} titre${rest.length ? "s" : ""} sans doublon`);
    if (playerRef.current.item && !previewRef.current) finishHistory("STOPPED"); if (first) await playItem(first.itemId);
  }

  async function previous() {
    if (previewRef.current) return; const previousId = pastRef.current.at(-1); if (!previousId) return;
    const currentId = playerRef.current.item?.id; pastRef.current = pastRef.current.slice(0,-1); setPast(pastRef.current);
    if (currentId) { const entry = { id: streamallId("queue"), itemId: currentId, generatedAt: new Date().toISOString(), reason: "MANUAL" as const }; queueRef.current = [entry, ...queueRef.current]; setQueue(queueRef.current); }
    finishHistory("STOPPED"); await playItem(previousId, false);
  }

  function editItem(itemId: string, patch: EditablePatch) { mutateLibrary((snapshot) => ({ ...snapshot, tracks: snapshot.tracks.map((item) => item.id === itemId ? { ...item, ...patch, revision: item.revision + 1, updatedAt: new Date().toISOString() } : item), mixes: snapshot.mixes.map((item) => item.id === itemId ? { ...item, ...patch, revision: item.revision + 1, updatedAt: new Date().toISOString() } : item) })); }
  function editSelected(patch: EditablePatch) { if (selectedId) editItem(selectedId, patch); }

  async function deleteSelected() {
    const snapshot = libraryRef.current; if (!selectedId || !snapshot) return;
    const item = allPlayable(snapshot).find((candidate) => candidate.id === selectedId); if (!item || !window.confirm(`Supprimer « ${item.title} » de la bibliothèque ?`)) return;
    if (playerRef.current.item?.id === selectedId) { finishHistory("STOPPED"); await orchestratorRef.current?.stop(); }
    queueRef.current = queueRef.current.filter((entry) => entry.itemId !== selectedId); setQueue(queueRef.current); pastRef.current = pastRef.current.filter((itemId) => itemId !== selectedId); setPast(pastRef.current);
    mutateLibrary((current) => deletePlayableItem(current, selectedId)); setSelectedId(undefined); setNotice(`${item.title} supprimé de la bibliothèque.`);
  }

  async function ensureAlbumPlayable(albumId: string) {
    let snapshot = libraryRef.current; if (!snapshot) return [];
    const albumTracks = snapshot.tracks.filter((track) => track.albumId === albumId); let playable = albumPlayableTracks(snapshot, albumId);
    if (albumTracks.length > 0 && playable.length === albumTracks.length) return playable;
    try {
      await fetch("/api/albums/resolve-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId }) });
      snapshot = await reloadLibrary(); playable = albumPlayableTracks(snapshot, albumId); return playable;
    } catch { return playable; }
  }

  async function playAlbum(albumId: string) {
    await ensureAlbumPlayable(albumId);
    const snapshot = libraryRef.current;
    const tracks = snapshot ? allAlbumTracks(snapshot, albumId) : [];
    const entries = tracks.map((item) => ({ id: streamallId("queue"), itemId: item.id, generatedAt: new Date().toISOString(), reason: "ALBUM" as const }));
    const [first, ...rest] = entries;
    if (!first) { setNotice("Cet album ne contient aucune piste."); return; }
    queueRef.current = [...rest, ...queueRef.current]; setQueue(queueRef.current);
    const album = snapshot?.albums.find((candidate) => candidate.id === albumId);
    setNotice(`${album?.title ?? "Album"} lancé · ${entries.length} piste${entries.length > 1 ? "s" : ""} en priorité.`);
    await playItem(first.itemId);
  }

  async function queueAlbum(albumId: string) {
    await ensureAlbumPlayable(albumId);
    const snapshot = libraryRef.current;
    const tracks = snapshot ? allAlbumTracks(snapshot, albumId) : [];
    if (!tracks.length) { setNotice("Cet album ne contient aucune piste."); return; }
    const additions = tracks.map((item) => ({ id: streamallId("queue"), itemId: item.id, generatedAt: new Date().toISOString(), reason: "ALBUM" as const }));
    queueRef.current = [...queueRef.current, ...additions]; setQueue(queueRef.current);
    const album = snapshot?.albums.find((candidate) => candidate.id === albumId);
    setNotice(`${album?.title ?? "Album"} ajouté à la fin de la file · ${additions.length} piste${additions.length > 1 ? "s" : ""}.`);
  }

  async function queueItem(itemId: string) {
    let snapshot = libraryRef.current; if (!snapshot) return;
    let item = allPlayable(snapshot).find((candidate) => candidate.id === itemId); if (!item) return;
    let playable = snapshot.sources.some((source) => source.playableItemId === itemId && source.userEnabled);
    if (!playable && item.kind === "track" && item.albumId) {
      try { await fetch("/api/albums/resolve-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ albumId: item.albumId }) }); snapshot = await reloadLibrary(); item = allPlayable(snapshot).find((candidate) => candidate.id === itemId); playable = snapshot.sources.some((source) => source.playableItemId === itemId && source.userEnabled); } catch { playable = false; }
    }
    if (!item || !playable) { setNotice("Ce titre n’est pas lisible pour le moment."); return; }
    const entry: QueueEntry = { id: streamallId("queue"), itemId, generatedAt: new Date().toISOString(), reason: "MANUAL" }; queueRef.current = [...queueRef.current, entry]; setQueue(queueRef.current); setNotice(`${item.title} ajouté à la fin de la file.`);
  }

  function changeVolume(value: number) { const volume = Math.max(0, Math.min(1, value)); void orchestratorRef.current?.setVolume(volume); mutateLibrary((snapshot) => ({ ...snapshot, settings: { ...snapshot.settings, volume } })); }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || !libraryRef.current) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const preview = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ export: parsed, commit: false }) });
      const previewBody = (await preview.json()) as { plan?: { counts: Record<string, number> }; message?: string };
      if (!preview.ok || !previewBody.plan) throw new Error(previewBody.message ?? "Export incompatible");
      const summary = Object.entries(previewBody.plan.counts).map(([key,value]) => `${key}: ${value}`).join("\n");
      if (!window.confirm(`Importer en mode REPLACE ?\n\n${summary}\n\nUn export de sécurité sera téléchargé avant l’import.`)) return;
      const safety = await fetch("/api/backup/export").then((response) => response.json() as Promise<unknown>); downloadJson(safety, `streamall-before-import-${new Date().toISOString().slice(0,10)}.json`);
      const response = await fetch("/api/backup/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ export: parsed, commit: true, expectedRevision: persistedRevision.current, operationId: crypto.randomUUID() }) });
      const body = (await response.json()) as { snapshot?: LibrarySnapshot; message?: string };
      if (!response.ok || !body.snapshot) throw new Error(body.message ?? "Import impossible");
      libraryRef.current = body.snapshot; persistedRevision.current = body.snapshot.revision; setLibrary(body.snapshot); void orchestratorRef.current?.setVolume(body.snapshot.settings.volume); setNotice("Bibliothèque restaurée avec succès.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Import impossible"); }
  }

  const items = useMemo(() => library ? allPlayable(library) : [], [library]);
  const genreOptions = useMemo(() => library ? [...new Set([...library.genres, ...library.albums.flatMap((album) => album.genres ?? []), ...library.tracks.flatMap((track) => track.genres), ...library.mixes.flatMap((mix) => mix.genres)])].sort((a,b) => a.localeCompare(b, "fr", { sensitivity: "base" })) : [], [library]);
  const selected = items.find((item) => item.id === selectedId); const selectedRating = selected ? effectiveRating(selected) : undefined;
  const currentLabel = previewResult ? { title: previewResult.title, artist: previewResult.artistName } : player.item && library ? itemLabel(player.item, library) : undefined;

  if (!library) return <main className="loading-shell"><div className="brand-mark">S</div><p>Chargement de la discothèque…</p><p className="muted">{notice}</p></main>;
  const activeArtistCount = library.artists.filter((artist) => !artist.disabled).length;
  const currentLibraryItem = player.item ? items.find((candidate) => candidate.id === player.item?.id) : undefined;

  return <main className="app-shell">
    <ServiceWorkerRegistration />
    <header className="topbar"><button className="brand" onClick={() => setSection(library.albums.length ? "albums" : "tracks")}><span className="brand-mark small">S</span><span>STREAMALL</span></button><form className="searchbar" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}><input aria-label="Recherche multi-provider" placeholder="Chercher artiste, titre ou mix…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="submit" disabled={searching || query.trim().length < 2}>{searching ? "…" : "Rechercher"}</button></form><div className={`save-indicator ${saveState}`}>{saveState === "saving" ? "Sauvegarde…" : saveState === "error" ? "Hors ligne" : "Synchronisé"}</div></header>

    <section className="workspace">
      <aside className="library-nav panel"><p className="eyebrow">BIBLIOTHÈQUE</p>{SECTIONS.map((entry) => <button key={entry} className={section === entry ? "active" : ""} onClick={() => setSection(entry)}>{{ tracks: "Morceaux", mixes: "Mixes", albums: "Albums", artists: "Artistes", genres: "Genres", moods: "Moods" }[entry]}<span>{entry === "tracks" ? library.tracks.length : entry === "mixes" ? library.mixes.length : entry === "albums" ? library.albums.length : entry === "artists" ? activeArtistCount : entry === "genres" ? genreOptions.length : library.moods.length}</span></button>)}<div className="nav-actions"><a href="/api/backup/export" download>Exporter JSON</a><label className="file-action">Restaurer JSON<input type="file" accept="application/json" onChange={(event) => void importBackup(event)} /></label></div></aside>

      <section className="content-panel panel">{searchResults.length || providerStatuses.length ? <div className="search-results"><div className="section-heading"><div><p className="eyebrow">RÉSULTATS EXTERNES</p><h2>{searchResults.length} résultat{searchResults.length > 1 ? "s" : ""}</h2></div><button className="text-button" onClick={() => { setSearchResults([]); setProviderStatuses([]); }}>Fermer</button></div><div className="provider-statuses">{providerStatuses.map((status) => <span key={status.provider} className={`provider ${status.status.toLowerCase()}`} title={status.message}>{status.provider} · {status.status}</span>)}</div><div className="result-grid">{searchResults.map((result) => { const isPreviewing = sameExternalResult(previewResult,result); const isAdded = library.sources.some((source) => source.provider === result.provider && source.providerId === result.externalId); return <article key={`${result.provider}:${result.externalId}`} className={`result-card ${isPreviewing ? "previewing" : ""}`}><div className="artwork small-art" style={result.artwork ? { backgroundImage: `url(${JSON.stringify(result.artwork).slice(1,-1)})` } : undefined}><span>{result.title.slice(0,1)}</span></div><div><span className={`provider ${result.provider}`}>{result.provider}</span><h3>{result.title}</h3><p>{result.artistName}{result.albumTitle ? ` · ${result.albumTitle}` : ""}{result.duration ? ` · ${formatTime(result.duration)}` : ""}</p></div><div className="result-actions"><button className={`preview-button ${isPreviewing ? "active" : ""}`} onClick={() => void previewExternal(result)}>{isPreviewing && player.state === "PLAYING" ? "Ⅱ Pause" : isPreviewing ? "▶ Reprendre" : "▶ Écouter"}</button><button disabled={isAdded} onClick={() => addResult(result)}>{isAdded ? "✓ Ajouté" : "+ Ajouter"}</button></div></article>; })}</div></div> : <CollectionView section={section} library={library} selectedId={selectedId} onSelectItem={setSelectedId} onPlayItem={(itemId) => void playItem(itemId)} onQueueItem={(itemId) => void queueItem(itemId)} onEditItem={editItem} onPlayAlbum={(albumId) => void playAlbum(albumId)} onQueueAlbum={(albumId) => void queueAlbum(albumId)} onToggleArtist={(artistId) => mutateLibrary((snapshot) => ({ ...snapshot, artists: snapshot.artists.map((entry) => entry.id === artistId ? { ...entry, disabled: !entry.disabled, revision: entry.revision + 1, updatedAt: new Date().toISOString() } : entry) }))} onRandomTag={(kind, tag) => { const nextFilters: RandomFilters = kind === "genres" ? { genres: [tag] } : { moods: [tag] }; setFilters(nextFilters); void startRandom(nextFilters); }} />}</section>

      <aside className="queue-panel panel"><div className="section-heading compact"><div><p className="eyebrow">QUEUE</p><h2>À suivre</h2></div><span>{queue.length + (currentLibraryItem ? 1 : 0)}</span></div><div className="queue-list">
        {currentLibraryItem ? <div className="queue-row current" key={`current:${currentLibraryItem.id}`}><button type="button" onClick={() => void playItem(currentLibraryItem.id)}><strong>{currentLibraryItem.title}</strong><small>En cours · {queueItemMeta(currentLibraryItem, library)}</small></button><span className="queue-current-indicator">▶</span></div> : null}
        {queue.slice(0,20).map((entry) => { const item = items.find((candidate) => candidate.id === entry.itemId); if (!item) return null; return <div className="queue-row" key={entry.id}><button onClick={() => void playItem(item.id)}><strong>{item.title}</strong><small>{queueItemMeta(item, library)}</small></button><button aria-label="Retirer de la queue" onClick={() => { queueRef.current = queueRef.current.filter((candidate) => candidate.id !== entry.id); setQueue(queueRef.current); }}>×</button></div>; })}
      </div>{!queue.length && !currentLibraryItem ? <p className="empty-queue">Random remplira automatiquement la queue.</p> : null}</aside>
    </section>

    <section className="now-playing panel"><div className="media-surface"><div className={`youtube-surface ${player.source?.provider === "youtube" ? "active" : ""}`} ref={youtubeRef} aria-label="Lecteur YouTube visible" /><iframe ref={mixcloudRef} className={`mixcloud-surface ${player.source?.provider === "mixcloud" ? "active" : ""}`} title="Lecteur Mixcloud" allow="autoplay" /><div className={`artwork hero-art ${["youtube","mixcloud"].includes(player.source?.provider ?? "") ? "hidden" : ""}`} style={player.item?.artwork ? { backgroundImage: `url(${JSON.stringify(player.item.artwork).slice(1,-1)})` } : undefined}><span>{player.item?.title.slice(0,1) ?? "S"}</span></div></div><div className="player-details"><p className="eyebrow">{previewResult ? `PRÉÉCOUTE${player.source ? ` · ${player.source.provider.toUpperCase()}` : ""}` : player.source ? `SOURCE · ${player.source.provider.toUpperCase()}` : "NOW PLAYING"}</p><h1>{currentLabel?.title ?? "Laissez Streamall choisir"}</h1><p>{currentLabel?.artist ?? "Appuyez sur Random pour commencer"}</p>{player.error ? <p className="player-error">{player.error}</p> : null}<audio ref={audioRef} className={player.source && ["audius","jamendo"].includes(player.source.provider) ? "native-audio active" : "native-audio"} controls preload="metadata" /><div className="progress"><span style={{ width: `${player.duration ? Math.min(100,(player.position/player.duration)*100) : 0}%` }} /></div><div className="time"><span>{formatTime(player.position)}</span><span>{formatTime(player.duration)}</span></div><div className="transport"><button onClick={() => void previous()} disabled={Boolean(previewResult) || !past.length}>↶</button><button className="play-button" onClick={() => player.state === "PLAYING" ? void orchestratorRef.current?.pause() : void orchestratorRef.current?.play()}>{player.state === "PLAYING" ? "Ⅱ" : "▶"}</button><button onClick={() => void playNext()} disabled={Boolean(previewResult)}>↷</button><div className="persistent-volume" title={player.source?.provider === "mixcloud" ? "Le widget Mixcloud ne fournit pas de contrôle de volume à Streamall" : "Volume général conservé entre les titres"}><button type="button" aria-label={library.settings.volume > 0 ? "Couper le son" : "Rétablir le son"} onClick={() => changeVolume(library.settings.volume > 0 ? 0 : 0.8)}>{library.settings.volume > 0 ? "🔊" : "🔇"}</button><input aria-label="Volume général" type="range" min="0" max="100" step="1" value={Math.round(library.settings.volume*100)} onChange={(event) => changeVolume(Number(event.target.value)/100)} /><span>{Math.round(library.settings.volume*100)}%</span></div></div></div><div className="random-panel"><p className="eyebrow">ÉCOUTE INTELLIGENTE</p><button className="random-button" onClick={() => void startRandom()}><span>⤨</span> RANDOM</button><label>Mood<select value={filters.moods?.[0] ?? ""} onChange={(event) => setFilters((current) => ({ ...current, moods: event.target.value ? [event.target.value] : undefined }))}><option value="">Tous</option>{library.moods.map((mood) => <option key={mood}>{mood}</option>)}</select></label><label>Genre<select value={filters.genres?.[0] ?? ""} onChange={(event) => setFilters((current) => ({ ...current, genres: event.target.value ? [event.target.value] : undefined }))}><option value="">Tous</option>{genreOptions.map((genre) => <option key={genre}>{genre}</option>)}</select></label><p className="notice">{notice}</p></div></section>

    {selected ? <section className="editor-drawer panel"><div><p className="eyebrow">MÉTADONNÉES STREAMALL</p><h2>{selected.title}</h2><p>{itemLabel(selected,library).artist}</p></div><fieldset><legend>Moods</legend>{library.moods.map((mood) => <label key={mood}><input type="checkbox" checked={selected.moods.includes(mood)} onChange={() => editSelected({ moods: selected.moods.includes(mood) ? selected.moods.filter((entry) => entry !== mood) : [...selected.moods,mood] })} />{mood}</label>)}</fieldset><fieldset><legend>Genres</legend>{genreOptions.map((genre) => <label key={genre}><input type="checkbox" checked={selected.genres.includes(genre)} onChange={() => editSelected({ genres: selected.genres.includes(genre) ? selected.genres.filter((entry) => entry !== genre) : [...selected.genres,genre] })} />{genre}</label>)}</fieldset><label>Energy<select value={selected.energy ?? ""} onChange={(event) => editSelected({ energy: event.target.value ? Number(event.target.value) : undefined })}><option value="">Non renseignée</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><div className="rating-row"><div><strong>Préférence personnelle</strong><small>{ratingMeaning(selectedRating)} · influe sur Random</small></div><div className="star-rating" role="group" aria-label="Préférence de lecture de 1 à 5 étoiles">{[1,2,3,4,5].map((value) => <button key={value} type="button" className={value <= (selectedRating ?? 0) ? "filled" : ""} aria-label={`${value} étoile${value > 1 ? "s" : ""}`} aria-pressed={selectedRating === value} title={`${value}/5 · ${ratingMeaning(value)}`} onClick={() => editSelected({ rating: selectedRating === value ? undefined : value, favorite: false, frequencyPreference: "NORMAL" })}>★</button>)}</div></div><div className="rating-hard-action"><button className={selected.disabled ? "danger" : ""} onClick={() => editSelected({ disabled: !selected.disabled })}>{selected.disabled ? "Réintégrer au Random" : "Exclure du Random"}</button></div><div className="editor-footer-actions"><button className="delete-item danger" onClick={() => void deleteSelected()}>Supprimer le titre</button><button className="close-editor" onClick={() => setSelectedId(undefined)}>Fermer</button></div></section> : null}
  </main>;
}
