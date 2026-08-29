import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('privacy export integration', () => {
  let pool: PoolService;
  beforeAll(() => {
    pool = createLivePool();
  });
  afterAll(async () => pool.onModuleDestroy());

  it('enforces one active export per owner', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query(
          "insert into public.profiles(id,status) values('integration_export_owner','active') on conflict do nothing",
        );
        await client.query(
          "insert into private.privacy_export_requests(user_id) values('integration_export_owner')",
        );
        await expect(
          client.query(
            "insert into private.privacy_export_requests(user_id) values('integration_export_owner')",
          ),
        ).rejects.toMatchObject({ code: '23505' });
      } finally {
        await client.query('rollback');
      }
    });
  });
});
