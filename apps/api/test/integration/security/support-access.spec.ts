import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('support access integration', () => {
  let pool: PoolService;
  beforeAll(() => { pool = createLivePool(); });
  afterAll(async () => pool.onModuleDestroy());

  it('accepts only registered, read-only support scopes in PostgreSQL', async () => {
    const result = await pool.query<{ safe: boolean; unsafe: boolean }>(`select
      private.is_valid_support_scope('[{"resource":"account-status","actions":["read-status"]}]') safe,
      private.is_valid_support_scope('[{"resource":"payments","actions":["write"]}]') unsafe`);
    expect(result.rows[0]).toEqual({ safe: true, unsafe: false });
  });
});
