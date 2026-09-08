import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('Admin self-context contract', () => {
  it('exposes a least-privilege, redacted self projection', () => {
    const contract = load(
      readFileSync(
        resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'),
        'utf8',
      ),
    ) as {
      paths: Record<string, Record<string, Record<string, unknown>>>;
      components: {
        schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
      };
    };
    const operation = contract.paths['/api/v1/admin/access/me']?.get;

    expect(operation).toMatchObject({ operationId: 'getAdminSelf' });
    expect(operation).toHaveProperty('x-permission', 'admin.overview.read');
    expect(operation).toHaveProperty('responses.200', {
      description: 'Authoritative redacted context for the current active Admin.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/AdminSelfContext' } },
      },
    });
    expect(operation).toHaveProperty('responses.401');
    expect(operation).toHaveProperty('responses.403');

    const schema = contract.components.schemas.AdminSelfContext;
    expect(schema?.required).toEqual([
      'id',
      'displayName',
      'roleKeys',
      'effectivePermissionKeys',
      'mfaStatus',
      'activeSessionCount',
      'version',
    ]);
    expect(Object.keys(schema?.properties ?? {})).not.toEqual(
      expect.arrayContaining([
        'email',
        'emailMasked',
        'department',
        'assignments',
        'eligibleActions',
      ]),
    );
  });
});
