import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('Admin reference governance', () => {
  const admin = {
    userId: 'reference_admin_integration',
    sessionId: 's1',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  const reader = {
    userId: 'reference_reader_integration',
    sessionId: 's2',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  const runId = randomUUID();
  let pool: PoolService;
  let repository: ReferenceRepository;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2),
    } as never);
    repository = new ReferenceRepository(pool);
    await pool.query(
      `insert into public.profiles(id,status) values($1,'active'),($2,'active') on conflict(id) do update set status='active'`,
      [admin.userId, reader.userId],
    );
    await pool.query(
      `insert into public.admin_profiles(user_id,status) values($1,'active'),($2,'active') on conflict(user_id) do update set status='active'`,
      [admin.userId, reader.userId],
    );
    await pool.query(
      `insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
      select $1,id,$1,'Reference integration role' from public.roles where key='super-admin'
      union all select $2,id,$1,'Reference integration role' from public.roles where key='security-administrator'
      on conflict(user_id,role_id) where revoked_at is null do nothing`,
      [admin.userId, reader.userId],
    );
  });

  afterAll(async () => {
    await pool.query(
      `delete from private.outbox_events where event_type='reference.updated' and payload->>'code'='SAR'`,
    );
    await pool.query('delete from public.admin_role_assignments where user_id=any($1)', [
      [admin.userId, reader.userId],
    ]);
    await pool.query('delete from public.admin_profiles where user_id=any($1)', [
      [admin.userId, reader.userId],
    ]);
    await pool.query('delete from public.profiles where id=any($1)', [
      [admin.userId, reader.userId],
    ]);
    await pool.onModuleDestroy();
  });

  it('commits a typed shared update with audit and a UUID-safe outbox envelope', async () => {
    const current = await pool.query<{ name: string; version: string }>(
      "select name,version::text from public.currencies where code='SAR'",
    );
    const requestId = `admin-reference-${runId}`;
    await expect(
      repository.execute({
        operation: 'updateAdminCurrency',
        principal: admin,
        permission: 'reference.write',
        requestId,
        params: { currencyCode: 'SAR' },
        query: {},
        body: {
          expectedVersion: Number(current.rows[0]?.version),
          reason: 'Integration reference update',
          name: current.rows[0]?.name,
        },
      }),
    ).resolves.toMatchObject({ code: 'SAR', minorUnit: 2, enabled: true });
    const evidence = await pool.query<{ audits: string; events: string; null_aggregate: boolean }>(
      `select (select count(*)::text from audit.audit_events where request_id=$1) audits,
       (select count(*)::text from private.outbox_events where event_type='reference.updated' and payload->>'code'='SAR') events,
       exists(select 1 from private.outbox_events where event_type='reference.updated' and payload->>'code'='SAR' and aggregate_id is null) null_aggregate`,
      [requestId],
    );
    expect(evidence.rows[0]).toMatchObject({ audits: '1', null_aggregate: true });
    expect(Number(evidence.rows[0]?.events)).toBeGreaterThan(0);
  });

  it('denies write to an Admin with read-only permission', async () => {
    await expect(
      repository.execute({
        operation: 'listAdminCurrencies',
        principal: reader,
        permission: 'reference.write',
        requestId: `denied-${runId}`,
        params: {},
        body: {},
        query: { limit: 10, offset: 0 },
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
