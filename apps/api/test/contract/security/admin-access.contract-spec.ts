import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('admin access contract', () => {
  it('defines every governance route with redacted response schemas', () => {
    const contract = load(readFileSync(resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'), 'utf8')) as {
      paths: Record<string, unknown>; components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    for (const path of [
      '/api/v1/admin/access/admins', '/api/v1/admin/access/invitations',
      '/api/v1/admin/access/roles', '/api/v1/admin/access/permissions',
    ]) expect(contract.paths).toHaveProperty(path);
    for (const name of ['AdminSummary', 'AdminDetail', 'Invitation', 'SessionRevokeResult']) {
      expect(Object.keys(contract.components.schemas[name]?.properties ?? {})).not.toEqual(
        expect.arrayContaining(['email', 'token', 'tokenHash', 'clerkSessionId']),
      );
    }
  });
});
