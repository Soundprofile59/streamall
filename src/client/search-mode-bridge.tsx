"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SearchMode = "catalog" | "sources";

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function SearchModeBridge() {
  const [host, setHost] = useState<HTMLFormElement>();
  const [mode, setMode] = useState<SearchMode>("catalog");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const form = document.querySelector<HTMLFormElement>("form.searchbar");
      if (form) setHost(form);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!host) return;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
    if (!input) return;

    input.placeholder = mode === "catalog"
      ? "Chercher un artiste, un album ou un EP…"
      : "Chercher une source de lecture précise…";

    const onSubmit = (event: SubmitEvent) => {
      if (mode !== "catalog") return;
      const value = input.value.trim();
      event.preventDefault();
      event.stopImmediatePropagation();
      if (value.length < 2) return;

      // Le navigateur MusicBrainz reste le moteur catalogue, mais il est
      // désormais piloté par la recherche principale.
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

    host.addEventListener("submit", onSubmit, true);
    return () => host.removeEventListener("submit", onSubmit, true);
  }, [host, mode]);

  if (!host) return null;

  return createPortal(
    <div className="search-mode-toggle" role="group" aria-label="Type de recherche">
      <button type="button" className={mode === "catalog" ? "active" : ""} onClick={() => setMode("catalog")} title="Artistes, albums et EP du catalogue">Catalogue</button>
      <button type="button" className={mode === "sources" ? "active" : ""} onClick={() => setMode("sources")} title="Résultats YouTube, Audius, Jamendo et Mixcloud">Sources</button>
    </div>,
    host,
  );
}
