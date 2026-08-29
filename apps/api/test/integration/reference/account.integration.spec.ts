import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('account lifecycle', () => {
  const owner = { userId: 'account_integration_owner', sessionId: 's1', factorAgeSeconds: 0 };
  const other = { userId: 'account_integration_other', sessionId: 's2', factorAgeSeconds: 0 };
  const runId = randomUUID();
  let pool: PoolService;
  let repository: ReferenceRepository;
  const requestId = `account-${runId}`;
  const create = (principal = owner) =>
    repository.execute({
      operation: 'createAccount',
      principal,
      requestId,
      query: {},
      params: {},
      body: {
        name: `Cash ${runId.slice(0, 5)}`,
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
      },
    }) as Promise<{ account: { id: string; version: number; status: string } }>;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2),
    } as never);
    repository = new ReferenceRepository(pool);
    await pool.query(
      `insert into public.profiles(id,status) values($1,'active'),($2,'active')
      on conflict(id) do update set status='active'`,
      [owner.userId, other.userId],
    );
  });

  afterAll(async () => {
    await pool.query(`delete from private.outbox_events where payload->>'userId'=any($1)`, [
      [owner.userId, other.userId],
    ]);
    await pool.query('delete from public.accounts where user_id=any($1)', [
      [owner.userId, other.userId],
    ]);
    await pool.query('delete from public.profiles where id=any($1)', [
      [owner.userId, other.userId],
    ]);
    await pool.onModuleDestroy();
  });

  it('hides another owner and makes close terminal', async () => {
    const created = await create();
    await expect(
      repository.execute({
        operation: 'getAccount',
        principal: other,
        requestId,
        body: {},
        query: {},
        params: { accountId: created.account.id },
      }),
    ).rejects.toThrow('NOT_FOUND');
    const closed = (await repository.execute({
      operation: 'closeAccount',
      principal: owner,
      requestId,
      query: {},
      params: { accountId: created.account.id },
      body: { expectedVersion: created.account.version, closedAt: '2026-08-29' },
    })) as { status: string; version: number };
    expect(closed.status).toBe('closed');
    await expect(
      repository.execute({
        operation: 'restoreAccount',
        principal: owner,
        requestId,
        query: {},
        params: { accountId: created.account.id },
        body: { expectedVersion: closed.version },
      }),
    ).rejects.toThrow('ACCOUNT_CLOSED');
  });

  it('enforces one active default per owner', async () => {
    const first = await create();
    const second = await create();
    const defaults = await pool.query<{ id: string }>(
      'select id from public.accounts where user_id=$1 and is_default',
      [owner.userId],
    );
    expect(defaults.rows.map((row) => row.id)).toEqual([second.account.id]);
    expect(first.account.id).not.toBe(second.account.id);
  });
});
