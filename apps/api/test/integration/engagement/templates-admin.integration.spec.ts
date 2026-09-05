import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEngagementCommand } from '../../../src/engagement/engagement.dto';

test('template lifecycle is versioned, immutable after publication, and limited to registered events', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../../supabase/migrations/20260905070618_phase11_functions_access.sql',
    ),
    'utf8',
  );
  expect(migration).toContain("(action_name='test' and status='draft')");
  expect(migration).toContain("(action_name='publish' and status='testing')");
  expect(migration).toContain("(action_name='retire' and status='published')");
  expect(migration).toContain('NOTIFICATION_TEMPLATE_IMMUTABLE');
  expect(() =>
    validateEngagementCommand({
      operation: 'adminCreateNotificationTemplate',
      body: {
        key: 'billing.future_event',
        locale: 'en',
        channel: 'push',
        body: 'Unsafe future event',
        variables: [],
      },
      idempotencyKey: 'template-create-key',
      requestId: 'request-1',
    }),
  ).toThrow();
});
