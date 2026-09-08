import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SECURITY_ROUTES } from '../../src/security/security.controller';

describe('Admin self-context authorization', () => {
  it('registers self-context with the shared least-privilege shell permission', () => {
    expect(SECURITY_ROUTES).toContainEqual({
      method: 'GET',
      path: 'api/v1/admin/access/me',
      operation: 'getAdminSelf',
      status: 200,
      permission: 'admin.overview.read',
    });
  });

  it('requires the caller to have an active Admin profile and active enabled role', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../../supabase/migrations/20260908080000_admin_self_projection.sql',
      ),
      'utf8',
    );

    expect(migration).toContain("private.admin_has_permission(subject_id, 'admin.overview.read'");
    expect(migration).toContain("profile.status = 'active'");
    expect(migration).toContain("admin.status = 'active'");
    expect(migration).toContain('assignment.revoked_at is null');
    expect(migration).toContain('assignment.starts_at <= evaluated_at');
    expect(migration).toContain('assignment.ends_at is null');
    expect(migration).toContain('role.enabled');
    expect(migration).toContain("errcode = '42501'");
    expect(migration).toMatch(/reset role;\s*revoke masarifi_migration from current_user;/i);
  });
});
