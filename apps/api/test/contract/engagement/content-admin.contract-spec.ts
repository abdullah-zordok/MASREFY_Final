import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';
import { ENGAGEMENT_ADMIN_ROUTES } from '../../../src/engagement/engagement.routes';

describe('Admin content contract', () => {
  it('publishes list, detail, create, and guarded lifecycle routes', () => {
    expect(
      ENGAGEMENT_ADMIN_ROUTES.filter((route) => route.path.startsWith('admin/content')).map(
        (route) => route.operation,
      ),
    ).toEqual(['adminListContent', 'adminGetContent', 'adminCreateContent', 'adminActOnContent']);
    expect(
      ENGAGEMENT_ADMIN_ROUTES.filter(
        (route) => route.operation.includes('Content') && route.method !== 'GET',
      ).every((route) => route.recentMfa && route.idempotent),
    ).toBe(true);
  });

  it('accepts complete bilingual content and rejects duplicate locales', () => {
    const translations = [
      { locale: 'ar', title: 'مساعدة', body: 'محتوى عربي' },
      { locale: 'en', title: 'Help', body: 'English content' },
    ];
    const command = {
      operation: 'adminCreateContent',
      body: { key: 'help.security', type: 'article', translations },
      requestId: 'request-1',
      idempotencyKey: 'content-create-key',
    };
    expect(() => validateEngagementCommand(command)).not.toThrow();
    expect(() =>
      validateEngagementCommand({
        ...command,
        body: { ...command.body, translations: [translations[1], translations[1]] },
      }),
    ).toThrow();
  });
});
