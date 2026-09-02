import { randomUUID } from 'node:crypto';

import { SyncRepository } from '../../../src/sync/sync.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync durable mutation receipts', () => {
  const pool = createLivePool();
  const repository = new SyncRepository(pool);
  const ownerId = `sync_mutations_${randomUUID()}`;
  const principal = { userId: ownerId, sessionId: 'session', factorAgeSeconds: 0 } as never;
  const deviceId = randomUUID();
  const mutation = {
    operationId: randomUUID(),
    domain: 'transactions',
    resourceType: 'transaction',
    schemaVersion: 1,
    dependsOn: [],
    operation: 'update',
    resourceId: randomUUID(),
    baseVersion: 1,
    payload: { title: 'Coffee' },
  } as const;
  const hash = `sha256:${'a'.repeat(64)}`;

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
  });
  afterAll(() => pool.onModuleDestroy());

  it('creates one operation receipt under concurrency and replays it after repository restart', async () => {
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.receiveMutation(principal, deviceId, mutation, hash),
      ),
    );
    expect(receipts.filter(({ outcome }) => outcome === 'received')).toHaveLength(1);
    expect(receipts.filter(({ outcome }) => outcome === 'replay')).toHaveLength(7);
    await expect(
      new SyncRepository(pool).receiveMutation(principal, deviceId, mutation, hash),
    ).resolves.toMatchObject({ outcome: 'replay', status: 'received' });
    await expect(
      repository.receiveMutation(principal, deviceId, mutation, `sha256:${'b'.repeat(64)}`),
    ).resolves.toMatchObject({ outcome: 'hash_mismatch' });
  });

  it('persists partial batches and fences stale batch completion', async () => {
    const keyHash = `sha256:${'c'.repeat(64)}`;
    const requestHash = `sha256:${'d'.repeat(64)}`;
    const first = await repository.claimBatch(principal, keyHash, requestHash, 60);
    expect(first).toMatchObject({ outcome: 'new' });
    await repository.receiveMutation(
      principal,
      deviceId,
      { ...mutation, operationId: randomUUID() },
      hash,
    );
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "update private.idempotency_keys set locked_until=created_at where actor_id=$1 and scope='sync.mutations' and key_hash=$2",
        [ownerId, keyHash],
      );
      await client.query('commit');
    });
    const reclaimed = await repository.claimBatch(principal, keyHash, requestHash, 60);
    expect(reclaimed).toMatchObject({ outcome: 'new' });
    await expect(
      repository.completeBatch(
        principal,
        { keyHash, requestHash, leaseToken: first.leaseToken ?? '' },
        200,
        { data: { receipts: [] } },
      ),
    ).rejects.toThrow('IDEMPOTENCY_LEASE_LOST');
    const response = { data: { receipts: [{ status: 'received' }] } };
    await repository.completeBatch(
      principal,
      { keyHash, requestHash, leaseToken: reclaimed.leaseToken ?? '' },
      200,
      response,
    );
    await expect(repository.claimBatch(principal, keyHash, requestHash, 60)).resolves.toMatchObject(
      {
        outcome: 'replay',
        responseBody: response,
      },
    );
  });
});
