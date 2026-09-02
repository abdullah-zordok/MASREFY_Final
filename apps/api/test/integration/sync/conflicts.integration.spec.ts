import { randomUUID } from 'node:crypto';

import { SyncRepository } from '../../../src/sync/sync.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync conflict atomicity and ownership', () => {
  const pool = createLivePool();
  const repository = new SyncRepository(pool);
  const ownerId = `sync_conflict_${randomUUID()}`;
  const otherId = `sync_conflict_other_${randomUUID()}`;
  const principal = { userId: ownerId, sessionId: 'session', factorAgeSeconds: 0 } as never;
  const other = { userId: otherId, sessionId: 'session', factorAgeSeconds: 0 } as never;
  const deviceId = randomUUID();
  const transactionId = randomUUID();
  const operationId = randomUUID();
  let conflictId = '';

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "insert into public.profiles(id,status) values($1,'active'),($2,'active')",
        [ownerId, otherId],
      );
      await client.query(
        `insert into public.user_devices(
          id,user_id,device_fingerprint,clerk_session_id,platform,app_version
        ) values($1,$2,$3,'session','ios','1.0.0')`,
        [deviceId, ownerId, `h1:${'d'.repeat(64)}`],
      );
      await client.query(
        `insert into public.transactions(
          id,user_id,kind,amount_minor,currency_code,title,occurred_at,source,version
        ) values($1,$2,'expense',100,'SAR','Server value',clock_timestamp(),'manual',2)`,
        [transactionId, ownerId],
      );
      await client.query('commit');
    });
    const mutation = {
      operationId,
      domain: 'transactions',
      resourceType: 'transaction',
      schemaVersion: 1,
      dependsOn: [],
      operation: 'update',
      resourceId: transactionId,
      baseVersion: 1,
      payload: { title: 'Client value' },
    } as const;
    const received = await repository.receiveMutation(
      principal,
      deviceId,
      mutation,
      `sha256:${'a'.repeat(64)}`,
    );
    const claimed = (await repository.claimMutations('conflict-test-worker', 100, 60)).find(
      ({ id }) => id === received.mutationId,
    );
    if (!claimed || claimed.id !== received.mutationId) throw new Error('SYNC_TEST_CLAIM_MISSING');
    const conflict = await repository.createConflict(
      ownerId,
      {
        mutationId: received.mutationId,
        transactionId,
        serverVersion: 2,
        clientVersion: 1,
        fields: ['title'],
        serverSnapshot: { title: 'Server value' },
        clientSnapshot: { title: 'Client value' },
      },
      claimed.leaseToken,
    );
    conflictId = conflict.id;
  });

  afterAll(() => pool.onModuleDestroy());

  it('lists immutable snapshots only for their owner', async () => {
    await expect(repository.listConflicts(principal, 'open', null, 10)).resolves.toEqual([
      expect.objectContaining({ id: conflictId, serverVersion: 2, clientVersion: 1 }),
    ]);
    await expect(repository.getConflict(other, conflictId)).resolves.toBeNull();
  });

  it('locks concurrent terminal decisions and emits one audit/outbox decision', async () => {
    const results = await Promise.allSettled([
      repository.resolveConflict(
        principal,
        conflictId,
        'server',
        null,
        'conflict-server',
        'sha256:' + '1'.repeat(64),
        'sha256:' + '2'.repeat(64),
      ),
      repository.resolveConflict(
        principal,
        conflictId,
        'duplicate',
        null,
        'conflict-duplicate',
        'sha256:' + '3'.repeat(64),
        'sha256:' + '4'.repeat(64),
      ),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const effects = await pool.query<{ audits: string; events: string }>(
      `select
        (select count(*)::text from audit.audit_events where resource_type='transaction_conflict' and resource_id=$1) audits,
        (select count(*)::text from private.outbox_events where event_type='sync.conflict.resolved' and aggregate_id=$1::uuid) events`,
      [conflictId],
    );
    expect(effects.rows[0]).toEqual({ audits: '1', events: '1' });
  });
});
