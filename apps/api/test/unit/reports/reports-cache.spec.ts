import { ReportsCache } from '../../../src/reports/reports.cache';

describe('ReportsCache', () => {
  it('isolates owner, namespace, period, currency, and ledger version', () => {
    const cache = new ReportsCache(2, 300_000);
    const key = ReportsCache.key('owner-a', 'report', 'financial_summary:monthly', 'SAR', 7);
    cache.set(key, { value: 1 }, 1_000);
    expect(cache.get(key, 1_001)).toEqual({ value: 1 });
    expect(
      cache.get(
        ReportsCache.key('owner-b', 'report', 'financial_summary:monthly', 'SAR', 7),
        1_001,
      ),
    ).toBeUndefined();
    expect(
      cache.get(
        ReportsCache.key('owner-a', 'dashboard', 'financial_summary:monthly', 'SAR', 7),
        1_001,
      ),
    ).toBeUndefined();
    expect(
      cache.get(ReportsCache.key('owner-a', 'report', 'financial_summary:annual', 'SAR', 7), 1_001),
    ).toBeUndefined();
    expect(
      cache.get(
        ReportsCache.key('owner-a', 'report', 'financial_summary:monthly', 'USD', 7),
        1_001,
      ),
    ).toBeUndefined();
    expect(
      cache.get(
        ReportsCache.key('owner-a', 'report', 'financial_summary:monthly', 'SAR', 8),
        1_001,
      ),
    ).toBeUndefined();
  });

  it('expires entries and evicts the oldest entry at its fixed bound', () => {
    const cache = new ReportsCache(2, 50);
    cache.set('a', 1, 100);
    cache.set('b', 2, 101);
    cache.set('c', 3, 102);
    expect(cache.get('a', 102)).toBeUndefined();
    expect(cache.get('b', 102)).toBe(2);
    expect(cache.get('b', 151)).toBeUndefined();
  });

  it('invalidates only one owner and namespace', () => {
    const cache = new ReportsCache(5, 50);
    cache.set(ReportsCache.key('a', 'report', 'monthly', 'all', 1), 1, 0);
    cache.set(ReportsCache.key('a', 'dashboard', 'monthly', 'all', 1), 2, 0);
    cache.set(ReportsCache.key('b', 'report', 'monthly', 'all', 1), 3, 0);
    cache.invalidate('a', 'report');
    expect(cache.get(ReportsCache.key('a', 'report', 'monthly', 'all', 1), 1)).toBeUndefined();
    expect(cache.get(ReportsCache.key('a', 'dashboard', 'monthly', 'all', 1), 1)).toBe(2);
    expect(cache.get(ReportsCache.key('b', 'report', 'monthly', 'all', 1), 1)).toBe(3);
  });
});
