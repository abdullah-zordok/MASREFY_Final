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
  const accountId = randomUUID();
  async function command(userId: string, body: Record<string, unknown>) {
    return pool.query<{ result: Record<string, unknown> }>(
      'select private.allocate_obligation_payment($1,$2::jsonb) result',
      [userId, JSON.stringify(body)],
    );
  }
  async function seedLinkedPayment(label: string) {
    const linkedObligationId = randomUUID();
    const linkedScheduleItemId = randomUUID();
    const linkedPaymentId = randomUUID();
    const created = await pool.query<{ result: { transactionId: string } }>(
      'select private.post_transaction($1,$2::jsonb) result',
      [
        owner,
        JSON.stringify({
          kind: 'expense',
          amountMinor: '100',
          currency: 'SAR',
          accountId,
          categoryId: null,
          title: `Lifecycle ${label}`,
          merchant: null,
          paymentMethod: null,
          note: null,
          occurredAt: new Date().toISOString(),
          source: 'manual',
          externalRef: null,
        }),
      ],
    );
    const linkedTransactionId = created.rows[0]?.result.transactionId;

    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `insert into public.obligations(id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,installment_amount_minor,installment_count,frequency,expected_day,start_date)
         values($1,$2,'Lifecycle loan','payable','installment','fixed_term','SAR',100,100,1,'monthly',1,current_date)`,
        [linkedObligationId, owner],
      );
      await client.query(
        `insert into public.obligation_schedule_items(id,user_id,obligation_id,due_at,amount_minor,sequence_no)
         values($1,$2,$3,current_date+interval '1 month',100,1)`,
        [linkedScheduleItemId, owner, linkedObligationId],
      );
      await client.query('commit');
    });
    await command(owner, {
      operation: 'record',
      obligationId: linkedObligationId,
      paymentId: linkedPaymentId,
      transactionId: linkedTransactionId,
      expectedVersion: 1,
      paymentMethod: null,
      paymentCase: 'full',
      allocationIntent: 'current',
      source: 'manual',
      allocations: [{ scheduleItemId: linkedScheduleItemId, amountMinor: '100' }],
      operationId: randomUUID(),
      requestId: `payment-ledger-${label}`,
    });

    return { linkedObligationId, linkedScheduleItemId, linkedPaymentId, linkedTransactionId };
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
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Payment lifecycle','cash','SAR')",
        [accountId, owner],
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

  it('retains authorized prepayment excess without overfilling and reverses its schedule projection', async () => {
    const prepaymentObligationId = randomUUID();
    const prepaymentScheduleItemId = randomUUID();
    const prepaymentTransactionId = randomUUID();
    const prepaymentPaymentId = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `insert into public.obligations(id,user_id,name,direction,type,schedule_kind,currency_code,principal_minor,installment_amount_minor,installment_count,frequency,expected_day,start_date)
         values($1,$2,'Prepayment loan','payable','installment','fixed_term','SAR',100,100,1,'monthly',1,current_date)`,
        [prepaymentObligationId, owner],
      );
      await client.query(
        `insert into public.obligation_schedule_items(id,user_id,obligation_id,due_at,amount_minor,sequence_no)
         values($1,$2,$3,current_date+interval '1 month',100,1)`,
        [prepaymentScheduleItemId, owner, prepaymentObligationId],
      );
      await client.query(
        `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at)
         values($1,$2,'expense','confirmed',150,'SAR','Authorized prepayment',clock_timestamp())`,
        [prepaymentTransactionId, owner],
      );
      await client.query('commit');
    });

    await command(owner, {
      operation: 'record',
      obligationId: prepaymentObligationId,
      paymentId: prepaymentPaymentId,
      transactionId: prepaymentTransactionId,
      expectedVersion: 1,
      paymentMethod: null,
      paymentCase: 'over',
      allocationIntent: 'prepayment',
      source: 'manual',
      allocations: [{ scheduleItemId: prepaymentScheduleItemId, amountMinor: '150' }],
      operationId: randomUUID(),
      requestId: 'payment-live-explicit-prepayment',
    });

    const state = await pool.query<{
      payment_amount: string;
      principal_reduction: string;
      settlement_adjustment: string;
      allocated: string;
      paid: string;
      schedule_status: string;
    }>(
      `select p.amount_minor::text payment_amount,
         p.principal_reduction_minor::text principal_reduction,
         p.settlement_adjustment_minor::text settlement_adjustment,
         (select sum(a.amount_minor)::text from public.obligation_payment_allocations a where a.payment_id=p.id) allocated,
         i.paid_minor::text paid,i.status schedule_status
       from public.obligation_payments p
       join public.obligation_schedule_items i on i.obligation_id=p.obligation_id
       where p.id=$1`,
      [prepaymentPaymentId],
    );
    expect(state.rows[0]).toEqual({
      payment_amount: '150',
      principal_reduction: '50',
      settlement_adjustment: '0',
      allocated: '150',
      paid: '100',
      schedule_status: 'paid',
    });

    const reversed = await command(owner, {
      operation: 'reverse',
      obligationId: prepaymentObligationId,
      paymentId: prepaymentPaymentId,
      expectedVersion: 1,
      operationId: randomUUID(),
      requestId: 'payment-live-explicit-prepayment-reverse',
    });
    expect(reversed.rows[0]?.result).toMatchObject({ status: 'reversed' });
    const reversedState = await pool.query<{
      paid: string;
      schedule_status: string;
    }>(
      `select paid_minor::text paid,status schedule_status
       from public.obligation_schedule_items
       where id=$1`,
      [prepaymentScheduleItemId],
    );
    expect(reversedState.rows[0]).toEqual({ paid: '0', schedule_status: 'due' });
  });

  it('rejects duplicate, foreign, currency, stale, and implicit excess attempts without partial effects', async () => {
    const countBefore = await pool.query<{ count: string }>(
      'select count(*)::text count from public.obligation_payments where user_id=$1',
      [owner],
    );
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
    expect(count.rows[0]?.count).toBe(countBefore.rows[0]?.count);
  });

  it.each(['reversed', 'deleted'] as const)(
    'invalidates the linked payment and its schedule projection when the ledger transaction is %s',
    async (transactionStatus) => {
      const { linkedTransactionId } = await seedLinkedPayment(transactionStatus);

      if (transactionStatus === 'reversed') {
        await pool.query('select private.reverse_transaction($1,$2::uuid,1,clock_timestamp(),$3)', [
          owner,
          linkedTransactionId,
          'Linked payment reversal',
        ]);
      } else {
        await pool.query('select private.soft_delete_transaction($1,$2::uuid,1,$3)', [
          owner,
          linkedTransactionId,
          'Linked payment deletion',
        ]);
      }

      const state = await pool.query<{
        transaction_status: string;
        payment_status: string;
        paid_minor: string;
        schedule_status: string;
        allocated_minor: string;
        obligation_paid_minor: string;
        remaining_minor: string;
        allocation_count: string;
      }>(
        `select t.status transaction_status,p.status payment_status,i.paid_minor::text,
           i.status schedule_status,s.allocated_minor::text,
           s.paid_minor::text obligation_paid_minor,s.remaining_minor::text,
           (select count(*)::text from public.obligation_payment_allocations a where a.payment_id=p.id) allocation_count
         from public.transactions t
         join public.obligation_payments p on p.transaction_id=t.id
         join public.obligation_schedule_items i on i.obligation_id=p.obligation_id
         join public.v_obligation_status s on s.obligation_id=p.obligation_id
         where t.id=$1`,
        [linkedTransactionId],
      );
      expect(state.rows[0]).toEqual({
        transaction_status: transactionStatus,
        payment_status: 'reversed',
        paid_minor: '0',
        schedule_status: 'due',
        allocated_minor: '0',
        obligation_paid_minor: '0',
        remaining_minor: '100',
        allocation_count: '1',
      });
    },
  );

  it('uses one lock order for concurrent ledger and manual payment reversal', async () => {
    const { linkedObligationId, linkedPaymentId, linkedTransactionId } =
      await seedLinkedPayment('concurrent-reversal');

    await pool.withClient(async (manualClient) => {
      await manualClient.query('begin');
      try {
        await manualClient.query('select id from public.obligations where id=$1 for update', [
          linkedObligationId,
        ]);

        let publishLedgerPid!: (pid: number) => void;
        const ledgerPid = new Promise<number>((resolve) => {
          publishLedgerPid = resolve;
        });
        const ledgerReversal = pool.withClient(async (ledgerClient) => {
          await ledgerClient.query('begin');
          const pid = await ledgerClient.query<{ pid: number }>('select pg_backend_pid() pid');
          const backendPid = pid.rows[0]?.pid;
          if (backendPid === undefined) throw new Error('LEDGER_BACKEND_PID_MISSING');
          publishLedgerPid(backendPid);
          try {
            const result = await ledgerClient.query(
              'select private.reverse_transaction($1,$2::uuid,1,clock_timestamp(),$3)',
              [owner, linkedTransactionId, 'Concurrent linked payment reversal'],
            );
            await ledgerClient.query('commit');
            return result;
          } catch (error) {
            await ledgerClient.query('rollback');
            throw error;
          }
        });

        const pid = await ledgerPid;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const activity = await pool.query<{ wait_event_type: string | null }>(
            'select wait_event_type from pg_stat_activity where pid=$1',
            [pid],
          );
          if (activity.rows[0]?.wait_event_type === 'Lock') break;
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (attempt === 99) throw new Error('LEDGER_REVERSAL_DID_NOT_WAIT_FOR_LOCK');
        }

        await manualClient.query('select private.allocate_obligation_payment($1,$2::jsonb)', [
          owner,
          JSON.stringify({
            operation: 'reverse',
            obligationId: linkedObligationId,
            paymentId: linkedPaymentId,
            expectedVersion: 1,
            operationId: randomUUID(),
            requestId: 'payment-manual-concurrent-reversal',
          }),
        ]);
        await manualClient.query('commit');
        await expect(ledgerReversal).resolves.toBeDefined();
      } catch (error) {
        await manualClient.query('rollback');
        throw error;
      }
    });

    const state = await pool.query<{ transaction_status: string; payment_status: string }>(
      `select t.status transaction_status,p.status payment_status
       from public.transactions t
       join public.obligation_payments p on p.transaction_id=t.id
       where t.id=$1`,
      [linkedTransactionId],
    );
    expect(state.rows[0]).toEqual({ transaction_status: 'reversed', payment_status: 'reversed' });
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
