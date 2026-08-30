import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('ledger financial invariants', () => {
  const owner = {
    userId: `ledger_invariants_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const accountIds = [randomUUID(), randomUUID(), randomUUID()];
  const overflowAccountId = randomUUID();
  const pool = createLivePool();
  const repository = new LedgerRepository(pool);

  const mutate = (key: string, command: Record<string, unknown>) =>
    repository.mutate({
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal: owner,
      idempotencyKey: key,
      requestId: `req-${key}`,
      status: 201,
      command,
    }) as Promise<{ transaction: { transaction: { id: string } } }>;

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [
        owner.userId,
      ]);
      await client.query(
        `insert into public.accounts(id,user_id,name,type,currency_code) values
          ($1,$4,'Cash','cash','SAR'),($2,$4,'Bank','bank','SAR'),($3,$4,'Wallet','wallet','SAR')`,
        [...accountIds, owner.userId],
      );
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Overflow','cash','SAR')",
        [overflowAccountId, owner.userId],
      );
      await client.query('commit');
    });
  });

  afterAll(() => pool.onModuleDestroy());

  it('reconstructs every randomized confirmed projection exactly from immutable postings', async () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };

    for (let index = 0; index < 24; index += 1) {
      const amountMinor = 1 + (next() % 1_000);
      const accountId = accountIds[next() % accountIds.length];
      if (!accountId) throw new Error('ACCOUNT_FIXTURE_MISSING');
      await mutate(`invariant-${String(index)}`, {
        kind: next() % 2 === 0 ? 'income' : 'expense',
        amountMinor,
        currency: 'SAR',
        accountId,
        categoryId: null,
        title: `Invariant ${String(index)}`,
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt: '2026-08-30T08:00:00.000Z',
        source: 'manual',
        externalRef: null,
      });
    }

    const reconstructed = await pool.query<{
      account_id: string;
      confirmed_minor: string;
      derived_confirmed_minor: string;
      pending_minor: string;
      derived_pending_minor: string;
    }>(
      `select b.account_id,b.confirmed_minor::text,b.pending_minor::text,
          coalesce(sum(p.amount_minor) filter(where p.clearing_state='confirmed'),0)::bigint::text derived_confirmed_minor,
          coalesce(sum(p.amount_minor) filter(where p.clearing_state='pending'),0)::bigint::text derived_pending_minor
       from public.account_balances b left join public.transaction_postings p on p.account_id=b.account_id
       where b.account_id=any($1::uuid[])
       group by b.account_id,b.confirmed_minor,b.pending_minor order by b.account_id`,
      [accountIds],
    );

    expect(reconstructed.rows).toHaveLength(accountIds.length);
    expect(
      reconstructed.rows.every(
        (row) =>
          row.confirmed_minor === row.derived_confirmed_minor &&
          row.pending_minor === row.derived_pending_minor,
      ),
    ).toBe(true);
    expect(reconstructed.rows.every((row) => row.pending_minor === '0')).toBe(true);
  });

  it('rejects an unsafe integer without any header, posting, projection, or idempotency effect', async () => {
    const before = await pool.query<{
      headers: string;
      postings: string;
      balance: string;
      keys: string;
    }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1) headers,
        (select count(*)::text from public.transaction_postings p join public.transactions t on t.id=p.transaction_id where t.user_id=$1) postings,
        (select coalesce(sum(confirmed_minor),0)::text from public.account_balances where account_id=any($2::uuid[])) balance,
        (select count(*)::text from private.idempotency_keys where actor_id=$1) keys`,
      [owner.userId, accountIds],
    );
    await expect(
      mutate('invariant-overflow', {
        kind: 'expense',
        amountMinor: Number.MAX_SAFE_INTEGER + 1,
        currency: 'SAR',
        accountId: accountIds[0],
        categoryId: null,
        title: 'Overflow',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt: '2026-08-30T08:00:00.000Z',
        source: 'manual',
        externalRef: null,
      }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    const after = await pool.query<{
      headers: string;
      postings: string;
      balance: string;
      keys: string;
    }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1) headers,
        (select count(*)::text from public.transaction_postings p join public.transactions t on t.id=p.transaction_id where t.user_id=$1) postings,
        (select coalesce(sum(confirmed_minor),0)::text from public.account_balances where account_id=any($2::uuid[])) balance,
        (select count(*)::text from private.idempotency_keys where actor_id=$1) keys`,
      [owner.userId, accountIds],
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('maps cumulative projection overflow and rolls back the entire second command', async () => {
    const command = (amountMinor: number) => ({
      kind: 'income',
      amountMinor,
      currency: 'SAR',
      accountId: overflowAccountId,
      categoryId: null,
      title: 'Projection boundary',
      merchant: null,
      paymentMethod: null,
      note: null,
      occurredAt: '2026-08-30T08:00:00.000Z',
      source: 'manual',
      externalRef: null,
    });
    await mutate('projection-max', command(Number.MAX_SAFE_INTEGER));
    await expect(mutate('projection-over', command(1))).rejects.toMatchObject({
      response: { code: 'AMOUNT_OUT_OF_RANGE' },
    });
    const evidence = await pool.query<{ headers: string; postings: string; balance: string }>(
      `select
        (select count(*)::text from public.transactions t join public.transaction_postings p on p.transaction_id=t.id where p.account_id=$1) headers,
        (select count(*)::text from public.transaction_postings where account_id=$1) postings,
        (select confirmed_minor::text from public.account_balances where account_id=$1) balance`,
      [overflowAccountId],
    );
    expect(evidence.rows[0]).toEqual({
      headers: '1',
      postings: '1',
      balance: String(Number.MAX_SAFE_INTEGER),
    });
  });
});
