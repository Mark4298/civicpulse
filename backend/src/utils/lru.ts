export class LRUCache<K, V> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("LRU capacity must be a positive integer");
    }
  }

  // Map deletion/reinsertion keeps get and put expected O(1).
  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  // Eviction is O(1) because Map iteration preserves insertion order.
  put(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as K | undefined;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
