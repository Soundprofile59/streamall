import type { PlaybackAdapter, ProviderEvent } from "@/domain/player";
import type { Source } from "@/domain/types";

type YouTubePlayerState = { ENDED: 0; PLAYING: 1; PAUSED: 2 };
type YouTubePlayer = {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(value: number): void;
  stopVideo(): void;
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
};
type YouTubeNamespace = {
  PlayerState: YouTubePlayerState;
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady(event: { target: YouTubePlayer }): void;
        onStateChange(event: { data: number }): void;
        onError(event: { data: number }): void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
    Mixcloud?: {
      PlayerWidget(iframe: HTMLIFrameElement): {
        ready: Promise<void>;
        load(key: string, startPlaying: boolean): Promise<void>;
        play(): Promise<void>;
        pause(): Promise<void>;
        seek(seconds: number): Promise<boolean>;
        getPosition(): Promise<number>;
        getDuration(): Promise<number>;
        events: {
          play: { on(callback: () => void): void };
          pause: { on(callback: () => void): void };
          ended: { on(callback: () => void): void };
          error: { on(callback: () => void): void };
          progress: { on(callback: (position: number, duration: number) => void): void };
        };
      };
    };
  }
}

export class HtmlAudioAdapter implements PlaybackAdapter {
  #cleanup?: () => void;
  constructor(private readonly element: HTMLAudioElement) {}

  async load(source: Source, onEvent: (event: ProviderEvent) => void) {
    this.#cleanup?.();
    const cleanups: Array<() => void> = [];
    const listen = <K extends keyof HTMLMediaElementEventMap>(name: K, callback: () => void) => {
      this.element.addEventListener(name, callback);
      cleanups.push(() => this.element.removeEventListener(name, callback));
    };
    let loaded = false;
    const ready = new Promise<void>((resolve, reject) => {
      listen("canplay", () => {
        loaded = true;
        onEvent({ type: "ready" });
        resolve();
      });
      listen("error", () => {
        const error = new Error(this.element.error?.message ?? "Audio playback failed");
        if (!loaded) reject(error);
        else onEvent({ type: "error", error });
      });
    });
    listen("play", () => onEvent({ type: "playing" }));
    listen("pause", () => onEvent({ type: "paused" }));
    listen("ended", () => onEvent({ type: "ended" }));
    listen("timeupdate", () => onEvent({ type: "position", position: this.element.currentTime, duration: this.element.duration || undefined }));
    this.#cleanup = () => cleanups.forEach((cleanup) => cleanup());
    this.element.src = source.url;
    this.element.load();
    await ready;
  }

  async play() { await this.element.play(); }
  async pause() { this.element.pause(); }
  async seek(seconds: number) { this.element.currentTime = seconds; }
  async setVolume(volume: number) { this.element.volume = volume; }
  async stop() {
    this.element.pause();
    this.element.removeAttribute("src");
    this.element.load();
    this.#cleanup?.();
  }
}

let youtubeReady: Promise<YouTubeNamespace> | undefined;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  youtubeReady ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("YouTube API timeout")), 10_000);
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (window.YT) resolve(window.YT);
      else reject(new Error("YouTube API unavailable"));
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.append(script);
    }
  });
  return youtubeReady;
}

export class YouTubeAdapter implements PlaybackAdapter {
  #player?: YouTubePlayer;
  #interval?: number;
  constructor(private readonly container: HTMLElement) {}

  async load(source: Source, onEvent: (event: ProviderEvent) => void) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const YT = await loadYouTubeApi();
    this.#player?.destroy();
    this.container.replaceChildren();
    await new Promise<void>((resolve, reject) => {
      let loaded = false;
      this.#player = new YT.Player(this.container, {
        width: "100%",
        height: "100%",
        videoId: source.providerId,
        playerVars: { controls: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: ({ target }) => {
            loaded = true;
            this.#player = target;
            onEvent({ type: "ready" });
            resolve();
          },
          onStateChange: ({ data }) => {
            if (data === YT.PlayerState.PLAYING) onEvent({ type: "playing" });
            if (data === YT.PlayerState.PAUSED) onEvent({ type: "paused" });
            if (data === YT.PlayerState.ENDED) onEvent({ type: "ended" });
          },
          onError: ({ data }) => {
            const error = new Error(`YouTube player error ${data}`);
            if (!loaded) reject(error);
            else onEvent({ type: "error", error });
          },
        },
      });
    });
    window.clearInterval(this.#interval);
    this.#interval = window.setInterval(() => {
      if (this.#player) onEvent({ type: "position", position: this.#player.getCurrentTime(), duration: this.#player.getDuration() });
    }, 1000);
  }

  async play() { this.#player?.playVideo(); }
  async pause() { this.#player?.pauseVideo(); }
  async seek(seconds: number) { this.#player?.seekTo(seconds, true); }
  async setVolume(volume: number) { this.#player?.setVolume(volume * 100); }
  async stop() {
    window.clearInterval(this.#interval);
    this.#player?.stopVideo();
    this.#player?.destroy();
    this.#player = undefined;
  }
}

let mixcloudReady: Promise<void> | undefined;
function loadMixcloudApi() {
  if (window.Mixcloud) return Promise.resolve();
  mixcloudReady ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://widget.mixcloud.com/media/js/widgetApi.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Mixcloud widget API unavailable"));
    document.head.append(script);
  });
  return mixcloudReady;
}

export class MixcloudAdapter implements PlaybackAdapter {
  #widget?: ReturnType<NonNullable<Window["Mixcloud"]>["PlayerWidget"]>;
  constructor(private readonly iframe: HTMLIFrameElement) {}

  async load(source: Source, onEvent: (event: ProviderEvent) => void) {
    this.iframe.src = `https://player-widget.mixcloud.com/widget/iframe/?light=1&feed=${encodeURIComponent(source.providerId)}`;
    await loadMixcloudApi();
    if (!window.Mixcloud) throw new Error("Mixcloud API unavailable");
    this.#widget = window.Mixcloud.PlayerWidget(this.iframe);
    const widget = this.#widget;
    await widget.ready;
    widget.events.play.on(() => onEvent({ type: "playing" }));
    widget.events.pause.on(() => onEvent({ type: "paused" }));
    widget.events.ended.on(() => onEvent({ type: "ended" }));
    widget.events.error.on(() => onEvent({ type: "error", error: new Error("Mixcloud playback error") }));
    widget.events.progress.on((position, duration) => onEvent({ type: "position", position, duration }));
    onEvent({ type: "ready" });
  }

  async play() { await this.#widget?.play(); }
  async pause() { await this.#widget?.pause(); }
  async seek(seconds: number) { await this.#widget?.seek(seconds); }
  async stop() { await this.#widget?.pause(); }
}
