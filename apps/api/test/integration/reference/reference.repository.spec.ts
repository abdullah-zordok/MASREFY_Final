import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('reference repository transactions', () => {
  const owner = {
    userId: 'integration_reference_owner',
    sessionId: 'reference-session',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  const other = {
    userId: 'integration_reference_other',
    sessionId: 'other-session',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  let pool: PoolService;
  let repository: ReferenceRepository;
  const runId = randomUUID();
  const request = (
    operation: string,
    body: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
    params: Record<string, string> = {},
  ) => ({
    operation,
    principal: owner,
    body,
    query,
    params,
    requestId: `ref-${operation}-${runId}`,
  });

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2),
    } as never);
    repository = new ReferenceRepository(pool);
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `insert into public.profiles(id,status) values($1,'active'),($2,'active') on conflict(id) do update set status='active'`,
        [owner.userId, other.userId],
      );
      await client.query('commit');
    });
  });
  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(`delete from private.outbox_events where payload->>'userId'=any($1)`, [
        [owner.userId, other.userId],
      ]);
      await client.query('delete from public.categories where user_id=any($1)', [
        [owner.userId, other.userId],
      ]);
      await client.query('delete from public.accounts where user_id=any($1)', [
        [owner.userId, other.userId],
      ]);
      await client.query('delete from public.profiles where id=any($1)', [
        [owner.userId, other.userId],
      ]);
      await client.query('commit');
    });
    await pool.onModuleDestroy();
  });

  it('commits category state with exactly one audit and outbox row', async () => {
    const result = (await repository.execute(
      request('createCategory', {
        kind: 'expense',
        labelAr: 'اختبار',
        labelEn: 'Integration',
        icon: null,
        color: null,
        parentId: null,
        sortOrder: 50,
      }),
    )) as { id: string; version: number };
    expect(result.version).toBe(1);
    const evidence = await pool.query<{ audits: string; events: string }>(
      `select (select count(*) from audit.audit_events where request_id=$2)::text audits,(select count(*) from private.outbox_events where aggregate_id=$1::uuid)::text events`,
      [result.id, `ref-createCategory-${runId}`],
    );
    expect(evidence.rows[0]).toEqual({ audits: '1', events: '1' });
    const hidden = (await repository.execute({
      ...request(
        'listUserCategories',
        {},
        { kind: null, includeInactive: true, afterSort: null, afterId: null, limit: 100 },
      ),
      principal: other,
    })) as unknown[];
    expect(hidden).toEqual([]);
  });

  it('changes the active default atomically and keeps archive retry audit-idempotent', async () => {
    const first = (await repository.execute(
      request('createAccount', {
        name: 'Cash A',
        type: 'cash',
        currency: 'SAR',
        institutionName: null,
        lastFour: null,
        creditLimitMinor: null,
        isDefault: true,
        iconKey: null,
        colorKey: null,
        notes: null,
        sortOrder: 0,
        includeInTotals: true,
        openedAt: null,
      }),
    )) as { account: { id: string; version: number } };
    const second = (await repository.execute({
      ...request('createAccount', {
        name: 'Cash B',
        type: 'cash',
        currency: 'SAR',
        institutionName: null,
        lastFour: null,
        creditLimitMinor: null,
        isDefault: true,
        iconKey: null,
        colorKey: null,
        notes: null,
        sortOrder: 1,
        includeInTotals: true,
        openedAt: null,
      }),
      requestId: `ref-createAccount-second-${runId}`,
    })) as { account: { id: string; version: number } };
    const defaults = await pool.query<{ id: string }>(
      'select id from public.accounts where user_id=$1 and is_default',
      [owner.userId],
    );
    expect(defaults.rows.map(({ id }) => id)).toEqual([second.account.id]);
    const updated = (await repository.execute(
      request(
        'updateAccount',
        { expectedVersion: second.account.version, isDefault: true, notes: 'still default' },
        {},
        { accountId: second.account.id },
      ),
    )) as { version: number };
    expect(updated.version).toBe(second.account.version + 1);
    await repository.execute(
      request(
        'archiveAccount',
        {},
        { expectedVersion: updated.version },
        { accountId: second.account.id },
      ),
    );
    await repository.execute(
      request(
        'archiveAccount',
        {},
        { expectedVersion: second.account.version },
        { accountId: second.account.id },
      ),
    );
    const count = await pool.query<{ count: string }>(
      `select count(*)::text count from audit.audit_events where request_id=$1`,
      [`ref-archiveAccount-${runId}`],
    );
    expect(count.rows[0]?.count).toBe('1');
    expect(first.account.id).not.toBe(second.account.id);
  });

  it('resolves identity and approved historical rates without a provider worker', async () => {
    await expect(
      repository.execute(
        request(
          'getExchangeRate',
          {},
          { base: 'SAR', quote: 'SAR', at: new Date('2026-08-01T00:00:00Z'), maxAgeSeconds: 86400 },
        ),
      ),
    ).resolves.toMatchObject({ rate: 1, provider: 'identity' });
    await expect(
      repository.execute(
        request(
          'getExchangeRate',
          {},
          { base: 'USD', quote: 'SAR', at: new Date('2026-08-01T00:00:00Z'), maxAgeSeconds: 86400 },
        ),
      ),
    ).rejects.toThrow('FX_UNAVAILABLE');
  });
});
