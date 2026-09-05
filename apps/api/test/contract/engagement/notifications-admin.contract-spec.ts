import { ENGAGEMENT_ADMIN_ROUTES } from '../../../src/engagement/engagement.routes';

describe('Admin engagement HTTP contract', () => {
  it('registers all 26 Admin operations with an exact permission', () => {
    expect(ENGAGEMENT_ADMIN_ROUTES).toHaveLength(26);
    expect(ENGAGEMENT_ADMIN_ROUTES.every((route) => route.permission.includes('.'))).toBe(true);
    expect(ENGAGEMENT_ADMIN_ROUTES.map((route) => route.operation)).toEqual(
      expect.arrayContaining([
        'adminCreateNotificationTemplate',
        'adminPreviewNotificationAudience',
        'adminActOnNotificationCampaign',
        'adminRetryNotificationDelivery',
        'adminActOnSupportTicket',
        'adminAddSupportInternalNote',
        'adminGetFeedback',
        'adminActOnFeedback',
        'adminActOnAbuseReport',
        'adminGetContent',
        'adminActOnContent',
      ]),
    );
  });

  it('requires recent MFA for every privileged mutation', () => {
    expect(
      ENGAGEMENT_ADMIN_ROUTES.filter((route) => route.method !== 'GET').every(
        (route) => route.recentMfa && route.idempotent,
      ),
    ).toBe(true);
  });
});
