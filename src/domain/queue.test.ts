import { describe, expect, it } from "vitest";
import { StreamallQueue } from "./queue";

const entry = (id: string) => ({ id, itemId: `item_${id}`, generatedAt: "2026-08-17T10:00:00.000Z", reason: "RANDOM" as const });

describe("StreamallQueue", () => {
  it("uses played history for Previous without drawing Random again", () => {
    const queue = new StreamallQueue([entry("1"), entry("2")]);
    expect(queue.next()?.id).toBe("1");
    expect(queue.previous()?.id).toBe("1");
    expect(queue.upcoming.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("regenerates one entry without disturbing the rest", () => {
    const queue = new StreamallQueue([entry("1"), entry("2"), entry("3")]);
    queue.regenerate("2", "replacement");
    expect(queue.upcoming.map((item) => item.itemId)).toEqual(["item_1", "replacement", "item_3"]);
  });
});
