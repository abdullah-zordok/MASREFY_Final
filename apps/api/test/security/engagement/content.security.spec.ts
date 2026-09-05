import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';

test('customer content reads are published-only and Admin text rejects control characters', () => {
  const repository = readFileSync(
    resolve(__dirname, '../../../src/engagement/engagement.repository.ts'),
    'utf8',
  );
  const contentRead = repository.slice(
    repository.indexOf("case 'listPublishedContent':"),
    repository.indexOf("case 'adminListNotificationTemplates':"),
  );
  expect(contentRead).toContain("where c.status='published'");
  expect(contentRead).not.toMatch(/status\s+in\s*\([^)]*draft/i);
  expect(() =>
    validateEngagementCommand({
      operation: 'adminCreateContent',
      body: {
        key: 'unsafe.content',
        type: 'article',
        translations: [{ locale: 'en', title: 'Unsafe', body: 'bad\u0000text' }],
      },
      requestId: 'request-1',
      idempotencyKey: 'content-security-key',
    }),
  ).toThrow();
});
