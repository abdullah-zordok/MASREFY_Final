import { EngagementService } from '../../../src/engagement/engagement.service';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
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
