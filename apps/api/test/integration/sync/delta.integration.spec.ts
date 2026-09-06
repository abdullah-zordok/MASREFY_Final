import { randomUUID } from 'node:crypto';

import { SyncRepository } from '../../../src/sync/sync.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('sync bootstrap, delta ordering, and checkpoints', () => {
  const pool = createLivePool();
  const repository = new SyncRepository(pool);
  const ownerId = `sync_delta_${randomUUID()}`;
  const otherId = `sync_other_${randomUUID()}`;
  const principal = { userId: ownerId, sessionId: 'session', factorAgeSeconds: 0 } as never;
  const deviceId = randomUUID();
  const accountId = randomUUID();
  const otherAccountId = randomUUID();

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
        `insert into public.accounts(
          id,user_id,name,type,currency_code,automatic_tracking_enabled,
          statement_day,payment_due_day,monthly_interest_rate_basis_points,minimum_payment_minor
        ) values
         ($1,$3,'Card','credit_card','SAR',false,7,21,125,5000),
         ($2,$4,'Other','cash','SAR',true,null,null,null,null)`,
        [accountId, otherAccountId, ownerId, otherId],
      );
      await client.query(
        "select private.enqueue_outbox_event('account.created','account',$1,$2::jsonb)",
        [
          accountId,
          JSON.stringify({
            accountId,
            userId: ownerId,
            version: 1,
            occurredAt: new Date().toISOString(),
          }),
        ],
      );
      await client.query("update public.accounts set name='Cash updated' where id=$1", [accountId]);
      await client.query(
        "select private.enqueue_outbox_event('account.updated','account',$1,$2::jsonb)",
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
      await client.query(
        `select private.enqueue_outbox_event(
          'account.updated','account',$1,
          jsonb_build_object('accountId',$1::uuid,'userId',$2::text,'version',2,
            'occurredAt',clock_timestamp(),'sample',sample)
        ) from generate_series(3,502) sample`,
        [accountId, ownerId],
      );
      await client.query(
        "select private.enqueue_outbox_event('account.created','account',$1,$2::jsonb)",
        [
          otherAccountId,
          JSON.stringify({
            accountId: otherAccountId,
            userId: otherId,
            version: 1,
            occurredAt: new Date().toISOString(),
          }),
        ],
      );
      await client.query('commit');
    });
  });
  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("delete from private.outbox_events where payload->>'userId'=any($1)", [
        [ownerId, otherId],
      ]);
      await client.query('delete from public.client_sync_state where user_id=any($1)', [
        [ownerId, otherId],
      ]);
      await client.query('delete from public.user_devices where user_id=any($1)', [
        [ownerId, otherId],
      ]);
      await client.query('delete from public.accounts where user_id=any($1)', [[ownerId, otherId]]);
      await client.query('delete from public.profiles where id=any($1)', [[ownerId, otherId]]);
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  it('bootstraps only owner snapshots at the current domain cursor', async () => {
    const [domain] = await repository.bootstrap(principal, ['accounts'], null, 500, null);
    expect(domain).toMatchObject({ domain: 'accounts', position: 502n });
    expect(domain?.items).toHaveLength(1);
    expect(domain?.items[0]).toMatchObject({
      id: accountId,
      snapshot: { id: accountId, name: 'Cash updated' },
    });
    expect(domain?.items[0]?.snapshot.automatic_tracking_enabled).toBe(false);
    expect(domain?.items[0]?.snapshot).toMatchObject({
      statement_day: 7,
      payment_due_day: 21,
      monthly_interest_rate_basis_points: 125,
      minimum_payment_minor: 5_000,
    });
    expect(domain?.items.some((item) => item.id === otherAccountId)).toBe(false);
  });

  it('uses ordered keyset pages and stores only monotonic owner/device acknowledgements', async () => {
    const first = await repository.delta(principal, 'accounts', 0n, 500);
    expect(first.changes).toHaveLength(501);
    expect(first.changes[0]?.position).toBe(1n);
    expect(first.changes[499]?.position).toBe(500n);
    const resumed = await repository.delta(principal, 'accounts', 500n, 500);
    expect(resumed.changes.map(({ position }) => position)).toEqual([501n, 502n]);
    expect(first.current).toBe(502n);
    expect(first.changes.every(({ resourceId }) => resourceId === accountId)).toBe(true);
    expect(
      first.changes
        .filter(({ snapshot }) => snapshot !== null)
        .every(({ snapshot }) => snapshot?.automatic_tracking_enabled === false),
    ).toBe(true);
    expect(
      first.changes
        .filter(({ snapshot }) => snapshot !== null)
        .every(
          ({ snapshot }) =>
            snapshot?.statement_day === 7 &&
            snapshot.payment_due_day === 21 &&
            snapshot.monthly_interest_rate_basis_points === 125 &&
            snapshot.minimum_payment_minor === 5_000,
        ),
    ).toBe(true);
    await repository.recordIssuedCursor(principal, deviceId, 'accounts', 502n);
    const ack = await repository.acknowledge(principal, deviceId, 'accounts', 502n, null);
    expect(ack.position).toBe(502n);
    const lower = await repository.acknowledge(principal, deviceId, 'accounts', 1n, null);
    expect(lower.position).toBe(502n);
  });
});
