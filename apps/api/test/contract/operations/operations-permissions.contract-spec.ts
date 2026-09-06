import {
  OPERATIONS_PERMISSION_KEYS,
  PERMISSION_KEYS,
  SYSTEM_ROLE_PERMISSIONS,
} from '../../../src/security/permission-manifest';

describe('operations permission manifest', () => {
  it('registers the exact bounded operations permissions', () => {
    expect(OPERATIONS_PERMISSION_KEYS).toEqual([
      'operations.health.read',
      'operations.providers.read',
      'operations.jobs.read',
      'operations.jobs.manage',
      'operations.incidents.read',
      'operations.incidents.manage',
      'operations.settings.read',
      'operations.settings.manage',
      'operations.flags.read',
      'operations.flags.manage',
      'operations.maintenance.read',
      'operations.maintenance.manage',
      'operations.performance.read',
      'operations.recovery.read',
    ]);
    expect(PERMISSION_KEYS).toEqual(expect.arrayContaining([...OPERATIONS_PERMISSION_KEYS]));
    expect(OPERATIONS_PERMISSION_KEYS).not.toEqual(
      expect.arrayContaining(['operations.*', 'operations.billing.read']),
    );
  });

  it('gives the super-admin every operations permission without adding billing readiness', () => {
    expect(SYSTEM_ROLE_PERMISSIONS['super-admin']).toEqual(
      expect.arrayContaining([...OPERATIONS_PERMISSION_KEYS]),
    );
    expect(PERMISSION_KEYS).not.toContain('operations.billing.read');
  });
});
