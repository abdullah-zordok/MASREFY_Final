import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';

test('support writes reject ownership, sender, status, assignee, and priority injection', () => {
  const base = {
    operation: 'addSupportMessage',
    params: { ticketId: '10000000-0000-4000-8000-000000000001' },
    requestId: 'request-1',
    idempotencyKey: 'support-message-key',
  };
  for (const injected of [
    { userId: 'other' },
    { senderType: 'admin' },
    { status: 'closed' },
    { assigneeId: 'admin' },
    { priority: 'urgent' },
  ])
    expect(() =>
      validateEngagementCommand({
        ...base,
        body: { body: 'A safe customer message', expectedVersion: 1, ...injected },
      }),
    ).toThrow('ENGAGEMENT_INPUT_INVALID');
});
