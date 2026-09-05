import request from 'supertest';

import { createReferenceE2eHarness, type ReferenceE2eHarness } from './reference-e2e-harness';

describe('category HTTP lifecycle', () => {
  let harness: ReferenceE2eHarness;
  beforeAll(async () => {
    harness = await createReferenceE2eHarness();
  });
  afterAll(async () => harness.app.close());

  it('requires authentication and idempotency before creating', async () => {
    harness.auth.user = false;
    await request(harness.server).get('/api/v1/categories').expect(401);
    harness.auth.user = true;
    await request(harness.server)
      .post('/api/v1/categories')
      .send({ labelAr: 'طعام', labelEn: 'Food' })
      .expect(400)
      .expect((response) => {
        expect((response.body as unknown as { code: unknown }).code).toBe(
          'IDEMPOTENCY_KEY_REQUIRED',
        );
      });
  });

  it('creates and archives through the canonical paths', async () => {
    await request(harness.server)
      .post('/api/v1/categories')
      .set('Idempotency-Key', 'valid-key')
      .send({ labelAr: 'طعام', labelEn: 'Food' })
      .expect(201);
    await request(harness.server)
      .get('/api/v1/categories/10000000-0000-4000-8000-000000000001/usage')
      .expect(200)
      .expect({ linkedTransactionCount: 0, version: 1 });
    await request(harness.server)
      .delete(
        '/api/v1/categories/10000000-0000-4000-8000-000000000001?expectedVersion=1&expectedLinkedTransactionCount=0',
      )
      .set('Idempotency-Key', 'valid-key')
      .expect(204);
  });
});
