import { ADMIN_ROLES, PERMISSION_KEYS as ADMIN_PERMISSION_KEYS } from '../../../../admin-web/src/core/permissions/permissions';
import { permissionsByRole as adminPermissionsByRole } from '../../../../admin-web/src/core/permissions/role-map';
import {
  CLIENT_PERMISSION_ALIASES,
  CLIENT_PERMISSION_KEYS,
  PERMISSION_KEYS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  permissionManifestHash,
} from '../../../src/security/permission-manifest';

describe('permission manifest contract', () => {
  it('tracks all 151 unique Admin keys and seven unique roles', () => {
    expect(CLIENT_PERMISSION_KEYS).toEqual(ADMIN_PERMISSION_KEYS);
    expect(CLIENT_PERMISSION_KEYS).toHaveLength(151);
    expect(new Set(CLIENT_PERMISSION_KEYS).size).toBe(151);
    expect(SYSTEM_ROLES).toEqual(ADMIN_ROLES);
    expect(new Set(SYSTEM_ROLES).size).toBe(7);
  });

  it('maps exactly twelve unique client aliases to canonical keys', () => {
    expect(Object.keys(CLIENT_PERMISSION_ALIASES)).toHaveLength(12);
    expect(new Set(Object.values(CLIENT_PERMISSION_ALIASES)).size).toBe(12);
    for (const [client, canonical] of Object.entries(CLIENT_PERMISSION_ALIASES)) {
      expect(CLIENT_PERMISSION_KEYS).toContain(client);
      expect(PERMISSION_KEYS).toContain(canonical);
      expect(client).not.toBe(canonical);
    }
  });

  it('canonicalizes every current Admin role mapping without unknown keys', () => {
    for (const role of ADMIN_ROLES) {
      const expected = [...new Set(adminPermissionsByRole[role].map((key) => CLIENT_PERMISSION_ALIASES[key] ?? key))].sort();
      expect(SYSTEM_ROLE_PERMISSIONS[role]).toEqual(expected);
      expect(expected.every((key) => PERMISSION_KEYS.includes(key))).toBe(true);
    }
  });

  it('publishes a stable SHA-256 manifest hash', () => {
    expect(permissionManifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(permissionManifestHash).toBe(permissionManifestHash.toLowerCase());
  });
});
