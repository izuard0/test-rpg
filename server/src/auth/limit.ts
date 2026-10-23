// Pembatas percobaan sederhana di memori (per IP / per NIM): cukup untuk satu proses server.

export class Limiter {
  private readonly hits = new Map<string, { n: number; until: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** true bila kunci ini sudah melewati batas dalam jendela waktu. */
  blocked(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h) return false;
    if (h.until <= now) {
      this.hits.delete(key);
      return false;
    }
    return h.n >= this.max;
  }

  hit(key: string, now = Date.now()): void {
    const h = this.hits.get(key);
    if (!h || h.until <= now) this.hits.set(key, { n: 1, until: now + this.windowMs });
    else h.n++;
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Detik sampai kunci ini boleh mencoba lagi. */
  retryAfter(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    return h ? Math.max(1, Math.ceil((h.until - now) / 1000)) : 0;
  }
}
