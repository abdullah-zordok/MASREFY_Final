interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class ReportsCache {
  private readonly entries = new Map<string, Entry<unknown>>();

  constructor(
    private readonly maximumEntries = 500,
    private readonly ttlMs = 300_000,
  ) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1 || maximumEntries > 10_000)
      throw new Error('REPORT_CACHE_SIZE_INVALID');
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 300_000)
      throw new Error('REPORT_CACHE_TTL_INVALID');
  }

  static key(
    owner: string,
    namespace: 'dashboard' | 'report',
    period: string,
    currency: string,
    ledgerVersion: number,
  ): string {
    return `user:${owner}:${namespace}:${period}:${currency}:${String(ledgerVersion)}`;
  }

  get(key: string, now = Date.now()): unknown {
    const entry = this.entries.get(key);
    if (!entry || now >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  set(key: string, value: unknown, now = Date.now()): void {
    this.entries.delete(key);
    while (this.entries.size >= this.maximumEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { value: structuredClone(value), expiresAt: now + this.ttlMs });
  }

  invalidate(owner: string, namespace?: 'dashboard' | 'report'): void {
    const prefix = `user:${owner}:${namespace ? `${namespace}:` : ''}`;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
