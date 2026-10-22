// Tiny in-memory LRU + TTL cache so re-opening a ticket doesn't pay for the same AI call twice.
// A Map keeps insertion order, so the first key is always the least recently used one.

import { createHash } from 'crypto';

export class TtlLruCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxEntries = 500,
    private readonly ttlMs = 60 * 60 * 1000, // 1 hour
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Re-insert to mark as most recently used.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value as string;
      this.store.delete(oldest);
    }
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Stable cache key: sha256 of the JSON of everything that affects the AI output. */
export function cacheKey(...parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
