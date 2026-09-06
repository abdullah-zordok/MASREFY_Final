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
    }) as Promise<{
      account: {
        id: string;
        version: number;
        status: string;
        automaticTrackingEnabled: boolean;
      };
    }>;
  const createCard = () =>
    repository.execute({
      operation: 'createAccount',
      principal: owner,
      requestId,
      query: {},
      params: {},
      body: {
        name: `Card ${runId.slice(0, 5)}`,
        type: 'credit_card',
        currency: 'SAR',
        institutionName: null,
        lastFour: '1234',
        creditLimitMinor: 200_000,
        statementDay: 7,
        paymentDueDay: 21,
        monthlyInterestRateBasisPoints: 125,
        minimumPaymentMinor: 5_000,
        isDefault: false,
        iconKey: null,
        colorKey: null,
        notes: null,
        sortOrder: 0,
        includeInTotals: true,
        openedAt: null,
      },
    }) as Promise<{
      account: {
        id: string;
        version: number;
        statementDay: number | null;
        paymentDueDay: number | null;
        monthlyInterestRateBasisPoints: number | null;
        minimumPaymentMinor: number | null;
      };
    }>;

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

  it('creates enabled by default and persists an audited opt-out update', async () => {
    const created = await create();
    expect(created.account.automaticTrackingEnabled).toBe(true);
    const updated = (await repository.execute({
      operation: 'updateAccount',
      principal: owner,
      requestId,
      query: {},
      params: { accountId: created.account.id },
      body: {
        expectedVersion: created.account.version,
        automaticTrackingEnabled: false,
      },
    })) as { automaticTrackingEnabled: boolean; version: number };
    expect(updated).toMatchObject({ automaticTrackingEnabled: false });
    await expect(
      pool.query<{ automatic_tracking_enabled: boolean }>(
        'select automatic_tracking_enabled from public.accounts where id=$1',
        [created.account.id],
      ),
    ).resolves.toMatchObject({ rows: [{ automatic_tracking_enabled: false }] });
    await expect(
      pool.query<{ changed_fields: string[] }>(
        `select payload->'changedFields' changed_fields
         from private.outbox_events
         where aggregate_id=$1 and event_type='account.updated'
         order by created_at desc limit 1`,
        [created.account.id],
      ),
    ).resolves.toMatchObject({ rows: [{ changed_fields: ['automaticTrackingEnabled'] }] });
  });

  it('persists card terms, hides them from another owner, and clears them on type change', async () => {
    const created = await createCard();
    expect(created.account).toMatchObject({
      statementDay: 7,
      paymentDueDay: 21,
      monthlyInterestRateBasisPoints: 125,
      minimumPaymentMinor: 5_000,
    });
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

    await repository.execute({
      operation: 'updateAccount',
      principal: owner,
      requestId,
      query: {},
      params: { accountId: created.account.id },
      body: {
        expectedVersion: created.account.version,
        type: 'bank',
        creditLimitMinor: null,
        statementDay: null,
        paymentDueDay: null,
        monthlyInterestRateBasisPoints: null,
        minimumPaymentMinor: null,
      },
    });
    await expect(
      pool.query(
        `select credit_limit_minor,statement_day,payment_due_day,
          monthly_interest_rate_basis_points,minimum_payment_minor
         from public.accounts where id=$1`,
        [created.account.id],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          credit_limit_minor: null,
          statement_day: null,
          payment_due_day: null,
          monthly_interest_rate_basis_points: null,
          minimum_payment_minor: null,
        },
      ],
    });
  });
});
