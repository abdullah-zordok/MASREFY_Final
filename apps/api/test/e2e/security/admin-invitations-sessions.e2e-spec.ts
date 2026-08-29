import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Admin invitation and session routes E2E', () => {
  it('routes invitation creation and session revocation without exposing provider data', async () => {
    const { app, execute } = await createSecurityE2eHarness({
      id: 'safe-id',
      emailMasked: 'ad***@example.test',
    });
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/admin/access/invitations')
        .set('idempotency-key', 'invite-e2e-1')
        .send({ email: 'admin@example.test' })
        .expect(201);
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/admin/access/admins/admin-2/sessions/revoke')
        .set('idempotency-key', 'sessions-e2e-1')
        .send({ revokeAllEligible: true, reason: 'Security response approved', expectedVersion: 1 })
        .expect(200);
      expect(execute.mock.calls.map(([input]) => input.operation)).toEqual([
        'createAdminInvitation',
        'revokeAdminSessions',
      ]);
    } finally {
      await app.close();
    }
  });
});
