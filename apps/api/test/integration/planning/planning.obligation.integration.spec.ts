import { randomUUID } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('obligation planning live invariants', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const owner = `obligation_live_${randomUUID()}`;
  const other = `obligation_other_${randomUUID()}`;
  const obligationId = randomUUID();
  const accountId = randomUUID();

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
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Bank','bank','SAR')",
        [accountId, owner],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());

  it('creates a validated owned fixed-term obligation and isolates it', async () => {
    const command = {
      operation: 'create',
      obligationId,
      operationId: randomUUID(),
      requestId: 'obligation-live-create',
      name: 'Loan',
      direction: 'payable',
      type: 'installment',
      scheduleKind: 'fixed_term',
      currencyCode: 'SAR',
      principalMinor: '1000',
      openingPaidMinor: '0',
      installmentAmountMinor: '300',
      installmentCount: 4,
      frequency: 'monthly',
      expectedDay: 31,
      customIntervalDays: null,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      defaultAccountId: accountId,
      automaticMatchingEnabled: true,
      provider: 'Bank',
      providerKeywords: ['loan'],
      reminderTiming: 'due.before_3d',
      notes: 'private note',
    };
    const created = await api<{ result: Record<string, unknown> }>(
      owner,
      'select private.save_obligation($1,$2::jsonb) result',
      [owner, JSON.stringify(command)],
    );
    expect(created.rows[0]?.result).toMatchObject({
      id: obligationId,
      principalMinor: '1000',
      version: 1,
    });
    const hidden = await api<{ count: string }>(
      other,
      'select count(*)::text count from public.obligations where id=$1',
      [obligationId],
    );
    expect(hidden.rows[0]?.count).toBe('0');
  });

  it('generates concurrent month-end sequences once with an exact residual and bounded horizon', async () => {
    const generated = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        pool.query(
          "select * from private.generate_obligation_schedule($1,$2,(current_date+interval '6 months')::date)",
          [owner, obligationId],
        ),
      ),
    );
    expect(generated.every(({ status }) => status === 'fulfilled')).toBe(true);
    const rows = await pool.query<{ sequence_no: number; amount_minor: string }>(
      'select sequence_no,amount_minor::text from public.obligation_schedule_items where obligation_id=$1 order by sequence_no',
      [obligationId],
    );
    expect(rows.rows).toEqual([
      { sequence_no: 1, amount_minor: '300' },
      { sequence_no: 2, amount_minor: '300' },
      { sequence_no: 3, amount_minor: '300' },
      { sequence_no: 4, amount_minor: '100' },
    ]);
    await expect(
      pool.query(
        "select * from private.generate_obligation_schedule($1,$2,(current_date+interval '19 months')::date)",
        [owner, obligationId],
      ),
    ).rejects.toThrow(/PLANNING_HORIZON_INVALID/);
  });

  it('marks only eligible remaining rows overdue and keeps payable summary separate', async () => {
    await pool.query(
      "select * from private.mark_planning_overdue((current_date+interval '1 year')::timestamptz,500)",
    );
    const status = await api<{ direction: string; remaining_minor: string; overdue_minor: string }>(
      owner,
      'select direction,remaining_minor::text,overdue_minor::text from public.v_obligation_status where obligation_id=$1',
      [obligationId],
    );
    expect(status.rows[0]).toMatchObject({ direction: 'payable', remaining_minor: '1000' });
    expect(BigInt(status.rows[0]?.overdue_minor ?? '0')).toBeGreaterThan(0n);
  });

  it('rejects foreign and incompatible account references without partial rows', async () => {
    const invalid = {
      operation: 'create',
      obligationId: randomUUID(),
      operationId: randomUUID(),
      requestId: 'obligation-live-invalid',
      name: 'Bad',
      direction: 'payable',
      type: 'bill',
      scheduleKind: 'open_ended',
      currencyCode: 'USD',
      principalMinor: '0',
      openingPaidMinor: '0',
      installmentAmountMinor: '10',
      installmentCount: null,
      frequency: 'monthly',
      expectedDay: 1,
      customIntervalDays: null,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
      defaultAccountId: accountId,
      automaticMatchingEnabled: false,
      provider: null,
      providerKeywords: [],
      reminderTiming: null,
      notes: null,
    };
    await expect(
      api(owner, 'select private.save_obligation($1,$2::jsonb)', [owner, JSON.stringify(invalid)]),
    ).rejects.toThrow(/OBLIGATION_ACCOUNT_INVALID/);
  });

  it('serves bounded reads and versioned lifecycle replay before terminal archive', async () => {
    const principal = { userId: owner, sessionId: 'session', factorAgeSeconds: 0 };
    await expect(
      repository.getObligation(principal, obligationId, 'obligation-detail'),
    ).resolves.toMatchObject({
      id: obligationId,
      principalMinor: '1000',
      summary: { direction: 'payable', remainingMinor: '1000' },
    });
    const schedule = await repository.listObligationSchedule(
      principal,
      obligationId,
      { cursor: null, limit: 10 },
      'obligation-schedule',
    );
    expect(schedule.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ sequenceNo: 1, amountMinor: '300' })]),
    );
    const pause = {
      operation: 'updateObligation',
      scope: 'planning.obligation.update',
      status: 200,
      principal,
      command: { obligationId, expectedVersion: 1, patch: { status: 'paused' } },
      idempotencyKey: 'obligation-live-pause-key01',
      requestId: 'obligation-live-pause',
    };
    const paused = await repository.mutate(pause);
    await expect(repository.mutate(pause)).resolves.toEqual(paused);
    await repository.mutate({
      ...pause,
      command: { obligationId, expectedVersion: 2, patch: { status: 'active' } },
      idempotencyKey: 'obligation-live-resume-key1',
      requestId: 'obligation-live-resume',
    });
    await expect(
      repository.mutate({
        operation: 'archiveObligation',
        scope: 'planning.obligation.archive',
        status: 200,
        principal,
        command: { obligationId, expectedVersion: 3 },
        idempotencyKey: 'obligation-live-archive-key',
        requestId: 'obligation-live-archive',
      }),
    ).resolves.toMatchObject({ resource: { status: 'archived', version: 4 } });
  });
});
