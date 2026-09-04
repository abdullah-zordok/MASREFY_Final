import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync cursor high-water upgrade', () => {
  const pool = createLivePool();
  afterAll(() => pool.onModuleDestroy());

  it('backfills Phase 07 cursor history before allocating the next cursor', async () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../../../supabase/migrations/20260901161000_sync_cursor_high_water.sql',
      ),
      'utf8',
    );
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query(
          "insert into public.profiles(id,status) values('sync_upgrade_owner','active')",
        );
        await client.query(
          `insert into public.user_devices(
            id,user_id,device_fingerprint,clerk_session_id,platform,app_version
          ) values(
            '65000000-0000-4000-8000-000000000009','sync_upgrade_owner',
            $1,'sync-session','ios','1.0.0'
          )`,
          [`h1:${'d'.repeat(64)}`],
        );
        await client.query(
          `insert into public.accounts(id,user_id,name,type,currency_code) values
           ('65000000-0000-4000-8000-000000000001','sync_upgrade_owner','Cash','cash','SAR')`,
        );
        for (const eventType of ['account.created', 'account.updated']) {
          await client.query(`select private.enqueue_outbox_event($1,'account',$2,$3::jsonb)`, [
            eventType,
            '65000000-0000-4000-8000-000000000001',
            JSON.stringify({
              accountId: '65000000-0000-4000-8000-000000000001',
              userId: 'sync_upgrade_owner',
              version: 1,
              occurredAt: '2026-09-01T00:00:00Z',
            }),
          ]);
        }
        await client.query(
          `insert into public.client_sync_state(user_id,device_id,domain,last_cursor,last_issued_cursor)
           values
             ('sync_upgrade_owner','65000000-0000-4000-8000-000000000009','accounts',2,2),
             ('sync_upgrade_owner','65000000-0000-4000-8000-000000000009','planning',7,7)`,
        );
        await client.query('drop function private.next_sync_cursor(text,text)');
        await client.query('drop table private.sync_cursor_positions');
        await client.query('reset role');

        await client.query(migration);

        const positions = await client.query<{ domain: string; last_cursor: string }>(
          `select domain,last_cursor::text from private.sync_cursor_positions
           where user_id='sync_upgrade_owner' order by domain`,
        );
        expect(positions.rows).toEqual([
          { domain: 'accounts', last_cursor: '2' },
          { domain: 'planning', last_cursor: '7' },
        ]);

        await client.query('grant masarifi_migration to current_user with inherit true,set true');
        await client.query('set local role masarifi_migration');
        await client.query(
          `select private.enqueue_outbox_event(
            'account.updated','account','65000000-0000-4000-8000-000000000001',$1::jsonb
          )`,
          [
            JSON.stringify({
              accountId: '65000000-0000-4000-8000-000000000001',
              userId: 'sync_upgrade_owner',
              version: 1,
              occurredAt: '2026-09-01T00:00:02Z',
            }),
          ],
        );
        const next = await client.query<{ cursor: string }>(
          `select max((payload#>>'{sync,cursor}')::bigint)::text cursor
           from private.outbox_events where payload#>>'{sync,userId}'='sync_upgrade_owner'
             and payload#>>'{sync,domain}'='accounts'`,
        );
        expect(next.rows[0]?.cursor).toBe('3');
      } finally {
        await client.query('rollback');
      }
    });
  });
});
