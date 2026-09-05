import { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';

const principal = { userId: 'user-1', sessionId: 'session-1', factorAgeSeconds: 0 };

test('notification pagination uses the timestamp/id boundary from its opaque cursor', async () => {
  const firstId = '20000000-0000-4000-8000-000000000002';
  const secondId = '10000000-0000-4000-8000-000000000001';
  const at = '2026-09-05T07:00:00.000Z';
  let listCalls = 0;
  let secondValues: unknown[] | undefined;
  const query = jest.fn((sql: string, values?: unknown[]) => {
    if (
      sql.includes('from public.notification_events where user_id') &&
      !sql.includes('count(*)')
    ) {
      listCalls += 1;
      if (listCalls === 2) secondValues = values;
      return Promise.resolve({
        rows:
          listCalls === 1
            ? [
                { value: { id: firstId }, sort_at: at, sort_id: firstId },
                { value: { id: secondId }, sort_at: at, sort_id: secondId },
              ]
            : [{ value: { id: secondId }, sort_at: at, sort_id: secondId }],
      });
    }
    if (sql.includes('count(*)')) return Promise.resolve({ rows: [{ count: '2' }] });
    return Promise.resolve({ rows: [] });
  });
  const pool = {
    withClient: <T>(run: (client: { query: typeof query }) => Promise<T>) => run({ query }),
  };
  const repository = new EngagementRepository(
    pool as unknown as PoolService,
    {} as PlatformConfigService,
  );

  const first = (await repository.execute(principal, {
    operation: 'listNotifications',
    query: { limit: 1 },
    requestId: 'r1',
  })) as { nextCursor: string; items: unknown[]; unreadCount: number };
  expect(first).toMatchObject({ items: [{ id: firstId }], unreadCount: 2 });
  await repository.execute(principal, {
    operation: 'listNotifications',
    query: { limit: 1, cursor: first.nextCursor },
    requestId: 'r2',
  });
  expect(secondValues).toEqual(expect.arrayContaining([at, firstId]));
});
