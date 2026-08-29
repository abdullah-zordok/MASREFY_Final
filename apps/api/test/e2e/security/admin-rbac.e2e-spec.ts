import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Admin RBAC routes E2E', () => {
  it('routes role and assignment mutations through the guarded controller', async () => {
    const { app, execute } = await createSecurityE2eHarness({ id: 'role-1', version: 1 });
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/admin/access/roles')
        .set('idempotency-key', 'role-e2e-1')
        .send({
          key: 'analyst',
          name: 'Analyst',
          permissionKeys: ['audit.read'],
          reason: 'Approved access role',
        })
        .expect(201);
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/admin/access/assignments')
        .set('idempotency-key', 'assignment-e2e-1')
        .send({ userId: 'admin-2', roleId: 'role-1', reason: 'Approved role assignment' })
        .expect(201);
      expect(execute.mock.calls.map(([input]) => input.operation)).toEqual([
        'createRole',
        'assignAdminRole',
      ]);
    } finally {
      await app.close();
    }
  });
});
