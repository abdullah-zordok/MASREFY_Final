export interface PublishedContentCacheKey {
  locale: 'ar' | 'en';
  type: 'all' | 'article' | 'faq' | 'policy' | 'announcement';
  query: string;
  cursor: string;
  version: number;
  contentKey?: string;
}

export class PublishedContentCache {
  private readonly values = new Map<
    string,
    { expiresAt: number; contentKey?: string; value: unknown }
  >();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  async get<T>(key: PublishedContentCacheKey, load: () => Promise<T>): Promise<T> {
    const encoded = JSON.stringify([
      key.locale,
      key.type,
      key.query.trim().toLocaleLowerCase('en'),
      key.cursor,
      key.version,
      key.contentKey ?? '',
    ]);
    const cached = this.values.get(encoded);
    if (cached && cached.expiresAt > this.now()) return cached.value as T;
    const inFlight = this.pending.get(encoded);
    if (inFlight) return inFlight as Promise<T>;
    const promise = load()
      .then((value) => {
        this.values.set(encoded, {
          expiresAt: this.now() + 300_000,
          contentKey: key.contentKey,
          value,
        });
        return value;
      })
      .finally(() => this.pending.delete(encoded));
    this.pending.set(encoded, promise);
    return promise;
  }

  invalidate(contentKey: string): void {
    for (const [key, value] of this.values)
      if (value.contentKey === contentKey) this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}
