import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('audit and incident integration', () => {
  let pool: PoolService;
  beforeAll(() => { pool = createLivePool(); });
  afterAll(async () => pool.onModuleDestroy());

  it('rejects audit mutation even from the worker runtime role', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        const inserted = await client.query<{ id: string }>(`insert into audit.audit_events(actor_type,action,resource_type,request_id)
          values('system','security.integration-check','audit_event','integration-request') returning id`);
        await client.query('set local role masarifi_worker');
        await expect(client.query('update audit.audit_events set action=$2 where id=$1', [
          inserted.rows[0]?.id, 'security.changed',
        ])).rejects.toBeDefined();
      } finally {
        await client.query('rollback');
      }
    });
  });
});
