import { resolveSources, type PlaybackContext } from "./providers";
import type { PlayableItem, Source } from "./types";

export type PlayerState = "IDLE" | "LOADING" | "READY" | "PLAYING" | "PAUSED" | "ENDED" | "ERROR";
export type ProviderEvent =
  | { type: "ready" }
  | { type: "playing" }
  | { type: "paused" }
  | { type: "ended" }
  | { type: "position"; position: number; duration?: number }
  | { type: "error"; error: Error };

export interface PlaybackAdapter {
  load(source: Source, onEvent: (event: ProviderEvent) => void): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek?(seconds: number): Promise<void>;
  setVolume?(volume: number): Promise<void>;
  stop(): Promise<void>;
}

export interface PlayerSnapshot {
  state: PlayerState;
  item?: PlayableItem;
  source?: Source;
  position: number;
  duration?: number;
  error?: string;
}

export interface PlayerDependencies {
  adapterFor(source: Source): PlaybackAdapter;
  context(): PlaybackContext;
  onEnded(): Promise<void> | void;
  onSourceFailure(source: Source, error: Error): Promise<void> | void;
}

export class PlayerOrchestrator {
  #generation = 0;
  #adapter?: PlaybackAdapter;
  #sources: Source[] = [];
  #listeners = new Set<(snapshot: PlayerSnapshot) => void>();
  #endedGeneration?: number;
  #snapshot: PlayerSnapshot = { state: "IDLE", position: 0 };

  constructor(private readonly dependencies: PlayerDependencies) {}

  get snapshot() {
    return { ...this.#snapshot };
  }

  subscribe(listener: (snapshot: PlayerSnapshot) => void) {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(patch: Partial<PlayerSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener(this.snapshot);
  }

  async load(item: PlayableItem, sources: Source[], autoplay = true) {
    const generation = ++this.#generation;
    this.#endedGeneration = undefined;
    const previous = this.#adapter;
    this.#adapter = undefined;
    if (previous) await previous.stop().catch(() => undefined);
    if (generation !== this.#generation) return;
    this.#sources = resolveSources(sources, this.dependencies.context());
    this.#emit({ state: "LOADING", item, source: undefined, position: 0, duration: item.duration, error: undefined });

    for (const source of this.#sources) {
      if (generation !== this.#generation) return;
      const adapter = this.dependencies.adapterFor(source);
      try {
        this.#emit({ state: "LOADING", source });
        await adapter.load(source, (event) => this.#handleEvent(generation, source, event));
        if (generation !== this.#generation) {
          await adapter.stop().catch(() => undefined);
          return;
        }
        this.#adapter = adapter;
        this.#emit({ state: "READY", source });
        if (autoplay) {
          try {
            await this.play();
          } catch (error) {
            if (error instanceof DOMException && error.name === "NotAllowedError") {
              this.#emit({ state: "READY", error: "Touchez Lecture pour continuer" });
            } else {
              throw error;
            }
          }
        }
        return;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        await this.dependencies.onSourceFailure(source, error);
        await adapter.stop().catch(() => undefined);
      }
    }
    if (generation === this.#generation) this.#emit({ state: "ERROR", error: "Aucune source jouable" });
  }

  async play() {
    if (!this.#adapter) return;
    await this.#adapter.play();
  }

  async pause() {
    if (!this.#adapter) return;
    await this.#adapter.pause();
  }

  async seek(seconds: number) {
    if (!this.#adapter?.seek) return;
    await this.#adapter.seek(seconds);
    this.#emit({ position: seconds });
  }

  async setVolume(volume: number) {
    if (this.#adapter?.setVolume) await this.#adapter.setVolume(Math.max(0, Math.min(1, volume)));
  }

  async stop() {
    ++this.#generation;
    if (this.#adapter) await this.#adapter.stop().catch(() => undefined);
    this.#adapter = undefined;
    this.#emit({ state: "IDLE", item: undefined, source: undefined, position: 0, duration: undefined, error: undefined });
  }

  async #handleEvent(generation: number, source: Source, event: ProviderEvent) {
    if (generation !== this.#generation || source.id !== this.#snapshot.source?.id) return;
    if (event.type === "position") this.#emit({ position: event.position, duration: event.duration ?? this.#snapshot.duration });
    if (event.type === "playing") this.#emit({ state: "PLAYING" });
    if (event.type === "paused") this.#emit({ state: "PAUSED" });
    if (event.type === "error") {
      await this.dependencies.onSourceFailure(source, event.error);
      const remaining = this.#sources.filter((candidate) => candidate.id !== source.id);
      const item = this.#snapshot.item;
      if (item && remaining.length) await this.load(item, remaining, true);
      else this.#emit({ state: "ERROR", error: event.error.message });
    }
    if (event.type === "ended" && this.#endedGeneration !== generation) {
      this.#endedGeneration = generation;
      this.#emit({ state: "ENDED" });
      await this.dependencies.onEnded();
    }
  }
}
