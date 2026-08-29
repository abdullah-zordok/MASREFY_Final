import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Admin production authority boundary', () => {
  const sources = [
    'src/security/admin-auth.guard.ts',
    'src/security/security.controller.ts',
    'src/security/security.service.ts',
    'src/security/security.repository.ts',
  ]
    .map((path) => readFileSync(resolve(__dirname, '../../../', path), 'utf8'))
    .join('\n');

  it.each(['x-admin-role', 'x-role', 'sessionStorage', '__scenario', 'mockConfirmationToken'])(
    'does not trust %s',
    (assertion) => {
      expect(sources).not.toContain(`get('${assertion}')`);
      expect(sources).not.toContain(`header('${assertion}')`);
    },
  );

  it('uses the exact database assertion and no shared permission cache', () => {
    expect(sources).toContain('private.assert_admin_permission');
    expect(sources).not.toMatch(/redis|permissionCache|globalPermission/i);
  });
});
