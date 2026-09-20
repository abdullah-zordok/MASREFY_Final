import { randomUUID } from 'node:crypto';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('payment match live invariants', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const owner = `match_live_${randomUUID()}`;
  const transactionId = randomUUID();
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [owner]);
      for (const name of ['One', 'Two'])
        await client.query(
          `insert into public.obligations(user_id,name,direction,type,schedule_kind,currency_code,principal_minor,installment_amount_minor,installment_count,frequency,expected_day,start_date,automatic_matching_enabled,provider_keywords)
      values($1,$2,'payable','installment','fixed_term','SAR',100,100,1,'monthly',1,current_date,true,array['merchant'])`,
          [owner, name],
        );
      await client.query(
        "insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,merchant,occurred_at) values($1,$2,'expense','confirmed',100,'SAR','Bill','Merchant',clock_timestamp())",
        [transactionId, owner],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());

  it('proposes zero/one/multiple deterministically and retries without duplicates', async () => {
    const calls = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        pool.query('select * from private.propose_payment_matches($1,$2)', [transactionId, 10]),
      ),
    );
    expect(calls.every(({ status }) => status === 'fulfilled')).toBe(true);
    const matches = await pool.query<{ id: string; evidence: Record<string, unknown> }>(
      'select id,evidence from public.payment_matches where transaction_id=$1 order by obligation_id',
      [transactionId],
    );
    expect(matches.rows).toHaveLength(2);
    expect(
      matches.rows.every(
        ({ evidence }) => !JSON.stringify(evidence).toLowerCase().includes('merchant'),
      ),
    ).toBe(true);
    const unmatched = randomUUID();
    await pool.query(
      "insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values($1,$2,'expense','confirmed',999,'USD','None',clock_timestamp())",
      [unmatched, owner],
    );
    await pool.query('select * from private.propose_payment_matches($1,$2)', [unmatched, 10]);
    expect(
      (
        await pool.query<{ count: string }>(
          'select count(*)::text count from public.payment_matches where transaction_id=$1',
          [unmatched],
        )
      ).rows[0]?.count,
    ).toBe('0');
  });

  it('allows exactly one concurrent terminal decision', async () => {
    const match = (
      await pool.query<{ id: string }>(
        'select id from public.payment_matches where transaction_id=$1 order by id limit 1',
        [transactionId],
      )
    ).rows[0]?.id as string;
    const body = {
      decision: 'rejected',
      matchId: match,
      expectedVersion: 1,
      allocation: null,
      operationId: randomUUID(),
      requestId: 'match-live-reject',
    };
    const calls = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        pool.query('select private.decide_payment_match($1,$2::jsonb)', [
          owner,
          JSON.stringify({ ...body, operationId: randomUUID() }),
        ]),
      ),
    );
    expect(calls.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await pool.query<{ status: string; version: string }>(
          'select status,version::text from public.payment_matches where id=$1',
          [match],
        )
      ).rows[0],
    ).toEqual({ status: 'rejected', version: '2' });
  });

  it('returns owned match detail and rejects another owner match', async () => {
    const ownedMatch = (
      await pool.query<{ id: string }>(
        "select id from public.payment_matches where transaction_id=$1 and status='proposed' order by id limit 1",
        [transactionId],
      )
    ).rows[0]?.id as string;
    const detail = await repository.getPaymentMatch(
      { userId: owner, sessionId: 'session', factorAgeSeconds: 0 },
      ownedMatch,
      'owned-match-detail',
    );
    const transaction = detail.transaction;
    const candidate = detail.candidate;
    if (!transaction || typeof transaction !== 'object' || !('id' in transaction)) {
      throw new Error('Expected payment match transaction details');
    }
    if (!candidate || typeof candidate !== 'object' || !('id' in candidate)) {
      throw new Error('Expected payment match candidate details');
    }
    expect(transaction.id).toBe(transactionId);
    expect(typeof candidate.id).toBe('string');

    const outsider = `match_outsider_${randomUUID()}`;
    const outsiderTransaction = randomUUID();
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [outsider]);
    await pool.query(
      `insert into public.obligations(user_id,name,direction,type,schedule_kind,currency_code,principal_minor,installment_amount_minor,installment_count,frequency,expected_day,start_date,automatic_matching_enabled,provider_keywords)
       values($1,'Other','payable','installment','fixed_term','SAR',100,100,1,'monthly',1,current_date,true,array['other'])`,
      [outsider],
    );
    await pool.query(
      "insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values($1,$2,'expense','confirmed',100,'SAR','Other',clock_timestamp())",
      [outsiderTransaction, outsider],
    );
    await pool.query('select * from private.propose_payment_matches($1,$2)', [
      outsiderTransaction,
      10,
    ]);
    const outsiderMatch = (
      await pool.query<{ id: string }>(
        'select id from public.payment_matches where transaction_id=$1 limit 1',
        [outsiderTransaction],
      )
    ).rows[0]?.id as string;

    await expect(
      repository.getPaymentMatch(
        { userId: owner, sessionId: 'session', factorAgeSeconds: 0 },
        outsiderMatch,
        'foreign-match-detail',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
