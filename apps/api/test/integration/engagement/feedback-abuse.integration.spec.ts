import { EngagementService } from '../../../src/engagement/engagement.service';
import type { EngagementRepository } from '../../../src/engagement/engagement.repository';
import type { SecurityRepository } from '../../../src/security/security.repository';
import type { SupportStorage } from '../../../src/engagement/support.storage';

test('feedback creation returns its owner-safe record while abuse responses stay reporter-safe', async () => {
  const execute = jest
    .fn()
    .mockResolvedValueOnce({ resourceId: '10000000-0000-4000-8000-000000000001' })
    .mockResolvedValueOnce({
      id: '10000000-0000-4000-8000-000000000001',
      type: 'idea',
      body: 'Useful feedback',
      status: 'new',
      version: 1,
    });
  const service = new EngagementService(
    { execute } as unknown as EngagementRepository,
    {} as SupportStorage,
    { consumeRateLimit: jest.fn().mockResolvedValue(true) } as unknown as SecurityRepository,
  );
  const principal = { userId: 'owner-1', sessionId: 'session-1', factorAgeSeconds: 30 };
  const result = await service.execute(principal, {
    operation: 'createFeedback',
    body: { type: 'idea', body: 'Useful feedback' },
    idempotencyKey: 'feedback-create-key',
    requestId: 'request-1',
  });
  expect(result).toEqual(expect.objectContaining({ status: 'new', version: 1 }));
  expect(execute).toHaveBeenNthCalledWith(
    2,
    principal,
    expect.objectContaining({ operation: 'getFeedback' }),
  );
});
