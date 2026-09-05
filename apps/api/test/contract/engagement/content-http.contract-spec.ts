import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';
import { ENGAGEMENT_CUSTOMER_ROUTES } from '../../../src/engagement/engagement.routes';

describe('published content HTTP contract', () => {
  it('exposes only list and key detail customer reads', () => {
    expect(
      ENGAGEMENT_CUSTOMER_ROUTES.filter((route) => route.path.startsWith('content')).map(
        (route) => [route.method, route.operation],
      ),
    ).toEqual([
      ['GET', 'listPublishedContent'],
      ['GET', 'getPublishedContent'],
    ]);
  });

  it('requires an explicit supported locale and bounded content type', () => {
    expect(() =>
      validateEngagementCommand({
        operation: 'listPublishedContent',
        query: { locale: 'ar', type: 'faq', limit: 100 },
        requestId: 'request-1',
      }),
    ).not.toThrow();
    expect(() =>
      validateEngagementCommand({
        operation: 'listPublishedContent',
        query: { locale: 'fr' },
        requestId: 'request-1',
      }),
    ).toThrow();
    expect(() =>
      validateEngagementCommand({
        operation: 'listPublishedContent',
        query: { locale: 'en', type: 'invoice' },
        requestId: 'request-1',
      }),
    ).toThrow();
  });
});
