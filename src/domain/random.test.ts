import { describe, expect, it } from "vitest";
import { generateRandomQueue, seededRandom, selectRandomItem, starRatingWeight } from "./random";
import { libraryFixture } from "@/test/fixtures";

describe("random engine", () => {
  it("is deterministic for a seed", () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second));

    const library = libraryFixture(30);
    expect(selectRandomItem(library, {}, 42).item?.id).toBe(selectRandomItem(library, {}, 42).item?.id);
  });

  it("never relaxes explicit filters, disabled items, or disabled artists", () => {
    const library = libraryFixture(20);
    library.artists.find((artist) => artist.id === "artist_1")!.disabled = true;
    library.tracks.find((track) => track.id === "track_3")!.disabled = true;
    for (let seed = 0; seed < 500; seed += 1) {
      const { item } = selectRandomItem(library, { moods: ["Zen"], genres: ["Jazz"] }, seed);
      if (!item) continue;
      expect(item.moods).toContain("Zen");
      expect(item.genres).toContain("Jazz");
      expect(item.disabled).toBe(false);
      expect(item.artistIds).not.toContain("artist_1");
    }
  });

  it("honors legacy weighted frequency statistically", () => {
    const library = libraryFixture(3);
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 4_000; seed += 1) {
      const id = selectRandomItem(library, {}, seed).item!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get("track_0")!).toBeGreaterThan(counts.get("track_2")!);
    expect(counts.get("track_2")!).toBeGreaterThan(counts.get("track_1")! * 1.4);
  });

  it("maps 1-5 stars to increasing Random preference weights", () => {
    expect(starRatingWeight(undefined)).toBe(1);
    expect(starRatingWeight(1)).toBeLessThan(starRatingWeight(2));
    expect(starRatingWeight(2)).toBeLessThan(starRatingWeight(3));
    expect(starRatingWeight(3)).toBeLessThan(starRatingWeight(4));
    expect(starRatingWeight(4)).toBeLessThan(starRatingWeight(5));

    const library = libraryFixture(3);
    library.tracks[0]!.rating = 5;
    library.tracks[0]!.favorite = false;
    library.tracks[0]!.frequencyPreference = "NORMAL";
    library.tracks[1]!.rating = 1;
    library.tracks[1]!.frequencyPreference = "MORE";
    library.tracks[2]!.rating = 3;

    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const id = selectRandomItem(library, {}, seed).item!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get("track_0")!).toBeGreaterThan(counts.get("track_2")!);
    expect(counts.get("track_2")!).toBeGreaterThan(counts.get("track_1")! * 2);
  });

  it("fills a small-library queue without deadlocking", () => {
    const result = generateRandomQueue(libraryFixture(2), {}, 123, 20);
    expect(result.entries).toHaveLength(20);
    expect(result.diagnostics.every((diagnostic) => diagnostic.selectedId)).toBe(true);
  });

  it("returns no candidate rather than violating a hard filter", () => {
    const result = selectRandomItem(libraryFixture(10), { moods: ["Nonexistent"] }, 1);
    expect(result.item).toBeUndefined();
    expect(result.diagnostic.reason).toBe("NO_HARD_CANDIDATE");
  });
});
