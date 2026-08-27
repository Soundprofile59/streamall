import { describe, expect, it, vi } from "vitest";
import { PlayerOrchestrator, type PlaybackAdapter, type ProviderEvent } from "./player";
import { libraryFixture, sourceFixture } from "@/test/fixtures";

class FakeAdapter implements PlaybackAdapter {
  event?: (event: ProviderEvent) => void;
  volumes: number[] = [];
  constructor(private readonly fails = false) {}
  async load(_source: ReturnType<typeof sourceFixture>, onEvent: (event: ProviderEvent) => void) {
    this.event = onEvent;
    if (this.fails) throw new Error("load failed");
  }
  async play() { this.event?.({ type: "playing" }); }
  async pause() { this.event?.({ type: "paused" }); }
  async setVolume(volume: number) { this.volumes.push(volume); }
  async stop() {}
}

function context() {
  return { isMobile: false, isStandalone: false, hasUserActivation: true };
}

describe("PlayerOrchestrator race safety", () => {
  it("ignores late events from the previous load and double-ended", async () => {
    const adapterA = new FakeAdapter();
    const adapterB = new FakeAdapter();
    const ended = vi.fn();
    const orchestrator = new PlayerOrchestrator({
      adapterFor: (source) => source.id === "source_1" ? adapterA : adapterB,
      context,
      onEnded: ended,
      onSourceFailure: vi.fn(),
    });
    const item = libraryFixture(1).tracks[0]!;
    await orchestrator.load(item, [sourceFixture("source_1")]);
    await orchestrator.load(item, [sourceFixture("source_2")]);
    adapterA.event?.({ type: "ended" });
    expect(ended).not.toHaveBeenCalled();
    adapterB.event?.({ type: "ended" });
    adapterB.event?.({ type: "ended" });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next Source once", async () => {
    const failure = new FakeAdapter(true);
    const fallback = new FakeAdapter();
    const onFailure = vi.fn();
    const orchestrator = new PlayerOrchestrator({
      adapterFor: (source) => source.id === "source_1" ? failure : fallback,
      context,
      onEnded: vi.fn(),
      onSourceFailure: onFailure,
    });
    const first = sourceFixture("source_1");
    first.priority = 0;
    const second = sourceFixture("source_2");
    second.priority = 1;
    await orchestrator.load(libraryFixture(1).tracks[0]!, [first, second]);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(orchestrator.snapshot.source?.id).toBe("source_2");
    expect(orchestrator.snapshot.state).toBe("PLAYING");
  });

  it("does not report playback without a provider playing event", async () => {
    const silent = new FakeAdapter();
    silent.play = async () => undefined;
    const orchestrator = new PlayerOrchestrator({
      adapterFor: () => silent,
      context,
      onEnded: vi.fn(),
      onSourceFailure: vi.fn(),
    });

    await orchestrator.load(libraryFixture(1).tracks[0]!, [sourceFixture("source_1")]);

    expect(orchestrator.snapshot.state).toBe("READY");
  });

  it("reapplies the chosen volume when the source or track changes", async () => {
    const adapterA = new FakeAdapter();
    const adapterB = new FakeAdapter();
    const orchestrator = new PlayerOrchestrator({
      adapterFor: (source) => source.id === "source_1" ? adapterA : adapterB,
      context,
      onEnded: vi.fn(),
      onSourceFailure: vi.fn(),
    });

    await orchestrator.setVolume(0.37);
    const item = libraryFixture(1).tracks[0]!;
    await orchestrator.load(item, [sourceFixture("source_1")]);
    await orchestrator.load(item, [sourceFixture("source_2")]);

    expect(adapterA.volumes.at(-1)).toBe(0.37);
    expect(adapterB.volumes.at(-1)).toBe(0.37);
  });
});
