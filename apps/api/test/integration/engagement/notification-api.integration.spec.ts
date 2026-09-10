import { EngagementService } from '../../../src/engagement/engagement.service';
import { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { PoolService } from '../../../src/platform/database/pool.service';
import type { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { ENGAGEMENT_SOURCE_EVENTS } from '../../../src/engagement/engagement.events';
import type { SecurityRepository } from '../../../src/security/security.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';

test('notification mutation is rate-limited, versioned, owner-scoped, and followed by a safe detail read', async () => {
  const execute = jest
    .fn()
    .mockResolvedValueOnce({ id: '10000000-0000-4000-8000-000000000001', version: 2 })
    .mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000001',
      readAt: '2026-09-05T08:00:00Z',
      version: 2,
    });
  const security = { consumeRateLimit: jest.fn().mockResolvedValue(true) };
  const service = new EngagementService(
    { execute } as unknown as EngagementRepository,
    {} as SupportStorage,
    security as unknown as SecurityRepository,
  );
  const principal = { userId: 'owner-1', sessionId: 'session-1', factorAgeSeconds: 30 };
  const result = await service.execute(principal, {
    operation: 'setNotificationRead',
    params: { notificationId: '10000000-0000-4000-8000-000000000001' },
    body: { read: true, expectedVersion: 1 },
    idempotencyKey: 'notification-read-key',
    requestId: 'request-1',
  });
  expect(result).toEqual({
    id: '10000000-0000-4000-8000-000000000001',
    readAt: '2026-09-05T08:00:00Z',
    version: 2,
  });
  expect(security.consumeRateLimit).toHaveBeenCalledWith(
    principal,
    'engagement.write',
    60,
    60,
    null,
  );
  expect(execute).toHaveBeenNthCalledWith(
    2,
    principal,
    expect.objectContaining({
      operation: 'getNotification',
      params: { notificationId: '10000000-0000-4000-8000-000000000001' },
    }),
  );
});

test('preference replacement returns the authoritative camel-case matrix', async () => {
  const items = [...ENGAGEMENT_SOURCE_EVENTS].flatMap((eventType) =>
    (['in_app', 'push', 'email'] as const).map((channel) => ({
      channel,
      eventType,
      enabled: true,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00',
        weekdays: [],
        timeZone: 'Asia/Riyadh',
      },
    })),
  );
  const matrix = { items: items.map((item) => ({ ...item, version: 2 })), version: 2 };
  const execute = jest
    .fn()
    .mockResolvedValueOnce({ items: [], version: 2, requestId: 'request-2' })
    .mockResolvedValueOnce(matrix);
  const service = new EngagementService(
    { execute } as unknown as EngagementRepository,
    {} as SupportStorage,
    { consumeRateLimit: jest.fn().mockResolvedValue(true) } as unknown as SecurityRepository,
  );
  const principal = { userId: 'owner-1', sessionId: 'session-1', factorAgeSeconds: 30 };
  await expect(
    service.execute(principal, {
      operation: 'replaceNotificationPreferences',
      body: { items, version: 1, expectedVersion: 1 },
      idempotencyKey: 'preferences-replace-key',
      requestId: 'request-2',
    }),
  ).resolves.toEqual(matrix);
  expect(execute).toHaveBeenNthCalledWith(
    2,
    principal,
    expect.objectContaining({ operation: 'getNotificationPreferences' }),
  );
});

test('translates preference fields only at the legacy database function boundary', async () => {
  let databaseBody: unknown;
  const client = {
    query: jest.fn((sql: string, values?: unknown[]) => {
      if (sql.includes('claim_idempotency_key'))
        return Promise.resolve({ rows: [{ outcome: 'new' }] });
      if (sql.includes('execute_engagement_command')) {
        databaseBody = JSON.parse(String(values?.[3]));
        return Promise.resolve({ rows: [{ value: { items: [], version: 2 } }] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  const repository = new EngagementRepository(
    {
      withClient: (action: (value: typeof client) => Promise<unknown>) => action(client),
    } as unknown as PoolService,
    { getRequired: jest.fn().mockReturnValue(10) } as unknown as PlatformConfigService,
  );
  await repository.execute(
    { userId: 'owner-1', sessionId: 'session-1', factorAgeSeconds: 30 },
    {
      operation: 'replaceNotificationPreferences',
      body: {
        items: [
          {
            channel: 'push',
            eventType: 'transaction.created',
            enabled: true,
            quietHours: { enabled: false },
          },
        ],
        version: 1,
        expectedVersion: 1,
      },
      params: {},
      idempotencyKey: 'preferences-replace-key',
      requestId: 'request-2',
    },
  );
  expect(databaseBody).toEqual({
    items: [
      {
        channel: 'push',
        event_type: 'transaction.created',
        enabled: true,
        quiet_hours: { enabled: false },
      },
    ],
    version: 1,
    expectedVersion: 1,
  });
});
