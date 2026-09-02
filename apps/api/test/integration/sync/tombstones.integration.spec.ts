import { randomUUID } from 'node:crypto';

import { SyncRepository } from '../../../src/sync/sync.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync tombstones', () => {
  const pool = createLivePool();
  const repository = new SyncRepository(pool);
  const ownerId = `sync_tombstone_${randomUUID()}`;
  const principal = { userId: ownerId, sessionId: 'session' } as never;
  const accountId = randomUUID();

  afterAll(() => pool.onModuleDestroy());

  it('emits an immutable ordered tombstone without requiring a deleted snapshot', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Cash','cash','SAR')",
        [accountId, ownerId],
      );
      await client.query(
        "update public.accounts set status='archived',deleted_at=clock_timestamp() where id=$1",
        [accountId],
      );
      await client.query(
        "select private.enqueue_outbox_event('account.archived','account',$1,$2::jsonb)",
        [
          accountId,
          JSON.stringify({
            accountId,
            userId: ownerId,
            version: 2,
            occurredAt: new Date().toISOString(),
          }),
        ],
      );
      await client.query('commit');
    });
    const page = await repository.delta(principal, 'accounts', 0n, 10);
    expect(typeof page.changes[0]?.deletedAt).toBe('string');
    expect(page.changes).toEqual([
      expect.objectContaining({
        resourceId: accountId,
        operation: 'delete',
        version: 2,
        snapshot: null,
      }),
    ]);
    await expect(
      pool.query("update private.outbox_events set payload='{}' where aggregate_id=$1", [
        accountId,
      ]),
    ).rejects.toThrow('OUTBOX_PAYLOAD_IMMUTABLE');
  });
});
