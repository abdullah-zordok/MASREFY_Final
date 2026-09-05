import { PublishedContentCache } from '../../../src/engagement/content.service';
import { parseAudience } from '../../../src/engagement/campaign.service';
import { DeterministicNotificationProvider } from '../../../src/engagement/notification.providers';

describe('engagement performance budgets', () => {
  it('keeps bounded audience parsing and cached content reads below local CPU budgets', async () => {
    const durations: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const startedAt = performance.now();
      expect(
        parseAudience({
          platforms: ['ios', 'android', 'web'],
          locales: ['ar', 'en'],
          activity: 'active',
          segmentKeys: ['salary_users'],
        }),
      ).toBeDefined();
      durations.push(performance.now() - startedAt);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.99) - 1]).toBeLessThan(50);

    const cache = new PublishedContentCache();
    const load = jest.fn().mockResolvedValue({ items: Array(100).fill({ key: 'safe' }) });
    const key = { locale: 'en', type: 'faq', query: '', cursor: '', version: 1 } as const;
    await cache.get(key, load);
    const cached: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const startedAt = performance.now();
      await cache.get(key, load);
      cached.push(performance.now() - startedAt);
    }
    cached.sort((left, right) => left - right);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cached[Math.ceil(cached.length * 0.99) - 1]).toBeLessThan(50);
  });

  it('keeps deterministic provider failures bounded and payload-safe', async () => {
    const input = {
      token: 'fixture-token',
      eventId: '10000000-0000-4000-8000-000000000001',
      title: 'Masarifi',
      body: 'A safe update is available.',
      route: 'notification_detail',
    };
    const startedAt = performance.now();
    const outcomes = await Promise.all(
      Array.from({ length: 1_000 }, () =>
        new DeterministicNotificationProvider('retryable').send(input),
      ),
    );
    expect(outcomes).toHaveLength(1_000);
    expect(new Set(outcomes.map((item) => item.status))).toEqual(new Set(['retryable']));
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
