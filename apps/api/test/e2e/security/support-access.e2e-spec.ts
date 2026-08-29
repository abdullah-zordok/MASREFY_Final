import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Support access routes E2E', () => {
  it('keeps owner decisions and masked workspace use on their canonical routes', async () => {
    const { app, execute } = await createSecurityE2eHarness({ sections: [] });
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/me/support-access/requests/request-1/decision')
        .set('idempotency-key', 'support-owner-e2e')
        .send({ decision: 'approve', expectedVersion: 1 })
        .expect(200);
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get('/api/v1/admin/support-access/requests/request-1/workspace')
        .expect(200);
      expect(execute.mock.calls.map(([input]) => input.operation)).toEqual([
        'decideMySupportAccessRequest',
        'getSupportWorkspace',
      ]);
    } finally {
      await app.close();
    }
  });
});
