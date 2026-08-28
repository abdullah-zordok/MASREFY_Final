import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('Admin identity boundary', () => {
  const root = resolve(__dirname, '../../../../..');
  const identitySource = [
    'apps/api/src/identity/identity.controller.ts',
    'apps/api/src/identity/clerk-webhook.controller.ts',
    'apps/api/src/identity/identity.service.ts',
  ].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');
  const contract = load(readFileSync(resolve(
    root, 'apps/api/specs/002-auth-profiles-preferences-sessions/contracts/openapi.yaml',
  ), 'utf8')) as { paths: Record<string, unknown> };

  it('defines no Admin identity/device/session/status/force-logout route', () => {
    expect(Object.keys(contract.paths)).not.toEqual(expect.arrayContaining([
      '/api/v1/admin/users', '/api/v1/admin/devices', '/api/v1/admin/sessions',
    ]));
    expect(identitySource).not.toMatch(/Controller\(['"]api\/v1\/admin|force.?logout|admin.?role/i);
  });

  it('does not authorize from role headers or metadata', () => {
    expect(identitySource).not.toMatch(/x-admin-role|x-user-role|publicMetadata|privateMetadata|unsafeMetadata/i);
  });
});
