import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('deletion and retention integration', () => {
  let pool: PoolService;
  beforeAll(() => { pool = createLivePool(); });
  afterAll(async () => pool.onModuleDestroy());

  it('keeps deletion active uniqueness and cooling-off in database constraints', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values('integration_delete_owner','active') on conflict do nothing");
        await expect(client.query(`insert into private.account_deletion_requests(user_id,cooling_off_ends_at)
          values('integration_delete_owner',clock_timestamp()-interval '1 hour')`)).rejects.toMatchObject({ code: '23514' });
      } finally {
        await client.query('rollback');
      }
    });
  });
});
