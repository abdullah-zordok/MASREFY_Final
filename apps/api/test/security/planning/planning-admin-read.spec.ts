import { readFileSync } from 'node:fs';

import {
  PERMISSION_KEYS,
  SYSTEM_ROLE_PERMISSIONS,
} from '../../../src/security/permission-manifest';

describe('planning Admin read boundary', () => {
  const controller = readFileSync('src/planning/planning.controller.ts', 'utf8');
  const access = readFileSync(
    '../../supabase/migrations/20260831120200_phase07_planning_access.sql',
    'utf8',
  );

  it('uses the exact planning.read permission and grants it only to super-admin by default', () => {
    expect(PERMISSION_KEYS).toContain('planning.read');
    expect(SYSTEM_ROLE_PERMISSIONS['super-admin']).toContain('planning.read');
    for (const [role, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS))
      if (role !== 'super-admin') expect(permissions).not.toContain('planning.read');
    expect(controller).toContain("@adminPermission('planning.read')");
    expect(access).toContain("private.admin_has_permission(p_admin_id,'planning.read'");
  });

  it('exposes one stable read function and no Admin mutation route', () => {
    expect(access).toContain('returns jsonb language plpgsql stable security definer');
    expect(controller.match(/api\/v1\/admin\/planning\/summary/g)).toHaveLength(1);
    expect(controller).not.toMatch(/@(Post|Put|Patch|Delete)\('api\/v1\/admin\/planning/);
  });
});
