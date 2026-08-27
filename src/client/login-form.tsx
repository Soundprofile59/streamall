"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";

const subscribeToHydration = () => () => undefined;

export function LoginForm() {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") ? next : "/");
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setError(body?.error === "TOO_MANY_ATTEMPTS" ? "Trop de tentatives. Réessayez plus tard." : "Mot de passe incorrect.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="login-form">
      <label htmlFor="password">Mot de passe</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={!hydrated} autoFocus />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button type="submit" className="primary-button" disabled={!hydrated || busy || !password}>{busy ? "Connexion…" : "Entrer"}</button>
    </form>
  );
}
