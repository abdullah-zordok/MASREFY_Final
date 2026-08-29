import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

import { SECURITY_ROUTES } from '../../../src/security/security.controller';
import { PERMISSION_KEYS } from '../../../src/security/permission-manifest';

describe('Phase 03 route authorization contract', () => {
  it('registers all 45 operations with the exact OpenAPI permission and status', () => {
    const contract = load(
      readFileSync(
        resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'),
        'utf8',
      ),
    ) as {
      paths: Record<
        string,
        Record<
          string,
          { operationId: string; 'x-permission'?: string; responses: Record<string, unknown> }
        >
      >;
    };
    const expected = Object.entries(contract.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ['get', 'post', 'patch', 'delete'].includes(method))
        .map(([method, operation]) => ({
          method: method.toUpperCase(),
          path: path.slice(1).replaceAll(/{([^}]+)}/g, ':$1'),
          operation: operation.operationId,
          status: Number(Object.keys(operation.responses).find((status) => status.startsWith('2'))),
          permission: operation['x-permission'],
        })),
    );
    expect(SECURITY_ROUTES).toHaveLength(45);
    expect(
      SECURITY_ROUTES.map(({ method, path, operation, status, permission }) => ({
        method,
        path,
        operation,
        status,
        permission,
      })),
    ).toEqual(expected);
    expect(new Set(SECURITY_ROUTES.map(({ operation }) => operation)).size).toBe(45);
  });

  it('never registers wildcard or client-derived permissions', () => {
    const known = new Set<string>(PERMISSION_KEYS);
    expect(
      SECURITY_ROUTES.every(
        ({ permission }) => !permission || (known.has(permission) && !permission.includes('*')),
      ),
    ).toBe(true);
  });
});
