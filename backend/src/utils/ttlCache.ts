import type { HotspotsResponse } from "@civicpulse/shared";

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private entry: Entry<T> | undefined;

  constructor(private readonly ttlMs: number) {}

  get(): T | undefined {
    if (!this.entry) return undefined;
    if (Date.now() >= this.entry.expiresAt) {
      this.entry = undefined;
      return undefined;
    }
    return this.entry.value;
  }

  set(value: T): void {
    this.entry = { value, expiresAt: Date.now() + this.ttlMs };
  }

  invalidate(): void {
    this.entry = undefined;
  }
}

export const hotspotsCache = new TTLCache<HotspotsResponse>(30_000);

export function invalidateHotspotsCache(): void {
  hotspotsCache.invalidate();
}
