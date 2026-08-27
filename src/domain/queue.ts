import { streamallId } from "./library";
import type { QueueEntry } from "./types";

export class StreamallQueue {
  #entries: QueueEntry[];
  #past: QueueEntry[] = [];

  constructor(entries: QueueEntry[] = []) {
    this.#entries = [...entries];
  }

  get upcoming() {
    return [...this.#entries];
  }

  get history() {
    return [...this.#past];
  }

  next() {
    const entry = this.#entries.shift();
    if (entry) this.#past.push(entry);
    return entry;
  }

  previous() {
    const previous = this.#past.pop();
    if (!previous) return undefined;
    this.#entries.unshift(previous);
    return previous;
  }

  append(entries: QueueEntry[]) {
    this.#entries.push(...entries);
  }

  remove(entryId: string) {
    this.#entries = this.#entries.filter((entry) => entry.id !== entryId);
  }

  reorder(entryId: string, toIndex: number) {
    const fromIndex = this.#entries.findIndex((entry) => entry.id === entryId);
    if (fromIndex < 0) return;
    const [entry] = this.#entries.splice(fromIndex, 1);
    if (entry) this.#entries.splice(Math.max(0, Math.min(toIndex, this.#entries.length)), 0, entry);
  }

  regenerate(entryId: string, itemId: string) {
    const index = this.#entries.findIndex((entry) => entry.id === entryId);
    if (index < 0) return;
    this.#entries[index] = { id: streamallId("queue"), itemId, generatedAt: new Date().toISOString(), reason: "RANDOM" };
  }

  replaceUpcoming(entries: QueueEntry[]) {
    this.#entries = [...entries];
  }
}
