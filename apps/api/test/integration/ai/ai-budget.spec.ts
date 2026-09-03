import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('AI budget reservation and hard stop', () => {
  const pool = createLivePool(),
    userId = `ai_budget_${randomUUID()}`,
    firstId = randomUUID(),
    secondId = randomUUID();

  async function reserve(operationId: string) {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: userId, sid: 'budget-session' }),
        ]);
        await client.query('set local role masarifi_api');
        const result = await client.query<QueryResultRow>(
          'select private.reserve_ai_quota($1,$2,$3) result',
          [userId, operationId, 'transaction_classification'],
        );
        await client.query('commit');
        return result.rows[0]?.result as Record<string, unknown>;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [userId]);
    await pool.query(
      "update private.ai_feature_routes set limits=jsonb_set(limits,'{monthlyBudget}','0.041'::jsonb) where workload='transaction_classification'",
    );
  });
  afterAll(async () => {
    await pool.query('delete from private.outbox_events where aggregate_id=any($1::uuid[])', [
      [firstId, secondId],
    ]);
    await pool.query('delete from private.ai_usage_events where user_id=$1', [userId]);
    await pool.query(
      "update private.ai_feature_routes set enabled=false,limits=jsonb_set(limits,'{monthlyBudget}','25'::jsonb) where workload='transaction_classification'",
    );
    await pool.onModuleDestroy();
  });

  it('emits each threshold once, replays without cost, and stops before provider work', async () => {
    await expect(reserve(firstId)).resolves.toMatchObject({ allowed: true, replayed: false });
    await pool.query(
      "select private.record_ai_usage($1,'transaction_classification','test/model','google',1,1,0.001,1,false,$2)",
      [userId, firstId],
    );
    await expect(reserve(firstId)).resolves.toMatchObject({ allowed: true, replayed: true });
    await expect(reserve(secondId)).resolves.toMatchObject({
      allowed: false,
      reason: 'AI_BUDGET_EXHAUSTED',
    });

    const events = await pool.query<{
      threshold: string;
    }>(`select payload->>'threshold' threshold from private.outbox_events
      where event_type='ai.budget_threshold.v1' and payload->>'workload'='transaction_classification' order by (payload->>'threshold')::integer`);
    expect(events.rows.map(({ threshold }) => threshold)).toEqual(['70', '85', '95']);
    expect(
      (
        await pool.query<{ cost: string; status: string }>(
          'select estimated_cost::text cost,reservation_status status from private.ai_usage_events where request_id=$1',
          [firstId],
        )
      ).rows[0],
    ).toEqual({ cost: '0.03920000', status: 'completed' });
    expect(
      (
        await pool.query<{ count: string }>(
          'select count(*)::text count from private.ai_usage_events where user_id=$1',
          [userId],
        )
      ).rows[0]?.count,
    ).toBe('1');
  });
});
