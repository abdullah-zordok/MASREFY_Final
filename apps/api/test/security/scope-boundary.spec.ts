import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function scopeViolations(paths: string[], source: string): string[] {
  const clientChanges = paths.filter(
    (path) => path.startsWith('apps/mobile/') || path.startsWith('apps/admin-web/'),
  );
  const edgeFunctions = paths.filter((path) => path.startsWith('supabase/functions/'));
  const forbiddenTechnology = /\b(redis|bullmq|prisma)\b/i.test(source)
    ? ['forbidden-technology']
    : [];
  const forbiddenIdentityOwnership = /\b(?:auth\.users|supabase auth users|create table\s+(?:public\.)?(?:sessions?|idempotency\w*|audit\w*|roles?|permissions?))\b/i.test(
    source,
  )
    ? ['forbidden-identity-ownership']
    : [];
  return [...clientChanges, ...edgeFunctions, ...forbiddenTechnology, ...forbiddenIdentityOwnership];
}

describe('SPEC-BE-001 scope boundary', () => {
  const root = resolve(__dirname, '../../../..');

  it('leaves clients untouched and excludes forbidden technology', () => {
    const paths = (process.env.MASARIFI_CHANGED_PATHS ?? '').split(/\r?\n/).filter(Boolean);
    const source = [
      'apps/api/package.json',
      'apps/api/src/app.module.ts',
      'apps/api/src/worker.module.ts',
      'docker/local/compose.backend.yml',
      'docker/test/compose.backend.yml',
    ]
      .map((path) => readFileSync(resolve(root, path), 'utf8'))
      .join('\n');

    expect(scopeViolations(paths, source)).toEqual([]);
  });

  it('rejects client edits, Edge Functions, and forbidden dependencies', () => {
    expect(
      scopeViolations(
        ['apps/mobile/source.ts', 'apps/admin-web/page.tsx', 'supabase/functions/new/index.ts'],
        'dependencies: redis bullmq prisma',
      ),
    ).toEqual([
      'apps/mobile/source.ts',
      'apps/admin-web/page.tsx',
      'supabase/functions/new/index.ts',
      'forbidden-technology',
    ]);
    expect(scopeViolations(['.agents/plugins/example/plugin.json'], '')).toEqual([]);
  });

  it('rejects session, Supabase Auth, idempotency, audit, and authorization ownership', () => {
    for (const source of [
      'create table public.sessions (id uuid)',
      'create table idempotency_keys (id uuid)',
      'create table audit_events (id uuid)',
      'create table roles (id uuid)',
      'select * from auth.users',
      'Supabase Auth users',
    ]) {
      expect(scopeViolations([], source)).toContain('forbidden-identity-ownership');
    }
  });
});
