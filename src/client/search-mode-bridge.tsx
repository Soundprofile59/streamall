"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SearchMode = "catalog" | "tracks";
type SearchHistoryEntry = { query: string; mode: SearchMode };

const HISTORY_KEY = "streamall:search-history:v1";
const HISTORY_LIMIT = 8;

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function closeCatalogBrowser() {
  document.querySelector<HTMLButtonElement>('.catalog-header button[aria-label="Retour à la bibliothèque"]')?.click();
}

function readHistory(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as SearchHistoryEntry[];
    return parsed
      .filter((entry) => entry && typeof entry.query === "string" && (entry.mode === "catalog" || entry.mode === "tracks"))
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function writeHistory(entries: SearchHistoryEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // L'historique de recherche reste un confort local : l'app continue sans lui.
  }
}

export function SearchModeBridge() {
  const [host, setHost] = useState<HTMLFormElement>();
  const [mode, setMode] = useState<SearchMode>("catalog");
  const [history, setHistory] = useState<SearchHistoryEntry[]>(readHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const forceTrackSubmit = useRef(false);
  const suppressTrackHistory = useRef(false);

  useEffect(() => {
    const findHost = () => {
      const form = document.querySelector<HTMLFormElement>("form.searchbar");
      if (form) setHost(form);
      return Boolean(form);
    };

    if (findHost()) return;

    const observer = new MutationObserver(() => {
      if (findHost()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const refresh = () => setHistory(readHistory());
    window.addEventListener("streamall:search-history-updated", refresh);
    return () => window.removeEventListener("streamall:search-history-updated", refresh);
  }, []);

  useEffect(() => {
    if (!host) return;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
    const submitButton = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!input) return;

    input.placeholder = mode === "catalog"
      ? "Chercher un artiste, un album ou un EP…"
      : "Chercher un titre ou un mix…";

    const remember = (value: string, searchMode: SearchMode) => {
      const query = value.trim();
      if (query.length < 2) return;
      setHistory((current) => {
        const next = [
          { query, mode: searchMode },
          ...current.filter((entry) => entry.query.toLocaleLowerCase() !== query.toLocaleLowerCase()),
        ].slice(0, HISTORY_LIMIT);
        writeHistory(next);
        return next;
      });
    };

    const launchCatalog = () => {
      const value = input.value.trim();
      if (value.length < 2) return;
      remember(value, "catalog");
      setHistoryOpen(false);
      document.querySelector<HTMLButtonElement>(".catalog-launcher")?.click();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const catalogInput = document.querySelector<HTMLInputElement>(".catalog-search input");
          if (!catalogInput?.form) return;
          setNativeValue(catalogInput, value);
          catalogInput.form.requestSubmit();
        });
      });
    };

    const onSubmit = (event: SubmitEvent) => {
      const value = input.value.trim();
      if (forceTrackSubmit.current) {
        forceTrackSubmit.current = false;
        if (!suppressTrackHistory.current) remember(value, "tracks");
        suppressTrackHistory.current = false;
        setHistoryOpen(false);
        return;
      }
      if (mode !== "catalog") {
        remember(value, "tracks");
        setHistoryOpen(false);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      launchCatalog();
    };

    const onButtonClick = (event: MouseEvent) => {
      if (mode !== "catalog") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      launchCatalog();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (mode !== "catalog" || event.key !== "Enter") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      launchCatalog();
    };

    const openHistory = () => setHistoryOpen(true);
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!host.contains(event.target as Node)) setHistoryOpen(false);
    };

    host.addEventListener("submit", onSubmit, true);
    submitButton?.addEventListener("click", onButtonClick, true);
    input.addEventListener("keydown", onKeyDown, true);
    input.addEventListener("focus", openHistory);
    input.addEventListener("click", openHistory);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      host.removeEventListener("submit", onSubmit, true);
      submitButton?.removeEventListener("click", onButtonClick, true);
      input.removeEventListener("keydown", onKeyDown, true);
      input.removeEventListener("focus", openHistory);
      input.removeEventListener("click", openHistory);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [host, mode]);

  useEffect(() => {
    if (!host) return;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
    if (!input) return;

    const onCatalogTrackPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ artistName?: string; title?: string }>).detail;
      const artistName = detail?.artistName?.trim();
      const title = detail?.title?.trim();
      if (!title) return;

      const previousValue = input.value;
      const value = [artistName, title].filter(Boolean).join(" ");
      setHistoryOpen(false);
      setNativeValue(input, value);
      forceTrackSubmit.current = true;
      suppressTrackHistory.current = true;
      host.requestSubmit();

      const restoreSearchField = () => {
        setNativeValue(input, previousValue);
      };

      const startedAt = Date.now();
      const observer = new MutationObserver(() => {
        const preview = document.querySelector<HTMLButtonElement>(".search-results .result-card .preview-button");
        if (preview) {
          observer.disconnect();
          preview.click();
          window.requestAnimationFrame(restoreSearchField);
        } else if (Date.now() - startedAt > 12_000) {
          observer.disconnect();
          restoreSearchField();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.setTimeout(() => {
        observer.disconnect();
        restoreSearchField();
      }, 12_500);
    };

    window.addEventListener("streamall:preview-catalog-track", onCatalogTrackPreview);
    return () => window.removeEventListener("streamall:preview-catalog-track", onCatalogTrackPreview);
  }, [host]);

  if (!host) return null;

  return createPortal(
    <>
      <div className="search-mode-toggle" role="group" aria-label="Type de recherche">
        <button type="button" className={mode === "catalog" ? "active" : ""} onClick={() => setMode("catalog")} title="Artistes, albums et EP du catalogue">Catalogue</button>
        <button type="button" className={mode === "tracks" ? "active" : ""} onClick={() => { closeCatalogBrowser(); setMode("tracks"); }} title="Chercher un titre ou un mix">Titres</button>
      </div>
      {historyOpen && history.length ? <div className="search-history-menu" role="listbox" aria-label="Recherches précédentes">
        <div className="search-history-heading">
          <span>Recherches récentes</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { writeHistory([]); setHistory([]); }}>Effacer</button>
        </div>
        {history.map((entry) => <button
          type="button"
          className="search-history-entry"
          key={`${entry.mode}:${entry.query}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const input = host.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
            if (!input) return;
            if (entry.mode === "tracks") closeCatalogBrowser();
            setMode(entry.mode);
            setNativeValue(input, entry.query);
            input.focus();
            setHistoryOpen(false);
          }}
        >
          <span>{entry.query}</span><small>{entry.mode === "catalog" ? "Catalogue" : "Titres"}</small>
        </button>)}
      </div> : null}
    </>,
    host,
  );
}
