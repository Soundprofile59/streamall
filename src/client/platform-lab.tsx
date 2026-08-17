"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ExternalSearchResult, Provider } from "@/domain/types";

const providers: Provider[] = ["audius", "youtube", "jamendo", "mixcloud"];

export function PlatformLab() {
  const [provider, setProvider] = useState<Provider>("audius");
  const [query, setQuery] = useState("Massive Attack");
  const [results, setResults] = useState<ExternalSearchResult[]>([]);
  const [selected, setSelected] = useState<ExternalSearchResult>();
  const [status, setStatus] = useState("IDLE");
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function search() {
    setStatus("SEARCHING");
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&providers=${provider}`);
    const body = (await response.json()) as { results?: ExternalSearchResult[]; providers?: Array<{ status: string; message?: string }> };
    setResults(body.results ?? []);
    setStatus(body.providers?.[0]?.message ?? body.providers?.[0]?.status ?? `HTTP ${response.status}`);
  }

  function load(result: ExternalSearchResult, autoplay = false) {
    setSelected(result);
    setStatus("LOADING");
    window.setTimeout(() => {
      if (audioRef.current && ["audius", "jamendo"].includes(result.provider)) {
        audioRef.current.src = result.url;
        audioRef.current.load();
        if (autoplay) void audioRef.current.play().catch((error: Error) => setStatus(`AUTOPLAY BLOCKED: ${error.message}`));
      }
    });
  }

  return (
    <main className="lab-shell">
      <header><div><p className="eyebrow">PROTECTED DEVELOPMENT ROUTE</p><h1>Platform Lab</h1></div><Link href="/">Retour à Streamall</Link></header>
      <section className="lab-controls panel">
        <label>Provider<select value={provider} onChange={(event) => { setProvider(event.target.value as Provider); setResults([]); setSelected(undefined); }}>{providers.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        <label>Query<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button onClick={() => void search()}>Search live</button>
        <output>State: {status}</output>
      </section>
      <section className="lab-grid">
        <div className="panel lab-results"><h2>Results</h2>{results.map((result) => <article key={result.externalId}><div><span className={`provider ${result.provider}`}>{result.provider}</span><strong>{result.title}</strong><small>{result.artistName}</small></div><button onClick={() => load(result)}>Load</button><button onClick={() => load(result, true)}>Autoplay</button></article>)}</div>
        <div className="panel lab-player"><h2>Playback</h2>
          {selected?.provider === "youtube" ? <iframe title="YouTube Platform Lab" src={`https://www.youtube.com/embed/${encodeURIComponent(selected.externalId)}?enablejsapi=1&playsinline=1`} allow="autoplay" /> : null}
          {selected?.provider === "mixcloud" ? <iframe title="Mixcloud Platform Lab" src={`https://player-widget.mixcloud.com/widget/iframe/?light=1&feed=${encodeURIComponent(selected.externalId)}`} allow="autoplay" /> : null}
          <audio ref={audioRef} controls onCanPlay={() => setStatus("READY")} onPlay={() => setStatus("PLAYING")} onPause={() => setStatus("PAUSED")} onEnded={() => setStatus("ENDED")} onError={() => setStatus("ERROR")} onTimeUpdate={(event) => { setPosition(event.currentTarget.currentTime); setDuration(event.currentTarget.duration || 0); }} />
          <dl><dt>Selected</dt><dd>{selected?.title ?? "—"}</dd><dt>Position</dt><dd>{position.toFixed(1)} s</dd><dt>Duration</dt><dd>{duration.toFixed(1)} s</dd><dt>Mobile</dt><dd>MANUAL TEST REQUIRED</dd></dl>
        </div>
      </section>
    </main>
  );
}
