"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type SearchMode = "catalog" | "tracks";

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function SearchModeBridge() {
  const [host, setHost] = useState<HTMLFormElement>();
  const [mode, setMode] = useState<SearchMode>("catalog");

  useEffect(() => {
    const findHost = () => {
      const form = document.querySelector<HTMLFormElement>("form.searchbar");
      if (form) setHost(form);
      return Boolean(form);
    };

    if (findHost()) return;

    // Streamall renders the search bar only after the library has loaded.
    // Observe that transition instead of checking once during initial mount.
    const observer = new MutationObserver(() => {
      if (findHost()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!host) return;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Recherche multi-provider"]');
    const submitButton = host.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!input) return;

    input.placeholder = mode === "catalog"
      ? "Chercher un artiste, un album ou un EP…"
      : "Chercher un titre ou un mix…";

    const launchCatalog = () => {
      const value = input.value.trim();
      if (value.length < 2) return;
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
      if (mode !== "catalog") return;
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

    host.addEventListener("submit", onSubmit, true);
    submitButton?.addEventListener("click", onButtonClick, true);
    input.addEventListener("keydown", onKeyDown, true);
    return () => {
      host.removeEventListener("submit", onSubmit, true);
      submitButton?.removeEventListener("click", onButtonClick, true);
      input.removeEventListener("keydown", onKeyDown, true);
    };
  }, [host, mode]);

  if (!host) return null;

  return createPortal(
    <div className="search-mode-toggle" role="group" aria-label="Type de recherche">
      <button type="button" className={mode === "catalog" ? "active" : ""} onClick={() => setMode("catalog")} title="Artistes, albums et EP du catalogue">Catalogue</button>
      <button type="button" className={mode === "tracks" ? "active" : ""} onClick={() => setMode("tracks")} title="Chercher un titre ou un mix">Titres</button>
    </div>,
    host,
  );
}
