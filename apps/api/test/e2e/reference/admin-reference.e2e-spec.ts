import request from 'supertest';

import { createReferenceE2eHarness, type ReferenceE2eHarness } from './reference-e2e-harness';

describe('Admin reference HTTP authorization', () => {
  let harness: ReferenceE2eHarness;
  beforeAll(async () => {
    harness = await createReferenceE2eHarness();
  });
  afterAll(async () => harness.app.close());

  it('fails closed for missing permission and stale MFA', async () => {
    harness.auth.admin = false;
    await request(harness.server).get('/api/v1/admin/reference/currencies').expect(403);
    harness.auth.admin = true;
    harness.auth.recent = false;
    await request(harness.server)
      .patch('/api/v1/admin/reference/currencies/SAR')
      .set('Idempotency-Key', 'valid-key')
      .send({ expectedVersion: 1, reason: 'Required reason', enabled: true })
      .expect(403)
      .expect((response) => {
        expect((response.body as unknown as { code: unknown }).code).toBe('RECENT_AUTH_REQUIRED');
      });
  });

  it('rejects mass assignment and accepts an exact typed update', async () => {
    harness.auth.recent = true;
    const endpoint = '/api/v1/admin/reference/currencies/SAR';
    await request(harness.server)
      .patch(endpoint)
      .set('Idempotency-Key', 'valid-key')
      .send({ expectedVersion: 1, reason: 'Required reason', resource: 'accounts' })
      .expect(400);
    await request(harness.server)
      .patch(endpoint)
      .set('Idempotency-Key', 'valid-key')
      .send({ expectedVersion: 1, reason: 'Required reason', enabled: true })
      .expect(200);
  });
});
