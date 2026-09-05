import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';
import {
  ENGAGEMENT_ADMIN_ROUTES,
  ENGAGEMENT_CUSTOMER_ROUTES,
} from '../../../src/engagement/engagement.routes';

describe('feedback and abuse contract', () => {
  it('keeps customer submission and owner-list routes separate from Admin actions', () => {
    expect(
      ENGAGEMENT_CUSTOMER_ROUTES.filter(
        (route) => route.path.startsWith('feedback') || route.path.startsWith('abuse'),
      ).map((route) => route.operation),
    ).toEqual([
      'listFeedback',
      'createFeedback',
      'getFeedback',
      'listOwnAbuseReports',
      'createAbuseReport',
    ]);
    expect(
      ENGAGEMENT_ADMIN_ROUTES.filter(
        (route) => route.path.includes('feedback') || route.path.includes('abuse'),
      ).map((route) => route.operation),
    ).toEqual([
      'adminListFeedback',
      'adminGetFeedback',
      'adminActOnFeedback',
      'adminListAbuseReports',
      'adminActOnAbuseReport',
    ]);
  });

  it('rejects client-controlled feedback state and unsupported abuse resource types', () => {
    const command = { requestId: 'request-1', idempotencyKey: 'feedback-key-1' };
    expect(() =>
      validateEngagementCommand({
        ...command,
        operation: 'createFeedback',
        body: { type: 'bug', body: 'Useful feedback', state: 'resolved' },
      }),
    ).toThrow();
    expect(() =>
      validateEngagementCommand({
        ...command,
        operation: 'createAbuseReport',
        body: {
          resourceType: 'database',
          resourceId: 'safe-reference',
          reason: 'Unsafe generated result',
        },
      }),
    ).toThrow();
  });
});
