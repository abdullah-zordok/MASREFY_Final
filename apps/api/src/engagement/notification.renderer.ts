export type NotificationChannel = 'in_app' | 'push' | 'email';

export interface NotificationTemplate {
  key: string;
  locale: 'ar' | 'en';
  channel: NotificationChannel;
  version: number;
  title: string;
  subject?: string;
  body: string;
  allowedVariables: readonly string[];
}

const placeholder = /{{([a-z][a-zA-Z0-9]{0,63})}}/g;
const sensitive =
  /amount|balance|account|merchant|transaction|token|email|phone|note|message|filename|provider/i;
const unsafeLockScreen =
  /amount|balance|account|merchant|token|email|phone|مبلغ|رصيد|حساب|تاجر|رمز|بريد|هاتف/i;

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function selectTemplate(
  templates: readonly NotificationTemplate[],
  key: string,
  locale: string,
  channel: NotificationChannel,
): NotificationTemplate {
  const candidates = templates.filter((item) => item.key === key && item.channel === channel);
  for (const wanted of [locale, 'ar', 'en']) {
    const selected = candidates
      .filter((item) => item.locale === wanted)
      .sort((a, b) => b.version - a.version)[0];
    if (selected) return selected;
  }
  throw new Error('NOTIFICATION_TEMPLATE_UNAVAILABLE');
}

export function renderNotification(
  template: NotificationTemplate,
  variables: Readonly<Record<string, unknown>>,
): { title: string; body: string; subject?: string } {
  const referenced = new Set(
    [
      ...template.title.matchAll(placeholder),
      ...template.body.matchAll(placeholder),
      ...(template.subject ?? '').matchAll(placeholder),
    ].flatMap((match) => (match[1] ? [match[1]] : [])),
  );
  if ([...referenced, ...template.allowedVariables].some((name) => sensitive.test(name)))
    throw new Error('NOTIFICATION_TEMPLATE_SENSITIVE');
  if (Object.keys(variables).some((name) => !template.allowedVariables.includes(name)))
    throw new Error('NOTIFICATION_VARIABLE_UNKNOWN');
  if (
    [...referenced].some(
      (name) => !template.allowedVariables.includes(name) || !(name in variables),
    )
  )
    throw new Error('NOTIFICATION_VARIABLE_MISSING');
  const scalar: Record<string, string> = {};
  for (const name of template.allowedVariables) {
    const value = variables[name];
    if (!['string', 'number', 'boolean'].includes(typeof value) || String(value).length > 160)
      throw new Error('NOTIFICATION_VARIABLE_INVALID');
    scalar[name] = escapeText(String(value));
  }
  const render = (value: string) =>
    value.replace(placeholder, (_all, name: string) => scalar[name] ?? '');
  const title = render(template.title);
  const body = render(template.body);
  const subject = template.subject === undefined ? undefined : render(template.subject);
  if (subject !== undefined && /[\r\n]/.test(subject))
    throw new Error('NOTIFICATION_HEADER_INVALID');
  if (
    title.length < 1 ||
    title.length > 120 ||
    body.length < 1 ||
    body.length > (template.channel === 'email' ? 4096 : 240) ||
    (subject?.length ?? 0) > 120
  )
    throw new Error('NOTIFICATION_OUTPUT_TOO_LARGE');
  if (template.channel !== 'email' && unsafeLockScreen.test(`${title} ${body}`))
    throw new Error('NOTIFICATION_LOCK_SCREEN_UNSAFE');
  return subject === undefined ? { title, body } : { title, body, subject };
}
