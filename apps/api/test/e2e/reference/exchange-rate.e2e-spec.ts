import request from 'supertest';

import { createReferenceE2eHarness, type ReferenceE2eHarness } from './reference-e2e-harness';

describe('exchange-rate HTTP contract', () => {
  let harness: ReferenceE2eHarness;
  beforeAll(async () => {
    harness = await createReferenceE2eHarness();
  });
  afterAll(async () => harness.app.close());

  it('returns identity metadata and rejects malformed currencies', async () => {
    await request(harness.server)
      .get('/api/v1/exchange-rates?base=SAR&quote=SAR')
      .expect(200)
      .expect((response) => {
        expect(response.body as unknown).toMatchObject({ rate: 1, provider: 'identity' });
      });
    await request(harness.server)
      .get('/api/v1/exchange-rates?base=sar&quote=USD')
      .expect(400)
      .expect((response) => {
        expect((response.body as unknown as { code: unknown }).code).toBe('INVALID_CURRENCY');
      });
  });
});
