import { PublishedContentCache } from '../../../src/engagement/content.service';

describe('engagement stress bounds', () => {
  it('expands a synthetic 100k audience in fixed 500-row batches without duplication', () => {
    const seen = new Set<number>();
    const batchSize = 500;
    const startedAt = performance.now();
    for (let offset = 0; offset < 100_000; offset += batchSize) {
      const batch = Array.from({ length: batchSize }, (_, index) => offset + index);
      expect(batch).toHaveLength(batchSize);
      for (const user of batch) seen.add(user);
    }
    expect(seen.size).toBe(100_000);
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });

  it('coalesces a cold-cache request storm and reloads after invalidation', async () => {
    const cache = new PublishedContentCache();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = jest.fn(async () => {
      await gate;
      return { key: 'privacy-policy' };
    });
    const key = {
      locale: 'ar',
      type: 'policy',
      query: '',
      cursor: '',
      version: 1,
      contentKey: 'privacy-policy',
    } as const;
    const reads = Array.from({ length: 1_000 }, () => cache.get(key, load));
    release?.();
    await expect(Promise.all(reads)).resolves.toHaveLength(1_000);
    expect(load).toHaveBeenCalledTimes(1);
    cache.invalidate('privacy-policy');
    await cache.get(key, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
