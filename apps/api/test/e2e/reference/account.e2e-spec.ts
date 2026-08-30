import request from 'supertest';

import { createReferenceE2eHarness, type ReferenceE2eHarness } from './reference-e2e-harness';

describe('account HTTP lifecycle', () => {
  let harness: ReferenceE2eHarness;
  beforeAll(async () => {
    harness = await createReferenceE2eHarness();
  });
  afterAll(async () => harness.app.close());

  it('accepts positive/negative openings, replays, and rejects unsafe or invalid currency input', async () => {
    const positive = await request(harness.server)
      .post('/api/v1/accounts')
      .set('Idempotency-Key', 'valid-key')
      .send({ name: 'Cash', type: 'cash', currency: 'SAR', openingBalanceMinor: 1 })
      .expect(201);
    expect((positive.body as { openingTransactionId: unknown }).openingTransactionId).toBe(
      '30000000-0000-4000-8000-000000000001',
    );
    await request(harness.server)
      .post('/api/v1/accounts')
      .set('Idempotency-Key', 'valid-key')
      .send({ name: 'Cash', type: 'cash', currency: 'SAR', openingBalanceMinor: 1 })
      .expect(201)
      .expect(positive.body as object);
    await request(harness.server)
      .post('/api/v1/accounts')
      .set('Idempotency-Key', 'negative-key')
      .send({ name: 'Debt', type: 'cash', currency: 'SAR', openingBalanceMinor: -1 })
      .expect(201);
    await request(harness.server)
      .post('/api/v1/accounts')
      .set('Idempotency-Key', 'unsafe-key')
      .send({
        name: 'Unsafe',
        type: 'cash',
        currency: 'SAR',
        openingBalanceMinor: Number.MAX_SAFE_INTEGER + 1,
      })
      .expect(400);
    await request(harness.server)
      .post('/api/v1/accounts')
      .set('Idempotency-Key', 'currency-key')
      .send({ name: 'Invalid Currency', type: 'cash', currency: 'sar', openingBalanceMinor: 1 })
      .expect(400);
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
