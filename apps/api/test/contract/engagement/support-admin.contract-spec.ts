import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';
import { ENGAGEMENT_ADMIN_ROUTES } from '../../../src/engagement/engagement.routes';

const base = { requestId: 'contract-request', idempotencyKey: 'support-admin-key' };

describe('Admin support contract', () => {
  it('publishes category, ticket, action, and isolated note operations', () => {
    expect(
      ENGAGEMENT_ADMIN_ROUTES.filter((route) => route.path.startsWith('admin/support')).map(
        (route) => route.operation,
      ),
    ).toEqual([
      'adminListSupportTickets',
      'adminGetSupportTicket',
      'adminActOnSupportTicket',
      'adminAddSupportInternalNote',
      'adminListSupportCategories',
      'adminCreateSupportCategory',
      'adminActOnSupportCategory',
    ]);
  });

  it('requires versioned, reasoned actions and rejects injected status', () => {
    expect(() =>
      validateEngagementCommand({
        ...base,
        operation: 'adminActOnSupportTicket',
        params: { ticketId: '10000000-0000-4000-8000-000000000001' },
        body: { action: 'resolve', expectedVersion: 2, reason: 'Customer issue resolved' },
      }),
    ).not.toThrow();
    expect(() =>
      validateEngagementCommand({
        ...base,
        operation: 'adminActOnSupportTicket',
        params: { ticketId: '10000000-0000-4000-8000-000000000001' },
        body: {
          action: 'resolve',
          expectedVersion: 2,
          reason: 'Customer issue resolved',
          status: 'closed',
        },
      }),
    ).toThrow('ENGAGEMENT_INPUT_INVALID');
    expect(() =>
      validateEngagementCommand({
        ...base,
        operation: 'adminActOnSupportCategory',
        params: { categoryId: '10000000-0000-4000-8000-000000000001' },
        body: {
          action: 'retire',
          expectedVersion: 2,
          reason: 'Replaced by active category',
          replacementCategoryId: '20000000-0000-4000-8000-000000000002',
        },
      }),
    ).not.toThrow();
  });
});
