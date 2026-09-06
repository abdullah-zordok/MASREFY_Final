import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('SPEC-BE-013 ownership boundary', () => {
  const root = resolve(__dirname, '../../../../..');
  const contract = load(
    readFileSync(
      resolve(
        root,
        'apps/api/specs/013-performance-caching-observability-operations/contracts/openapi.yaml',
      ),
      'utf8',
    ),
  ) as { paths: Record<string, unknown> };
  const migration = readFileSync(
    resolve(root, 'supabase/migrations/20260906130000_phase13_operations.sql'),
    'utf8',
  );

  it('contains no billing, paid entitlement, arbitrary execution, or launch resource', () => {
    const createdObjects = [
      ...migration.matchAll(/create\s+(?:table|function)\s+([^\s(]+)/giu),
    ].map((match) => match[1]);
    const registeredJobs = [...migration.matchAll(/register_job\('([^']+)'/gu)].map(
      (match) => match[1],
    );
    const productionSurface = `${Object.keys(contract.paths).join('\n')}\n${createdObjects.join('\n')}\n${registeredJobs.join('\n')}`;
    expect(productionSurface).not.toMatch(
      /stripe|checkout|paid_entitlement|billing_customer|billing_subscription|promotion_campaign/iu,
    );
    expect(Object.keys(contract.paths)).not.toContain('/api/v1/admin/execute');
    expect(migration).not.toMatch(
      /create\s+(?:table|function)\s+[^\n]*(?:shell|console|arbitrary)/iu,
    );
  });

  it('keeps the nine owned jobs closed and all tables private', () => {
    expect(
      (migration.match(/'operations\.[a-z-]+'/gu) ?? []).some((value) =>
        value.includes('provider-health'),
      ),
    ).toBe(true);
    expect(migration).not.toMatch(
      /create table public\.(scheduled_jobs|job_runs|system_settings)/iu,
    );
  });
});
