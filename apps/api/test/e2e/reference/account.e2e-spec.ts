import request from 'supertest';

import { createReferenceE2eHarness, type ReferenceE2eHarness } from './reference-e2e-harness';

describe('account HTTP lifecycle', () => {
  let harness: ReferenceE2eHarness;
  beforeAll(async () => {
    harness = await createReferenceE2eHarness();
  });
  afterAll(async () => harness.app.close());

  it('rejects a nonzero opening balance without repository effects', async () => {
    await request(harness.server)
      .post('/api/v1/accounts')
      .set('Idempotency-Key', 'valid-key')
      .send({ name: 'Cash', type: 'cash', currency: 'SAR', openingBalanceMinor: 1 })
      .expect(409)
      .expect((response) => {
        expect((response.body as unknown as { code: unknown }).code).toBe('LEDGER_NOT_AVAILABLE');
      });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('supports create, update, archive, restore, and close routes', async () => {
    const id = '20000000-0000-4000-8000-000000000001';
    const key = { 'Idempotency-Key': 'valid-key' };
    await request(harness.server)
      .post('/api/v1/accounts')
      .set(key)
      .send({ name: 'Cash', type: 'cash', currency: 'SAR' })
      .expect(201);
    await request(harness.server)
      .patch(`/api/v1/accounts/${id}`)
      .set(key)
      .send({ expectedVersion: 1, notes: 'updated' })
      .expect(200);
    await request(harness.server)
      .delete(`/api/v1/accounts/${id}?expectedVersion=2`)
      .set(key)
      .expect(204);
    await request(harness.server)
      .post(`/api/v1/accounts/${id}/restore`)
      .set(key)
      .send({ expectedVersion: 3 })
      .expect(200);
    await request(harness.server)
      .post(`/api/v1/accounts/${id}/close`)
      .set(key)
      .send({ expectedVersion: 3, closedAt: '2026-08-29' })
      .expect(200);
  });
});
