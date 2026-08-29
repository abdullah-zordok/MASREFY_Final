import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Privacy export routes E2E', () => {
  it('accepts asynchronous export requests and keeps download authorization on detail', async () => {
    const { app, execute } = await createSecurityE2eHarness({ id: 'export-1', status: 'verified' });
    try {
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post('/api/v1/me/privacy/exports')
        .set('idempotency-key', 'privacy-export-e2e')
        .send({ scope: ['identity@1'] })
        .expect(202);
      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .get('/api/v1/me/privacy/exports/export-1')
        .expect(200);
      expect(execute.mock.calls.map(([input]) => input.operation)).toEqual([
        'createMyPrivacyExport',
        'getMyPrivacyExport',
      ]);
    } finally {
      await app.close();
    }
  });
});
