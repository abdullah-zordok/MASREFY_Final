import { randomUUID } from 'node:crypto';

import { SyncRepository } from '../../../src/sync/sync.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync worker leases and recovery', () => {
  const pool = createLivePool();
  const repository = new SyncRepository(pool);
  const ownerId = `sync_worker_live_${randomUUID()}`;
  const principal = { userId: ownerId, sessionId: 'session', factorAgeSeconds: 0 } as never;
  const deviceId = randomUUID();
  const mutation = {
    operationId: randomUUID(),
    domain: 'accounts',
    resourceType: 'account',
    schemaVersion: 1,
    dependsOn: [],
    operation: 'create',
    resourceId: null,
    baseVersion: null,
    payload: { name: 'Cash' },
  } as const;

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
      await client.query(
        `insert into public.user_devices(
          id,user_id,device_fingerprint,clerk_session_id,platform,app_version
        ) values($1,$2,$3,'session','ios','1.0.0')`,
        [deviceId, ownerId, `h1:${'d'.repeat(64)}`],
      );
      await client.query('commit');
    });
    await repository.receiveMutation(principal, deviceId, mutation, `sha256:${'a'.repeat(64)}`);
  });
  afterAll(() => pool.onModuleDestroy());

  it('recovers an expired claim, rejects its stale fence, and permits current completion', async () => {
    const [first] = await repository.claimMutations('worker-one', 1, 60);
    expect(first).toBeDefined();
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query('update public.client_mutations set locked_until=created_at where id=$1', [
        first?.id,
      ]);
      await client.query('commit');
    });
    const [reclaimed] = await repository.claimMutations('worker-two', 1, 60);
    await expect(
      repository.workerComplete(first?.id ?? '', first?.leaseToken ?? '', 'applied', {}, null),
    ).rejects.toThrow('SYNC_MUTATION_LEASE_LOST');
    await expect(
      repository.workerComplete(
        reclaimed?.id ?? '',
        reclaimed?.leaseToken ?? '',
        'applied',
        { resourceId: 'server-one' },
        null,
      ),
    ).resolves.toBeUndefined();
  });

  it.each(['idempotency.cleanup', 'sync-state.cleanup', 'conflicts.expire'] as const)(
    'runs bounded %s maintenance',
    async (job) => {
      await expect(repository.runMaintenance(job, 30)).resolves.toBeGreaterThanOrEqual(0);
    },
  );
});
