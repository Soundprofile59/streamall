"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_GENRE_MOOD_MAP,
  GENRE_MOOD_GROUPS,
  STREAMALL_MOODS,
  effectiveGenreMoodMap,
  moodsForGenres,
  normalizeGenreKey,
  type GenreMoodMap,
} from "@/domain/mood-map";
import type { LibrarySnapshot } from "@/domain/types";

function cloneMap(map: GenreMoodMap): GenreMoodMap {
  return Object.fromEntries(Object.entries(map).map(([genre, moods]) => [genre, [...moods]]));
}

function actualLibraryGenres(snapshot: LibrarySnapshot) {
  const values = [
    ...snapshot.albums.flatMap((album) => album.genres ?? []),
    ...snapshot.tracks.flatMap((track) => track.genres),
    ...snapshot.mixes.flatMap((mix) => mix.genres),
  ];
  const byKey = new Map<string, string>();
  for (const value of values) {
    const label = value.trim();
    const key = normalizeGenreKey(label);
    if (key && !byKey.has(key)) byKey.set(key, label);
  }
  return [...byKey.values()];
}

export function MoodMatrixDialog() {
  const [host, setHost] = useState<HTMLElement>();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>();
  const [map, setMap] = useState<GenreMoodMap>(() => cloneMap(DEFAULT_GENRE_MOOD_MAP));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>();
  const [newGenre, setNewGenre] = useState("");

  useEffect(() => {
    const findHost = () => {
      const node = document.querySelector<HTMLElement>(".library-nav");
      if (node) setHost(node);
      return Boolean(node);
    };
    if (findHost()) return;
    const observer = new MutationObserver(() => {
      if (findHost()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function showDialog() {
    setOpen(true);
    setLoading(true);
    setSaving(false);
    setStatus(undefined);
    try {
      const response = await fetch("/api/library");
      if (!response.ok) throw new Error("Bibliothèque indisponible");
      const current = (await response.json()) as LibrarySnapshot;
      const nextMap = effectiveGenreMoodMap(current.settings.moodMap);
      for (const genre of actualLibraryGenres(current)) {
        const exists = Object.keys(nextMap).some((candidate) => normalizeGenreKey(candidate) === normalizeGenreKey(genre));
        if (!exists) nextMap[genre] = [];
      }
      setSnapshot(current);
      setMap(nextMap);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Impossible de charger la matrice");
    } finally {
      setLoading(false);
    }
  }

  function toggle(genre: string, mood: string) {
    setMap((current) => {
      const values = current[genre] ?? [];
      const next = values.includes(mood) ? values.filter((entry) => entry !== mood) : [...values, mood];
      return { ...current, [genre]: STREAMALL_MOODS.filter((entry) => next.includes(entry)) };
    });
  }

  function resetDefaults() {
    if (!window.confirm("Réinitialiser toutes les correspondances Genre → Mood avec la grille Streamall proposée ?")) return;
    const next = cloneMap(DEFAULT_GENRE_MOOD_MAP);
    if (snapshot) {
      for (const genre of actualLibraryGenres(snapshot)) {
        const exists = Object.keys(next).some((candidate) => normalizeGenreKey(candidate) === normalizeGenreKey(genre));
        if (!exists) next[genre] = [];
      }
    }
    setMap(next);
    setStatus("Grille réinitialisée localement · cliquez sur Enregistrer pour la conserver.");
  }

  function addGenre() {
    const label = newGenre.trim();
    if (!label) return;
    const existing = Object.keys(map).find((genre) => normalizeGenreKey(genre) === normalizeGenreKey(label));
    if (existing) {
      setStatus(`« ${existing} » est déjà dans la grille.`);
      return;
    }
    setMap((current) => ({ ...current, [label]: [] }));
    setNewGenre("");
  }

  async function save() {
    if (!snapshot || saving) return;
    setSaving(true);
    setStatus("Enregistrement…");
    const now = new Date().toISOString();
    const nextTracks = snapshot.tracks.map((track) => {
      if (track.moods.length) return track;
      const inferred = moodsForGenres(track.genres, map);
      return inferred.length
        ? { ...track, moods: inferred, revision: track.revision + 1, updatedAt: now }
        : track;
    });
    const registry = [
      ...STREAMALL_MOODS,
      ...snapshot.moods.filter((mood) => !STREAMALL_MOODS.includes(mood as (typeof STREAMALL_MOODS)[number])),
    ];
    const next: LibrarySnapshot = {
      ...snapshot,
      updatedAt: now,
      tracks: nextTracks,
      moods: registry,
      settings: { ...snapshot.settings, moodMap: cloneMap(map) },
    };

    try {
      const response = await fetch("/api/library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: next, expectedRevision: snapshot.revision, operationId: crypto.randomUUID() }),
      });
      const body = (await response.json().catch(() => null)) as LibrarySnapshot | { message?: string; error?: string } | null;
      if (!response.ok) {
        const errorBody = body as { message?: string; error?: string } | null;
        throw new Error(errorBody?.message ?? errorBody?.error ?? "Enregistrement impossible");
      }
      setStatus("✓ Grille enregistrée · les titres sans mood ont été complétés sans écraser vos corrections manuelles.");
      window.setTimeout(() => window.location.reload(), 750);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Enregistrement impossible");
      setSaving(false);
    }
  }

  const predefinedKeys = useMemo(
    () => new Set(GENRE_MOOD_GROUPS.flatMap((group) => group.rows.map((row) => normalizeGenreKey(row.genre)))),
    [],
  );
  const customRows = useMemo(
    () => Object.keys(map)
      .filter((genre) => !predefinedKeys.has(normalizeGenreKey(genre)))
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    [map, predefinedKeys],
  );

  const popup = open ? <div className="mood-matrix-backdrop" onMouseDown={() => !saving && setOpen(false)}>
    <section className="mood-matrix-dialog panel" role="dialog" aria-modal="true" aria-label="Table Genre vers Mood" onMouseDown={(event) => event.stopPropagation()}>
      <header className="mood-matrix-header">
        <div>
          <p className="eyebrow">RÉFÉRENTIEL STREAMALL</p>
          <h2>Genres → Moods</h2>
          <p>Une croix signifie que le genre peut recevoir ce mood. La grille est préremplie et reste entièrement modifiable.</p>
        </div>
        <button type="button" onClick={() => !saving && setOpen(false)} aria-label="Fermer">×</button>
      </header>

      <div className="mood-matrix-toolbar">
        <div className="mood-matrix-add">
          <input value={newGenre} onChange={(event) => setNewGenre(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGenre(); } }} placeholder="Ajouter un genre…" />
          <button type="button" onClick={addGenre}>＋ Genre</button>
        </div>
        <button type="button" className="mood-matrix-reset" onClick={resetDefaults}>Réinitialiser la grille</button>
      </div>

      <div className="mood-matrix-scroll">
        {loading ? <div className="mood-matrix-loading">Chargement du référentiel…</div> : <table className="mood-matrix-table">
          <thead>
            <tr>
              <th>Genre</th>
              {STREAMALL_MOODS.map((mood) => <th key={mood}>{mood}</th>)}
            </tr>
          </thead>
          <tbody>
            {GENRE_MOOD_GROUPS.map((group) => <Fragment key={group.label}>
              <tr className="mood-family-row"><th colSpan={STREAMALL_MOODS.length + 1}>{group.label}</th></tr>
              {group.rows.map((row) => <tr key={row.genre}>
                <th>{row.genre}</th>
                {STREAMALL_MOODS.map((mood) => {
                  const checked = (map[row.genre] ?? []).includes(mood);
                  return <td key={mood}>
                    <button type="button" className={checked ? "checked" : ""} onClick={() => toggle(row.genre, mood)} aria-pressed={checked} aria-label={`${row.genre} · ${mood}`}>{checked ? "×" : ""}</button>
                  </td>;
                })}
              </tr>)}
            </Fragment>)}
            {customRows.length ? <>
              <tr className="mood-family-row"><th colSpan={STREAMALL_MOODS.length + 1}>Genres détectés / ajoutés</th></tr>
              {customRows.map((genre) => <tr key={genre}>
                <th>{genre}</th>
                {STREAMALL_MOODS.map((mood) => {
                  const checked = (map[genre] ?? []).includes(mood);
                  return <td key={mood}><button type="button" className={checked ? "checked" : ""} onClick={() => toggle(genre, mood)} aria-pressed={checked} aria-label={`${genre} · ${mood}`}>{checked ? "×" : ""}</button></td>;
                })}
              </tr>)}
            </> : null}
          </tbody>
        </table>}
      </div>

      <footer className="mood-matrix-footer">
        <div>
          <strong>{Object.keys(map).length} genres · {STREAMALL_MOODS.length} moods</strong>
          <span>Les imports futurs utiliseront cette grille. À l’enregistrement, seuls les titres encore sans mood sont complétés.</span>
          {status ? <em>{status}</em> : null}
        </div>
        <button type="button" className="mood-matrix-save" disabled={loading || saving || !snapshot} onClick={() => void save()}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
      </footer>
    </section>
  </div> : null;

  return <>
    {host ? createPortal(<button className="mood-matrix-launcher" type="button" onClick={() => void showDialog()}>⚙ Genres → Moods</button>, host) : null}
    {popup ? createPortal(popup, document.body) : null}
  </>;
}
