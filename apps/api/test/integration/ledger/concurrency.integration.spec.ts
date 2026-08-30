import { randomUUID } from 'node:crypto';

import { hashIdempotencyKey, hashNormalizedCommand } from '../../../src/ledger/idempotency';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('ledger concurrency and idempotency stress', () => {
  type MutationResponse = { transaction: { transaction: { id: string } } };

  const owner = {
    userId: `ledger_stress_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const [cashAccountId, bankAccountId, feeAccountId] = [randomUUID(), randomUUID(), randomUUID()];
  const pool = createLivePool();
  const repository = new LedgerRepository(pool);
  const expense = (accountId: string, amountMinor: number, title: string) => ({
    kind: 'expense',
    amountMinor,
    currency: 'SAR',
    accountId,
    categoryId: null,
    title,
    merchant: null,
    paymentMethod: null,
    note: null,
    occurredAt: '2026-08-30T08:00:00.000Z',
    source: 'manual',
    externalRef: null,
  });
  const create = (key: string, command: Record<string, unknown>) =>
    repository.mutate({
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal: owner,
      idempotencyKey: key,
      requestId: `req-${key}`,
      status: 201,
      command,
    }) as Promise<MutationResponse>;
  const transfer = (key: string, command: Record<string, unknown>) =>
    repository.mutate({
      operation: 'transfer',
      scope: 'ledger.transfer.create',
      principal: owner,
      idempotencyKey: key,
      requestId: `req-${key}`,
      status: 201,
      command,
    }) as Promise<MutationResponse>;

  const errorCode = (reason: unknown): string | undefined => {
    if (typeof reason !== 'object' || reason === null) return undefined;
    const response = (reason as { response?: unknown }).response;
    if (typeof response !== 'object' || response === null) return undefined;
    const code = (response as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  };

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [
        owner.userId,
      ]);
      await client.query(
        `insert into public.accounts(id,user_id,name,type,currency_code) values
          ($1,$4,'Cash','cash','SAR'),($2,$4,'Bank','bank','SAR'),($3,$4,'Fees','cash','SAR')`,
        [cashAccountId, bankAccountId, feeAccountId, owner.userId],
      );
      await client.query('commit');
    });
  });

  afterAll(() => pool.onModuleDestroy());

  async function expectReconstructedBalances(): Promise<void> {
    const rows = await pool.query<{ confirmed_minor: string; derived_minor: string }>(
      `select coalesce(b.confirmed_minor,0)::text confirmed_minor,
          coalesce(sum(p.amount_minor) filter(where p.clearing_state='confirmed'),0)::bigint::text derived_minor
       from public.accounts a left join public.account_balances b on b.account_id=a.id
       left join public.transaction_postings p on p.account_id=a.id
       where a.id=any($1::uuid[]) group by a.id,b.confirmed_minor`,
      [[cashAccountId, bankAccountId, feeAccountId]],
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.every((row) => row.confirmed_minor === row.derived_minor)).toBe(true);
  }

  it('returns one stored response for concurrent duplicate replay and an ambiguous client retry after restart', async () => {
    const key = 'stress-duplicate-key';
    const command = expense(cashAccountId, 31, 'Duplicate');
    const settled = await Promise.allSettled(
      Array.from({ length: 12 }, () => create(key, command)),
    );
    expect(settled.every(({ status }) => status === 'fulfilled')).toBe(true);
    const responses = settled.map(
      (result) => (result as PromiseFulfilledResult<MutationResponse>).value,
    );
    expect(responses).toEqual(Array.from({ length: responses.length }, () => responses[0]));
    const restarted = new LedgerRepository(pool);
    expect(
      await restarted.mutate({
        operation: 'createTransaction',
        scope: 'ledger.transaction.create',
        principal: owner,
        idempotencyKey: key,
        requestId: `req-${key}`,
        status: 201,
        command,
      }),
    ).toEqual(responses[0]);
    const evidence = await pool.query<{ headers: string; postings: string; keys: string }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1 and title='Duplicate') headers,
        (select count(*)::text from public.transaction_postings p join public.transactions t on t.id=p.transaction_id where t.user_id=$1 and t.title='Duplicate') postings,
        (select count(*)::text from private.idempotency_keys where actor_id=$1 and scope='ledger.transaction.create' and key_hash=$2 and state='completed') keys`,
      [owner.userId, hashIdempotencyKey(key)],
    );
    expect(evidence.rows[0]).toEqual({ headers: '1', postings: '1', keys: '1' });
  });

  it('reports active claims and safely reclaims expired claims without changing the request identity', async () => {
    const key = 'stress-expired-claim';
    const command = expense(cashAccountId, 32, 'Lease');
    const keyHash = hashIdempotencyKey(key);
    const requestHash = hashNormalizedCommand(command);
    const claim = async () =>
      pool.withClient(async (client) => {
        await client.query('begin');
        await client.query('set local role masarifi_migration');
        const result = await client.query<{ outcome: string }>(
          'select outcome from private.claim_idempotency_key($1,$2,$3,$4,$5::interval)',
          [owner.userId, 'ledger.transaction.create', keyHash, requestHash, '2 minutes'],
        );
        await client.query('commit');
        return result.rows[0]?.outcome;
      });

    expect(await claim()).toBe('new');
    expect(await claim()).toBe('in_progress');
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        'update private.idempotency_keys set locked_until=created_at where actor_id=$1 and scope=$2 and key_hash=$3',
        [owner.userId, 'ledger.transaction.create', keyHash],
      );
      await client.query('commit');
    });
    expect(await claim()).toBe('new');
    const row = await pool.query<{ request_hash: string; state: string; headers: string }>(
      `select k.request_hash,k.state,
          (select count(*)::text from public.transactions where user_id=$1 and title='Lease') headers
       from private.idempotency_keys k where k.actor_id=$1 and k.scope='ledger.transaction.create' and k.key_hash=$2`,
      [owner.userId, keyHash],
    );
    expect(row.rows[0]).toEqual({ request_hash: requestHash, state: 'claimed', headers: '0' });
  });

  it('serializes bounded same-account writes and rejects same-account transfers without partial effects', async () => {
    const writes = Array.from({ length: 6 }, (_, index) =>
      create(
        `stress-same-account-${String(index)}`,
        expense(cashAccountId, index + 1, `Same ${String(index)}`),
      ),
    );
    const settledWrites = await Promise.allSettled(writes);
    expect(settledWrites.every(({ status }) => status === 'fulfilled')).toBe(true);
    expect(
      new Set(
        settledWrites.map(
          (result) =>
            (result as PromiseFulfilledResult<MutationResponse>).value.transaction.transaction.id,
        ),
      ).size,
    ).toBe(writes.length);
    const before = await pool.query<{ headers: string; postings: string; keys: string }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1) headers,
        (select count(*)::text from public.transaction_postings p join public.transactions t on t.id=p.transaction_id where t.user_id=$1) postings,
        (select count(*)::text from private.idempotency_keys where actor_id=$1) keys`,
      [owner.userId],
    );
    const invalid = {
      sourceAccountId: cashAccountId,
      destinationAccountId: cashAccountId,
      amountMinor: 1,
      currency: 'SAR',
      feeMinor: 0,
      feeAccountId,
      occurredAt: '2026-08-30T08:00:00.000Z',
      title: 'Invalid',
      note: null,
    };
    const rejected = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        transfer(`stress-same-transfer-${String(index)}`, invalid),
      ),
    );
    expect(rejected.every(({ status }) => status === 'rejected')).toBe(true);
    expect(
      rejected.every(
        (result) => errorCode((result as PromiseRejectedResult).reason) === 'VALIDATION_FAILED',
      ),
    ).toBe(true);
    const after = await pool.query<{ headers: string; postings: string; keys: string }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1) headers,
        (select count(*)::text from public.transaction_postings p join public.transactions t on t.id=p.transaction_id where t.user_id=$1) postings,
        (select count(*)::text from private.idempotency_keys where actor_id=$1) keys`,
      [owner.userId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    await expectReconstructedBalances();
  });

  it('completes opposite-direction transfers without deadlocks, lost postings, or partial balances', async () => {
    const jobs = Array.from({ length: 4 }, (_, index) => [
      transfer(`stress-forward-${String(index)}`, {
        sourceAccountId: cashAccountId,
        destinationAccountId: bankAccountId,
        amountMinor: 10,
        currency: 'SAR',
        feeMinor: 0,
        feeAccountId,
        occurredAt: '2026-08-30T08:00:00.000Z',
        title: `Forward ${String(index)}`,
        note: null,
      }),
      transfer(`stress-reverse-${String(index)}`, {
        sourceAccountId: bankAccountId,
        destinationAccountId: cashAccountId,
        amountMinor: 10,
        currency: 'SAR',
        feeMinor: 0,
        feeAccountId,
        occurredAt: '2026-08-30T08:00:00.000Z',
        title: `Reverse ${String(index)}`,
        note: null,
      }),
    ]).flat();
    expect((await Promise.allSettled(jobs)).every(({ status }) => status === 'fulfilled')).toBe(
      true,
    );
    const count = await pool.query<{ headers: string; postings: string }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1 and kind='transfer') headers,
        (select count(*)::text from public.transaction_postings p join public.transactions t on t.id=p.transaction_id where t.user_id=$1 and t.kind='transfer') postings`,
      [owner.userId],
    );
    expect(count.rows[0]).toEqual({ headers: '8', postings: '16' });
    await expectReconstructedBalances();
  });

  it('permits exactly one refund-or-reversal outcome per original and one stale-version writer', async () => {
    const originals: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const created = await create(
        `stress-race-create-${String(index)}`,
        expense(cashAccountId, 100, `Race ${String(index)}`),
      );
      originals.push(created.transaction.transaction.id);
    }
    for (const [index, transactionId] of originals.entries()) {
      const settled = await Promise.allSettled([
        repository.mutate({
          operation: 'refundTransaction',
          scope: 'ledger.transaction.refund',
          principal: owner,
          idempotencyKey: `stress-refund-${String(index)}`,
          requestId: `req-stress-refund-${String(index)}`,
          status: 201,
          command: {
            transactionId,
            expectedVersion: 1,
            amountMinor: 60,
            accountId: cashAccountId,
            occurredAt: '2026-08-30T08:00:00.000Z',
            reason: 'Stress',
          },
        }),
        repository.mutate({
          operation: 'reverseTransaction',
          scope: 'ledger.transaction.reverse',
          principal: owner,
          idempotencyKey: `stress-reverse-${String(index)}`,
          requestId: `req-stress-reverse-${String(index)}`,
          status: 201,
          command: {
            transactionId,
            expectedVersion: 1,
            occurredAt: '2026-08-30T08:00:00.000Z',
            reason: 'Stress',
          },
        }),
      ]);
      expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(
        (settled.find(({ status }) => status === 'rejected') as PromiseRejectedResult).reason,
      ).toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
    }
    const stale = await create('stress-stale-create', expense(cashAccountId, 75, 'Stale'));
    const staleId = stale.transaction.transaction.id;
    const revisions = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        repository.mutate({
          operation: 'reviseTransaction',
          scope: 'ledger.transaction.revise',
          principal: owner,
          idempotencyKey: `stress-stale-${String(index)}`,
          requestId: `req-stress-stale-${String(index)}`,
          status: 200,
          command: {
            transactionId: staleId,
            expectedVersion: 1,
            reason: 'Stress',
            patch: { title: `Winner ${String(index)}` },
          },
        }),
      ),
    );
    expect(revisions.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(
      revisions
        .filter(({ status }) => status === 'rejected')
        .every(
          (result) => errorCode((result as PromiseRejectedResult).reason) === 'VERSION_CONFLICT',
        ),
    ).toBe(true);
    const evidence = await pool.query<{ dependents: string; version: string; revisions: string }>(
      `select
        (select count(*)::text from public.transactions where reverses_transaction_id=any($1::uuid[])) dependents,
        (select version::text from public.transactions where id=$2) version,
        (select count(*)::text from audit.transaction_revisions where transaction_id=$2) revisions`,
      [originals, staleId],
    );
    expect(evidence.rows[0]).toEqual({ dependents: '6', version: '2', revisions: '2' });
    await expectReconstructedBalances();
  });
});
