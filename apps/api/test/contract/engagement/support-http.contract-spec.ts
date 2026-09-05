import { ENGAGEMENT_CUSTOMER_ROUTES } from '../../../src/engagement/engagement.routes';

describe('support and customer engagement HTTP contract', () => {
  it('registers support, attachment, feedback, abuse, and published-content operations', () => {
    const operations = ENGAGEMENT_CUSTOMER_ROUTES.map((route) => route.operation);
    expect(operations).toEqual(
      expect.arrayContaining([
        'listSupportCategories',
        'listSupportTickets',
        'createSupportTicket',
        'getSupportTicket',
        'addSupportMessage',
        'closeSupportTicket',
        'reopenSupportTicket',
        'initializeSupportAttachment',
        'finalizeSupportAttachment',
        'downloadSupportAttachment',
        'listFeedback',
        'createFeedback',
        'getFeedback',
        'listOwnAbuseReports',
        'createAbuseReport',
        'listPublishedContent',
        'getPublishedContent',
      ]),
    );
    expect(ENGAGEMENT_CUSTOMER_ROUTES).toHaveLength(23);
  });

  it('requires idempotency on every customer mutation', () => {
    expect(
      ENGAGEMENT_CUSTOMER_ROUTES.filter((route) => route.method !== 'GET').every(
        (route) => route.idempotent,
      ),
    ).toBe(true);
  });
});
