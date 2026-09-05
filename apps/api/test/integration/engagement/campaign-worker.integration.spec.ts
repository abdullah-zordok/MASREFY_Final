import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('campaign expansion is keyset-bounded, replay-safe, and reconciles completion', () => {
  const repository = readFileSync(
    resolve(__dirname, '../../../src/engagement/engagement.repository.ts'),
    'utf8',
  );
  const expansion = repository.slice(
    repository.indexOf('async expandCampaigns'),
    repository.indexOf('private async read('),
  );
  expect(expansion).toMatch(/limit \$3/);
  expect(expansion).toContain('not exists(select 1 from private.notification_deliveries');
  expect(expansion).toContain('p.id>coalesce((select max(existing.user_id)');
  expect(expansion).toContain('on conflict do nothing');
  expect(expansion).toMatch(/status='completed'/);
  expect(expansion).toMatch(/status in \('scheduled','running'\)/);
});
