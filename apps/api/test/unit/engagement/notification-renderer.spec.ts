import {
  renderNotification,
  selectTemplate,
  type NotificationTemplate,
} from '../../../src/engagement/notification.renderer';

const templates: NotificationTemplate[] = [
  {
    key: 'transaction.created',
    locale: 'en',
    channel: 'push',
    version: 1,
    title: 'Activity recorded',
    body: 'Open {{routeLabel}}',
    allowedVariables: ['routeLabel'],
  },
  {
    key: 'transaction.created',
    locale: 'ar',
    channel: 'push',
    version: 1,
    title: 'تم تسجيل النشاط',
    body: 'افتح {{routeLabel}}',
    allowedVariables: ['routeLabel'],
  },
];
const template = templates[0];
if (!template) throw new Error('FIXTURE_MISSING');

describe('notification renderer', () => {
  it('selects the requested published locale and deterministic Arabic then English fallback', () => {
    expect(selectTemplate(templates, 'transaction.created', 'en', 'push').locale).toBe('en');
    expect(
      selectTemplate(
        templates.filter((item) => item.locale === 'ar'),
        'transaction.created',
        'en',
        'push',
      ).locale,
    ).toBe('ar');
  });

  it('rejects unknown, missing, object, and sensitive variables', () => {
    expect(() => renderNotification(template, {})).toThrow('NOTIFICATION_VARIABLE_MISSING');
    expect(() => renderNotification(template, { routeLabel: 'details', extra: 'x' })).toThrow(
      'NOTIFICATION_VARIABLE_UNKNOWN',
    );
    expect(() => renderNotification(template, { routeLabel: { unsafe: true } })).toThrow(
      'NOTIFICATION_VARIABLE_INVALID',
    );
    expect(() =>
      renderNotification(
        { ...template, body: '{{amount}}', allowedVariables: ['amount'] },
        { amount: 100 },
      ),
    ).toThrow('NOTIFICATION_TEMPLATE_SENSITIVE');
  });

  it('escapes channel text and rejects header injection and output overflow', () => {
    expect(renderNotification(template, { routeLabel: '<script>&' })).toEqual({
      title: 'Activity recorded',
      body: 'Open &lt;script&gt;&amp;',
    });
    expect(() =>
      renderNotification(
        { ...template, channel: 'email', subject: 'Safe\r\nBcc: victim@example.test' },
        { routeLabel: 'x' },
      ),
    ).toThrow('NOTIFICATION_HEADER_INVALID');
    expect(() =>
      renderNotification({ ...template, body: 'x'.repeat(241), allowedVariables: [] }, {}),
    ).toThrow('NOTIFICATION_OUTPUT_TOO_LARGE');
  });
});
