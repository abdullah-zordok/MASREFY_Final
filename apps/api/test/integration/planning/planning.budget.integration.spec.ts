import { randomUUID } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('budget planning live invariants', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const owner = `budget_live_${randomUUID()}`;
  const other = `budget_other_${randomUUID()}`;
  const budgetId = randomUUID();
  const categoryA = randomUUID();
  const categoryB = randomUUID();

  async function api<T extends QueryResultRow>(userId: string, sql: string, values: unknown[]) {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: userId, sid: 'session' }),
        ]);
        await client.query('set local role masarifi_api');
        const result = await client.query<T>(sql, values);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
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
        `insert into public.categories(id,user_id,kind,label_ar,label_en)
         values($1,$3,'expense','أ','A'),($2,$3,'expense','ب','B')`,
        [categoryA, categoryB, owner],
      );
      await client.query(
        `insert into public.budgets(id,user_id,name,currency_code,period_start,period_end,total_minor,status)
         values($1,$2,'Live budget','SAR','2026-09-01','2026-09-30',1000,'active')`,
        [budgetId, owner],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());

  const allocations = (a = '600', b = '400') => [
    {
      categoryId: categoryA,
      limitMinor: a,
      rolloverMinor: '0',
      alertThresholds: [80, 100],
      status: 'active',
    },
    {
      categoryId: categoryB,
      limitMinor: b,
      rolloverMinor: '0',
      alertThresholds: [90, 100],
      status: 'active',
    },
  ];

  it('replaces one complete allocation set atomically and isolates owners', async () => {
    const result = await api<{ result: Record<string, unknown> }>(
      owner,
      'select private.replace_budget_categories($1,$2,$3,$4::jsonb) result',
      [owner, budgetId, 1, JSON.stringify(allocations())],
    );
    expect(result.rows[0]?.result).toMatchObject({ id: budgetId, version: 2 });
    await expect(
      api(other, 'select private.replace_budget_categories($1,$2,$3,$4::jsonb)', [
        other,
        budgetId,
        2,
        JSON.stringify([]),
      ]),
    ).rejects.toThrow(/BUDGET_NOT_FOUND/);

    await expect(
      api(owner, 'select private.replace_budget_categories($1,$2,$3,$4::jsonb)', [
        owner,
        budgetId,
        2,
        JSON.stringify(allocations('1001', '0')),
      ]),
    ).rejects.toThrow(/BUDGET_ALLOCATION_EXCEEDS_TOTAL/);
    const unchanged = await api<{ count: string; total: string }>(
      owner,
      'select count(*)::text count,sum(limit_minor)::text total from public.budget_categories where budget_id=$1',
      [budgetId],
    );
    expect(unchanged.rows[0]).toEqual({ count: '2', total: '1000' });
  });

  it('serializes concurrent allocation replacements by root version', async () => {
    const calls = await Promise.allSettled([
      api(owner, 'select private.replace_budget_categories($1,$2,$3,$4::jsonb)', [
        owner,
        budgetId,
        2,
        JSON.stringify(allocations('500', '500')),
      ]),
      api(owner, 'select private.replace_budget_categories($1,$2,$3,$4::jsonb)', [
        owner,
        budgetId,
        2,
        JSON.stringify(allocations('700', '300')),
      ]),
    ]);
    expect(calls.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(calls.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('counts eligible spend once across refunds and reclassification, excluding transfers and reversals', async () => {
    const expense = randomUUID();
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,category_id,title,occurred_at,created_at)
         values($1,$2,'expense','confirmed',300,'SAR',$3,'Expense','2026-09-10T00:00:00Z','2026-09-30T00:00:00Z')`,
        [expense, owner, categoryA],
      );
      await client.query(
        `insert into public.transactions(user_id,kind,status,amount_minor,currency_code,title,occurred_at,created_at,reverses_transaction_id)
         values($1,'refund','confirmed',50,'SAR','Refund','2026-09-11T00:00:00Z','2026-09-30T00:00:00Z',$2),
         ($1,'transfer','confirmed',999,'SAR','Transfer','2026-09-12T00:00:00Z','2026-09-30T00:00:00Z',null)`,
        [owner, expense],
      );
      await client.query('update public.transactions set category_id=$1 where id=$2', [
        categoryB,
        expense,
      ]);
      await client.query('commit');
    });
    const rows = await api<{ category_id: string; spent_minor: string; remaining_minor: string }>(
      owner,
      'select category_id,spent_minor::text,remaining_minor::text from public.v_budget_utilization where budget_id=$1 order by category_id',
      [budgetId],
    );
    const byCategory = new Map(rows.rows.map((row) => [row.category_id, row]));
    expect(byCategory.get(categoryA)?.spent_minor).toBe('0');
    expect(byCategory.get(categoryB)?.spent_minor).toBe('250');
  });

  it('marks utilization partial when categorized spend needs a missing FX rate', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        `insert into public.transactions(user_id,kind,status,amount_minor,currency_code,category_id,title,occurred_at,created_at)
         values($1,'expense','confirmed',10,'USD',$2,'FX expense','2026-09-15T00:00:00Z','2026-09-30T00:00:00Z')`,
        [owner, categoryA],
      );
      await client.query('commit');
    });
    const state = await api<{ data_state: string; unavailable_reason: string | null }>(
      owner,
      'select data_state,unavailable_reason from public.v_budget_utilization where budget_id=$1 and category_id=$2',
      [budgetId, categoryA],
    );
    expect(state.rows[0]).toEqual({ data_state: 'partial', unavailable_reason: 'missing_rate' });
  });

  it('persists and replays budget lifecycle commands and serves bounded exact reads', async () => {
    const principal = { userId: owner, sessionId: 'session', factorAgeSeconds: 0 };
    const create = {
      operation: 'createBudget',
      scope: 'planning.budget.create',
      status: 201,
      principal,
      command: {
        name: 'Copied budget',
        currencyCode: 'SAR',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        totalMinor: '900',
        incomeTargetMinor: '0',
        savingsTargetMinor: '0',
        rolloverEnabled: false,
        rolloverMinor: '0',
        copiedFromBudgetId: budgetId,
      },
      idempotencyKey: 'budget-live-create-key-0001',
      requestId: 'budget-live-create',
    };
    const first = await repository.mutate(create);
    await expect(repository.mutate(create)).resolves.toEqual(first);
    const created = first.resource as { id: string; version: number };
    expect(created).toMatchObject({ version: 1 });

    const update = {
      operation: 'updateBudget',
      scope: 'planning.budget.update',
      status: 200,
      principal,
      command: { budgetId: created.id, expectedVersion: 1, patch: { status: 'active' } },
      idempotencyKey: 'budget-live-update-key-0001',
      requestId: 'budget-live-update',
    };
    await expect(repository.mutate(update)).resolves.toMatchObject({
      resource: { version: 2, status: 'active' },
    });
    await expect(repository.getBudget(principal, created.id, 'budget-read')).resolves.toMatchObject(
      {
        id: created.id,
        totalMinor: '900',
        copiedFromBudgetId: budgetId,
        categories: [],
      },
    );
    const page = await repository.listBudgets(
      principal,
      {
        cursor: null,
        limit: 10,
        period: { start: '2026-10-01', end: '2026-10-31' },
      },
      'budget-list',
    );
    expect(page.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const remove = {
      operation: 'deleteBudget',
      scope: 'planning.budget.delete',
      status: 200,
      principal,
      command: { budgetId: created.id, expectedVersion: 2 },
      idempotencyKey: 'budget-live-delete-key-0001',
      requestId: 'budget-live-delete',
    };
    await expect(repository.mutate(remove)).resolves.toMatchObject({
      resource: { version: 3, status: 'deleted' },
    });
    const evidence = await pool.query<{ events: string; keys: string }>(
      `select (select count(*)::text from private.outbox_events where aggregate_id=$1) events,
       (select count(*)::text from private.idempotency_keys where actor_id=$2 and scope like 'planning.budget.%' and state='completed') keys`,
      [created.id, owner],
    );
    expect(evidence.rows[0]).toEqual({ events: '3', keys: '3' });
  });
});
