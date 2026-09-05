import { ENGAGEMENT_ADMIN_ROUTES } from '../../../src/engagement/engagement.routes';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Admin support mutations each require an exact permission, recent MFA, and idempotency', () => {
  const routes = ENGAGEMENT_ADMIN_ROUTES.filter(
    (route) => route.path.startsWith('admin/support') && route.method !== 'GET',
  );
  expect(routes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: 'adminActOnSupportTicket',
        permission: 'support.tickets.manage',
      }),
      expect.objectContaining({
        operation: 'adminAddSupportInternalNote',
        permission: 'support.tickets.notes',
      }),
      expect.objectContaining({
        operation: 'adminCreateSupportCategory',
        permission: 'support.categories.manage',
      }),
      expect.objectContaining({
        operation: 'adminActOnSupportCategory',
        permission: 'support.categories.manage',
      }),
    ]),
  );
  expect(routes.every((route) => route.recentMfa && route.idempotent)).toBe(true);
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../../supabase/migrations/20260905070618_phase11_functions_access.sql',
    ),
    'utf8',
  );
  for (const permission of [
    'support.tickets.assign',
    'support.tickets.priority',
    'support.tickets.reply',
    'support.tickets.resolve',
    'support.tickets.notes',
  ])
    expect(migration).toContain(`'${permission}'`);
});
