import type { PoolService } from '../../../src/platform/database/pool.service';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('customer security event integration', () => {
  let pool: PoolService;
  beforeAll(() => { pool=createLivePool(); });
  afterAll(async () => pool.onModuleDestroy());

  it('returns only owner-safe columns and rows in deterministic order', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values('security_event_owner','active'),('security_event_other','active') on conflict do nothing");
        await client.query(`insert into public.security_events(user_id,event_type,severity,ip_hash,metadata) values
          ('security_event_owner','security.login','info','h1:test:${'a'.repeat(64)}','{"category":"owner"}'),
          ('security_event_other','security.login','high','h1:test:${'b'.repeat(64)}','{"category":"other"}')`);
        await client.query("select set_config('request.jwt.claims','{\"role\":\"authenticated\",\"sub\":\"security_event_owner\",\"sid\":\"session\"}',true)");
        await client.query('set local role authenticated');
        const page=await client.query(`select id,event_type,severity,metadata,occurred_at from public.security_events
          order by occurred_at desc,id desc limit 100`);
        expect(page.rows).toHaveLength(1);
        expect(page.rows[0]).toMatchObject({event_type:'security.login',severity:'info',metadata:{category:'owner'}});
        await expect(client.query('select ip_hash from public.security_events')).rejects.toMatchObject({code:'42501'});
      } finally {
        await client.query('rollback');
      }
    });
  });
});
