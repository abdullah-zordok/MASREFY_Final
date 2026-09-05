import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';

test('feedback and abuse boundaries reject actor, lifecycle, and unsupported target fields', () => {
  const base = { requestId: 'request-1', idempotencyKey: 'feedback-abuse-key' };
  expect(() =>
    validateEngagementCommand({
      ...base,
      operation: 'createFeedback',
      body: { type: 'idea', body: 'Useful feedback', assignedAdminId: 'admin-1' },
    }),
  ).toThrow();
  expect(() =>
    validateEngagementCommand({
      ...base,
      operation: 'createAbuseReport',
      body: {
        resourceType: 'content',
        resourceId: 'safe-reference',
        reason: 'Unsafe content response',
        reporterId: 'other',
      },
    }),
  ).toThrow();
});
