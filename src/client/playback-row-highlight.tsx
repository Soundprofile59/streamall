"use client";

import { useEffect } from "react";

export function PlaybackRowHighlight() {
  useEffect(() => {
    const refresh = () => {
      const currentTitle = document.querySelector<HTMLElement>(".queue-row.current strong")?.textContent?.trim() ?? "";
      const currentMeta = document.querySelector<HTMLElement>(".queue-row.current small")?.textContent ?? "";

      document.querySelectorAll<HTMLElement>(".album-library-track.rich").forEach((row) => {
        const rowTitle = row.querySelector<HTMLElement>(".album-track-title strong")?.textContent?.trim() ?? "";
        const rowMeta = row.querySelector<HTMLElement>(".album-track-title small")?.textContent ?? "";
        const rowArtist = rowMeta.split(" · ")[0]?.trim() ?? "";
        const matchesCurrent = Boolean(currentTitle && rowTitle === currentTitle && (!rowArtist || currentMeta.includes(rowArtist)));
        row.classList.toggle("is-playing", matchesCurrent);
      });
    };

    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    refresh();
    return () => observer.disconnect();
  }, []);

  return null;
}
