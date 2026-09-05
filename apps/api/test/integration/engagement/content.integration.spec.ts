import { EngagementService } from '../../../src/engagement/engagement.service';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { SecurityRepository } from '../../../src/security/security.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';

test('published content reads coalesce while publish and retire invalidate the bounded cache', async () => {
  const execute = jest.fn().mockResolvedValue({ items: [{ key: 'help.security', locale: 'en' }] });
  const service = new EngagementService(
    { execute } as unknown as EngagementRepository,
    {} as SupportStorage,
    { consumeRateLimit: jest.fn().mockResolvedValue(true) } as unknown as SecurityRepository,
  );
  const principal = {
    userId: 'owner-1',
    sessionId: 'session-1',
    factorAgeSeconds: 30,
    mfaAgeSeconds: 30,
  };
  const read = {
    operation: 'listPublishedContent',
    query: { locale: 'en', type: 'article' },
    requestId: 'request-1',
  };
  await Promise.all([service.execute(principal, read), service.execute(principal, read)]);
  expect(execute).toHaveBeenCalledTimes(1);
  await service.execute(principal, {
    operation: 'adminActOnContent',
    params: { contentId: '10000000-0000-4000-8000-000000000001' },
    body: { action: 'publish', expectedVersion: 1, reason: 'Approved bilingual content' },
    idempotencyKey: 'content-publish-key',
    requestId: 'request-2',
  });
  await service.execute(principal, read);
  expect(execute).toHaveBeenCalledTimes(3);
});
