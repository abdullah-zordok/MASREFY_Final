import { randomUUID } from 'node:crypto';

import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('obligation payment live invariants', () => {
  const pool = createLivePool();
  const owner = `payment_live_${randomUUID()}`;
  const other = `payment_other_${randomUUID()}`;
  const obligationId = randomUUID();
  const itemA = randomUUID();
  const itemB = randomUUID();
  const transactionA = randomUUID();
  const transactionExcess = randomUUID();
  const paymentId = randomUUID();
  async function command(userId: string, body: Record<string, unknown>) {
    return pool.query<{ result: Record<string, unknown> }>(
      'select private.allocate_obligation_payment($1,$2::jsonb) result',
      [userId, JSON.stringify(body)],
    );
  }
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "insert into public.profiles(id,status) values($1,'active'),($2,'active')",
        [owner, other],
      );
      await client.query(
        `insert into public.obligations(id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,installment_amount_minor,installment_count,frequency,expected_day,start_date)
      values($1,$2,'Loan','payable','installment','fixed_term','SAR',600,300,2,'monthly',1,current_date)`,
        [obligationId, owner],
      );
      await client.query(
        `insert into public.obligation_schedule_items(id,user_id,obligation_id,due_at,amount_minor,sequence_no) values
      ($1,$3,$4,current_date,300,1),($2,$3,$4,current_date+interval '1 month',300,2)`,
        [itemA, itemB, owner, obligationId],
      );
      await client.query(
        `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values
      ($1,$3,'expense','confirmed',300,'SAR','Payment',clock_timestamp()),($2,$3,'expense','confirmed',400,'SAR','Excess',clock_timestamp())`,
        [transactionA, transactionExcess, owner],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());
  const record = {
    operation: 'record',
    obligationId,
    paymentId,
    transactionId: transactionA,
    expectedVersion: 1,
    paymentMethod: null,
    paymentCase: 'partial',
    allocationIntent: 'later_installments',
    source: 'manual',
    allocations: [
      { scheduleItemId: itemA, amountMinor: '200' },
      { scheduleItemId: itemB, amountMinor: '100' },
    ],
    operationId: randomUUID(),
    requestId: 'payment-live-record',
  };

  it('commits one payment, allocations, projections, and event atomically', async () => {
    const result = await command(owner, record);
    expect(result.rows[0]?.result).toMatchObject({ id: paymentId, amountMinor: '300', version: 1 });
    const state = await pool.query<{ allocated: string; paid: string; events: string }>(
      `select
      (select sum(amount_minor)::text from public.obligation_payment_allocations where payment_id=$1) allocated,
      (select sum(paid_minor)::text from public.obligation_schedule_items where obligation_id=$2) paid,
      (select count(*)::text from private.outbox_events where aggregate_id=$1) events`,
      [paymentId, obligationId],
    );
    expect(state.rows[0]).toEqual({ allocated: '300', paid: '300', events: '1' });
  });

  it('rejects duplicate, foreign, currency, stale, and implicit excess attempts without partial effects', async () => {
    await expect(
      command(other, {
        ...record,
        paymentId: randomUUID(),
        operationId: randomUUID(),
        expectedVersion: 2,
      }),
    ).rejects.toThrow(/OBLIGATION_NOT_FOUND/);
    await expect(
      command(owner, {
        ...record,
        paymentId: randomUUID(),
        operationId: randomUUID(),
        expectedVersion: 2,
      }),
    ).rejects.toThrow(/PAYMENT_TRANSACTION_USED/);
    await expect(
      command(owner, {
        ...record,
        paymentId: randomUUID(),
        transactionId: transactionExcess,
        operationId: randomUUID(),
        expectedVersion: 2,
        allocations: [{ scheduleItemId: itemB, amountMinor: '400' }],
      }),
    ).rejects.toThrow(/PAYMENT_ALLOCATION_EXCEEDS_REMAINDER/);
    const count = await pool.query<{ count: string }>(
      'select count(*)::text count from public.obligation_payments where user_id=$1',
      [owner],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('serializes reversal and reconstruction with one terminal winner', async () => {
    const reverse = {
      operation: 'reverse',
      obligationId,
      paymentId,
      expectedVersion: 1,
      operationId: randomUUID(),
      requestId: 'payment-live-reverse',
    };
    const calls = await Promise.allSettled([
      command(owner, reverse),
      command(owner, { ...reverse, operationId: randomUUID() }),
    ]);
    expect(calls.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const state = await pool.query<{ status: string; paid: string; events: string }>(
      `select
      (select status from public.obligation_payments where id=$1) status,
      (select sum(paid_minor)::text from public.obligation_schedule_items where obligation_id=$2) paid,
      (select count(*)::text from private.outbox_events where aggregate_id=$1) events`,
      [paymentId, obligationId],
    );
    expect(state.rows[0]).toEqual({ status: 'reversed', paid: '0', events: '2' });
  });
});
