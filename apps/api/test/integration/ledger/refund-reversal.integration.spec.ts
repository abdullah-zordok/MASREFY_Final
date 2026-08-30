import { randomUUID } from 'node:crypto';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type LedgerResponse = {
  transaction: { transaction: { id: string }; postings: Array<{ amountMinor: number }> };
  balances: Array<{ confirmedMinor: number }>;
  original: { id: string; status: string };
};

describeLiveDatabase('refund and reversal compensation', () => {
  const owner = {
    userId: `ledger_comp_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const [expenseAccount, source, destination, fees] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const pool = createLivePool(),
    repository = new LedgerRepository(pool);
  let expenseId: string, transferId: string;
  const mutate = (
    operation: string,
    scope: string,
    key: string,
    status: number,
    command: Record<string, unknown>,
  ) =>
    repository.mutate({
      operation,
      scope,
      principal: owner,
      idempotencyKey: key,
      requestId: `req-${key}`,
      status,
      command,
    }) as Promise<LedgerResponse>;
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [
        owner.userId,
      ]);
      await client.query(
        `insert into public.accounts(id,user_id,name,type,currency_code) values($1,$5,'Expense','cash','SAR'),($2,$5,'Source','cash','SAR'),($3,$5,'Destination','cash','SAR'),($4,$5,'Fees','cash','SAR')`,
        [expenseAccount, source, destination, fees, owner.userId],
      );
      await client.query('commit');
    });
    const occurredAt = new Date().toISOString();
    const expense = await mutate(
      'createTransaction',
      'ledger.transaction.create',
      'comp-expense',
      201,
      {
        kind: 'expense',
        amountMinor: 1000,
        currency: 'SAR',
        accountId: expenseAccount,
        categoryId: null,
        title: 'Purchase',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt,
        source: 'manual',
        externalRef: null,
      },
    );
    expenseId = expense.transaction.transaction.id;
    const transfer = await mutate('transfer', 'ledger.transfer.create', 'comp-transfer', 201, {
      sourceAccountId: source,
      destinationAccountId: destination,
      amountMinor: 100,
      currency: 'SAR',
      feeMinor: 5,
      feeAccountId: fees,
      occurredAt,
      title: 'Move',
      note: null,
    });
    transferId = transfer.transaction.transaction.id;
  });
  afterAll(() => pool.onModuleDestroy());
  it('caps cumulative linked refunds exactly and preserves append-only effects', async () => {
    const occurredAt = new Date().toISOString();
    const first = await mutate(
      'refundTransaction',
      'ledger.transaction.refund',
      'refund-400',
      201,
      {
        transactionId: expenseId,
        expectedVersion: 1,
        amountMinor: 400,
        accountId: expenseAccount,
        occurredAt,
        reason: 'Partial',
      },
    );
    expect(first.original.id).toBe(expenseId);
    const second = await mutate(
      'refundTransaction',
      'ledger.transaction.refund',
      'refund-600',
      201,
      {
        transactionId: expenseId,
        expectedVersion: 2,
        amountMinor: 600,
        accountId: expenseAccount,
        occurredAt,
        reason: 'Remainder',
      },
    );
    expect(second.balances.at(0)?.confirmedMinor).toBe(0);
    await expect(
      mutate('refundTransaction', 'ledger.transaction.refund', 'refund-over', 201, {
        transactionId: expenseId,
        expectedVersion: 3,
        amountMinor: 1,
        accountId: expenseAccount,
        occurredAt,
        reason: 'Too much',
      }),
    ).rejects.toMatchObject({ response: { code: 'REFUND_EXCEEDS_AVAILABLE' } });
    const count = await pool.query<{ count: string }>(
      "select count(*)::text count from public.transactions where reverses_transaction_id=$1 and kind='refund'",
      [expenseId],
    );
    expect(count.rows[0]?.count).toBe('2');
  });
  it('does not let deleting a refund reopen the original refund allowance', async () => {
    const occurredAt = new Date().toISOString();
    const expense = await mutate(
      'createTransaction',
      'ledger.transaction.create',
      'delete-refund-expense',
      201,
      {
        kind: 'expense',
        amountMinor: 100,
        currency: 'SAR',
        accountId: expenseAccount,
        categoryId: null,
        title: 'Refund deletion guard',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt,
        source: 'manual',
        externalRef: null,
      },
    );
    const originalId = expense.transaction.transaction.id;
    const refund = await mutate(
      'refundTransaction',
      'ledger.transaction.refund',
      'delete-refund-first',
      201,
      {
        transactionId: originalId,
        expectedVersion: 1,
        amountMinor: 60,
        accountId: expenseAccount,
        occurredAt,
        reason: 'Partial',
      },
    );
    await expect(
      mutate('deleteTransaction', 'ledger.transaction.delete', 'delete-refund-attempt', 200, {
        transactionId: refund.transaction.transaction.id,
        expectedVersion: 1,
        reason: 'Unsafe allowance reset',
      }),
    ).rejects.toMatchObject({ response: { code: 'TRANSACTION_HAS_DEPENDENTS' } });
    await expect(
      mutate('refundTransaction', 'ledger.transaction.refund', 'delete-refund-second', 201, {
        transactionId: originalId,
        expectedVersion: 2,
        amountMinor: 60,
        accountId: expenseAccount,
        occurredAt,
        reason: 'Would exceed',
      }),
    ).rejects.toMatchObject({ response: { code: 'REFUND_EXCEEDS_AVAILABLE' } });
  });
  it('reverses every transfer posting including the fee exactly once', async () => {
    const reversed = await mutate(
      'reverseTransaction',
      'ledger.transaction.reverse',
      'reverse-transfer',
      201,
      {
        transactionId: transferId,
        expectedVersion: 1,
        occurredAt: new Date().toISOString(),
        reason: 'Duplicate',
      },
    );
    expect(reversed.original).toMatchObject({ id: transferId, status: 'reversed' });
    expect(
      reversed.transaction.postings
        .map((row: { amountMinor: number }) => row.amountMinor)
        .sort((a: number, b: number) => a - b),
    ).toEqual([-100, 5, 100]);
    expect(reversed.balances.map((row: { confirmedMinor: number }) => row.confirmedMinor)).toEqual([
      0, 0, 0,
    ]);
    const eventTypes = await pool.query<{ event_type: string }>(
      'select event_type from private.outbox_events where aggregate_id=any($1::uuid[]) order by event_type',
      [[reversed.transaction.transaction.id]],
    );
    expect(eventTypes.rows).toEqual([
      { event_type: 'balance.changed' },
      { event_type: 'transaction.reversed' },
    ]);
    await expect(
      mutate('reverseTransaction', 'ledger.transaction.reverse', 'reverse-again', 201, {
        transactionId: transferId,
        expectedVersion: 2,
        occurredAt: new Date().toISOString(),
        reason: 'Again',
      }),
    ).rejects.toMatchObject({ response: { code: 'REVERSAL_EXISTS' } });
  });
  it('serializes repeated refund-versus-reversal races to one compensating effect', async () => {
    for (let index = 0; index < 6; index += 1) {
      const occurredAt = new Date().toISOString();
      const created = await mutate(
        'createTransaction',
        'ledger.transaction.create',
        `race-create-${String(index)}`,
        201,
        {
          kind: 'expense',
          amountMinor: 100,
          currency: 'SAR',
          accountId: expenseAccount,
          categoryId: null,
          title: `Race ${String(index)}`,
          merchant: null,
          paymentMethod: null,
          note: null,
          occurredAt,
          source: 'manual',
          externalRef: null,
        },
      );
      const originalId = created.transaction.transaction.id;
      const settled = await Promise.allSettled([
        mutate(
          'refundTransaction',
          'ledger.transaction.refund',
          `race-refund-${String(index)}`,
          201,
          {
            transactionId: originalId,
            expectedVersion: 1,
            amountMinor: 60,
            accountId: expenseAccount,
            occurredAt,
            reason: 'Race',
          },
        ),
        mutate(
          'reverseTransaction',
          'ledger.transaction.reverse',
          `race-reverse-${String(index)}`,
          201,
          {
            transactionId: originalId,
            expectedVersion: 1,
            occurredAt,
            reason: 'Race',
          },
        ),
      ]);
      expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(
        (settled.find(({ status }) => status === 'rejected') as PromiseRejectedResult).reason,
      ).toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
      const dependents = await pool.query<{ count: string }>(
        'select count(*)::text count from public.transactions where reverses_transaction_id=$1',
        [originalId],
      );
      expect(dependents.rows[0]?.count).toBe('1');
    }
    const projection = await pool.query<{ matches: boolean }>(
      "select b.confirmed_minor=coalesce(sum(p.amount_minor) filter(where p.clearing_state='confirmed'),0)::bigint matches from public.account_balances b left join public.transaction_postings p on p.account_id=b.account_id where b.account_id=$1 group by b.account_id,b.confirmed_minor",
      [expenseAccount],
    );
    expect(projection.rows[0]?.matches).toBe(true);
  });
});
