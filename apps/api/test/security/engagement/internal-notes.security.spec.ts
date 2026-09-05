import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('customer detail and privacy export projections never select internal notes', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../src/engagement/engagement.repository.ts'),
    'utf8',
  );
  const customerDetail = source.slice(
    source.indexOf("case 'getSupportTicket':"),
    source.indexOf("case 'downloadSupportAttachment':"),
  );
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../../supabase/migrations/20260905070618_phase11_functions_access.sql',
    ),
    'utf8',
  );
  const exportFunction = migration.slice(
    migration.indexOf('create function private.export_engagement_batch'),
    migration.indexOf('create function private.delete_engagement_batch'),
  );
  expect(customerDetail).toContain('const notes = admin');
  expect(customerDetail).toContain('...(notes ? { internalNotes: notes } : {})');
  expect(exportFunction).not.toMatch(/support_internal_notes|internalNotes/i);
});
