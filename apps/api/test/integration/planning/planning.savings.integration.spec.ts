import { randomUUID } from 'node:crypto';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('savings planning live invariants', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const owner = `savings_live_${randomUUID()}`;
  const other = `savings_other_${randomUUID()}`;
  const goalId = randomUUID();
  const accountId = randomUUID();
  const contributionTx = randomUUID();
  const withdrawalTx = randomUUID();
  const overdraftTx = randomUUID();
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "insert into public.profiles(id,status) values($1,'active'),($2,'active')",
        [owner, other],
      );
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Savings','bank','SAR')",
        [accountId, owner],
      );
      await client.query(
        "insert into public.savings_goals(id,user_id,name,currency_code,target_minor,opening_tracked_minor,linked_account_id) values($1,$2,'Emergency','SAR',1000,100,$3)",
        [goalId, owner, accountId],
      );
      await client.query(
        `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values
      ($1,$4,'income','confirmed',500,'SAR','Contribution',clock_timestamp()),
      ($2,$4,'expense','confirmed',200,'SAR','Withdrawal',clock_timestamp()),
      ($3,$4,'expense','confirmed',700,'SAR','Overdraft',clock_timestamp())`,
        [contributionTx, withdrawalTx, overdraftTx, owner],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());
  const principal = { userId: owner, sessionId: 'session', factorAgeSeconds: 0 };

  it('records contribution and withdrawal once through durable replay and derives progress', async () => {
    const contribution = {
      operation: 'recordSavingsMovement',
      scope: 'planning.savings-movement.record',
      status: 201,
      principal,
      command: {
        goalId,
        transactionId: contributionTx,
        expectedVersion: 1,
        kind: 'contribution',
        amountMinor: '500',
        replacesMovementId: null,
      },
      idempotencyKey: 'savings-live-contribution1',
      requestId: 'savings-live-contribution',
    };
    const first = await repository.mutate(contribution);
    await expect(repository.mutate(contribution)).resolves.toEqual(first);
    const withdrawal = {
      ...contribution,
      command: {
        goalId,
        transactionId: withdrawalTx,
        expectedVersion: 2,
        kind: 'withdrawal',
        amountMinor: '-200',
        replacesMovementId: null,
      },
      idempotencyKey: 'savings-live-withdrawal-key',
      requestId: 'savings-live-withdrawal',
    };
    await repository.mutate(withdrawal);
    await expect(
      repository.getSavingsGoal(principal, goalId, 'savings-detail'),
    ).resolves.toMatchObject({ progressMinor: '400', remainingMinor: '600' });
  });

  it('rejects overdraft, ownership, currency/sign, and stale attempts without partial rows', async () => {
    const body = {
      goalId,
      movementId: randomUUID(),
      transactionId: overdraftTx,
      expectedVersion: 3,
      kind: 'withdrawal',
      amountMinor: '-700',
      replacesMovementId: null,
      operationId: randomUUID(),
      requestId: 'savings-live-overdraft',
    };
    await expect(
      pool.query('select private.record_savings_movement($1,$2::jsonb)', [
        owner,
        JSON.stringify(body),
      ]),
    ).rejects.toThrow(/PLANNING_PROGRESS_INSUFFICIENT/);
    await expect(
      pool.query('select private.record_savings_movement($1,$2::jsonb)', [
        other,
        JSON.stringify(body),
      ]),
    ).rejects.toThrow(/SAVINGS_GOAL_NOT_FOUND/);
    expect(
      (
        await pool.query<{ count: string }>(
          'select count(*)::text count from public.savings_goal_movements where goal_id=$1',
          [goalId],
        )
      ).rows[0]?.count,
    ).toBe('2');
  });

  it('allows one concurrent compensating reversal and reconstructs exact progress', async () => {
    const movement = (
      await pool.query<{ id: string }>(
        'select id from public.savings_goal_movements where goal_id=$1 and kind=$2',
        [goalId, 'withdrawal'],
      )
    ).rows[0]?.id as string;
    const calls = await Promise.allSettled(
      [randomUUID(), randomUUID()].map((operation) =>
        pool.query('select private.reverse_savings_movement($1,$2,$3,$4)', [
          owner,
          movement,
          3,
          operation,
        ]),
      ),
    );
    expect(calls.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    await expect(
      repository.getSavingsGoal(principal, goalId, 'savings-after-reversal'),
    ).resolves.toMatchObject({ progressMinor: '600' });
  });

  it('requires an explicit lifecycle decision when reducing target below derived progress', async () => {
    const base = {
      operation: 'update',
      goalId,
      expectedVersion: 4,
      patch: { targetMinor: '500' },
      operationId: randomUUID(),
      requestId: 'savings-live-target',
    };
    await expect(
      pool.query('select private.save_savings_goal($1,$2::jsonb)', [owner, JSON.stringify(base)]),
    ).rejects.toThrow(/SAVINGS_TARGET_DECISION_REQUIRED/);
    const completed = await pool.query<{ result: Record<string, unknown> }>(
      'select private.save_savings_goal($1,$2::jsonb) result',
      [owner, JSON.stringify({ ...base, patch: { targetMinor: '500', status: 'completed' } })],
    );
    expect(completed.rows[0]?.result).toMatchObject({
      targetMinor: '500',
      status: 'completed',
      version: 5,
    });
  });
});
