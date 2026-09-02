import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { buildMigrationManifest } from '../../../src/platform/database/migration-checksums';
import { assertCompatibleMigrationHistory } from '../../../src/platform/database/migration-runner';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync migration and recovery', () => {
  const pool = createLivePool();
  afterAll(() => pool.onModuleDestroy());

  it('keeps Phase 06 additive, ordered, and checksum-complete for the previous application', () => {
    const root = resolve(__dirname, '../../../../..');
    const migrations = resolve(root, 'supabase/migrations');
    const files = readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const phase06 = '20260831061405_phase06_sync_schema.sql';
    expect(files.indexOf(phase06)).toBe(
      files.indexOf('20260831120000_phase07_planning_tables.sql') - 1,
    );
    expect(buildMigrationManifest(migrations)).toBe(
      readFileSync(resolve(root, 'supabase/migration-checksums.sha256'), 'utf8').replaceAll(
        '\r\n',
        '\n',
      ),
    );
    const versions = files.map((name) => name.slice(0, 14));
    expect(() => {
      assertCompatibleMigrationHistory(versions.slice(0, -1), versions);
    }).not.toThrow();
    const sql = readFileSync(resolve(migrations, phase06), 'utf8');
    expect(sql).not.toMatch(/\bdrop\s+(?:table|column|function)\b/i);
  });

  it('backs up and restores sync queues, checkpoints, and cursor history', async () => {
    const ownerId = `sync_recovery_${randomUUID()}`;
    const deviceId = randomUUID();
    const mutationId = randomUUID();
    const operationId = randomUUID();
    const eventId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
        await client.query(
          `insert into public.user_devices(
            id,user_id,device_fingerprint,clerk_session_id,platform,app_version
          ) values($1,$2,$3,'session','ios','1.0.0')`,
          [deviceId, ownerId, `h1:${'d'.repeat(64)}`],
        );
        await client.query(
          `insert into public.client_mutations(
            id,user_id,device_id,operation_id,domain,resource_type,schema_version,
            depends_on,operation,payload_hash,payload
          ) values($1,$2,$3,$4,'accounts','account',1,'{}'::uuid[],'create',$5,'{}')`,
          [mutationId, ownerId, deviceId, operationId, `sha256:${'a'.repeat(64)}`],
        );
        await client.query(
          `insert into public.client_sync_state(
            user_id,device_id,domain,last_cursor,last_issued_cursor,last_synced_at,last_ack_mutation
          ) values($1,$2,'accounts',1,1,clock_timestamp(),$3)`,
          [ownerId, deviceId, mutationId],
        );
        await client.query(
          `insert into private.sync_cursor_positions(user_id,domain,last_cursor)
           values($1,'accounts',1)`,
          [ownerId],
        );
        await client.query('reset role');
        await client.query("set local session_replication_role='replica'");
        await client.query(
          `insert into private.outbox_events(id,aggregate_type,aggregate_id,event_type,payload)
           values($1,'sync_recovery',$2,'sync.recovery',$3::jsonb)`,
          [
            eventId,
            randomUUID(),
            JSON.stringify({
              sync: {
                userId: ownerId,
                domain: 'accounts',
                cursor: 1,
                resourceId: randomUUID(),
                resourceType: 'account',
                operation: 'delete',
                version: 1,
                deletedAt: '2026-08-31T00:00:00.000Z',
              },
            }),
          ],
        );
        await client.query("set local session_replication_role='origin'");
        await client.query(
          'create temporary table sync_mutation_backup on commit drop as select * from public.client_mutations where user_id=$1',
          [ownerId],
        );
        await client.query(
          'create temporary table sync_state_backup on commit drop as select * from public.client_sync_state where user_id=$1',
          [ownerId],
        );
        await client.query(
          "create temporary table sync_outbox_backup on commit drop as select * from private.outbox_events where payload#>>'{sync,userId}'=$1",
          [ownerId],
        );
        await client.query(
          'create temporary table sync_cursor_backup on commit drop as select * from private.sync_cursor_positions where user_id=$1',
          [ownerId],
        );
        await client.query('reset role');
        await client.query("set local session_replication_role='replica'");
        await client.query('delete from public.client_sync_state where user_id=$1', [ownerId]);
        await client.query('delete from public.client_mutations where user_id=$1', [ownerId]);
        await client.query('delete from private.sync_cursor_positions where user_id=$1', [ownerId]);
        await client.query("delete from private.outbox_events where payload#>>'{sync,userId}'=$1", [
          ownerId,
        ]);
        await client.query(
          'insert into public.client_mutations select * from sync_mutation_backup',
        );
        await client.query('insert into public.client_sync_state select * from sync_state_backup');
        await client.query('insert into private.sync_cursor_positions select * from sync_cursor_backup');
        await client.query('insert into private.outbox_events select * from sync_outbox_backup');
        await client.query("set local session_replication_role='origin'");
        const restored = await client.query<{
          mutations: string;
          states: string;
          cursors: string;
          events: string;
        }>(
          `select
            (select count(*)::text from public.client_mutations where user_id=$1) mutations,
            (select count(*)::text from public.client_sync_state where user_id=$1) states,
            (select count(*)::text from private.sync_cursor_positions where user_id=$1) cursors,
            (select count(*)::text from private.outbox_events where payload#>>'{sync,userId}'=$1) events`,
          [ownerId],
        );
        expect(restored.rows[0]).toEqual({
          mutations: '1',
          states: '1',
          cursors: '1',
          events: '1',
        });
        await client.query('rollback');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  it('preserves the previous application account query shape', async () => {
    const ownerId = `sync_n1_${randomUUID()}`;
    const accountId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'N-1 cash','cash','SAR')",
        [accountId, ownerId],
      );
      const row = await client.query(
        'select id,user_id,name,type,btrim(currency_code::text) currency_code,status,version from public.accounts where id=$1',
        [accountId],
      );
      expect(row.rows).toEqual([
        {
          id: accountId,
          user_id: ownerId,
          name: 'N-1 cash',
          type: 'cash',
          currency_code: 'SAR',
          status: 'active',
          version: '1',
        },
      ]);
      await client.query('rollback');
    });
  });
});
