import { randomUUID } from 'node:crypto';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { PlanningWorker } from '../../../src/planning/planning.worker';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('planning worker live recovery', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const worker = new PlanningWorker(repository);
  const owner = `planning_worker_${randomUUID()}`;
  const salaryId = randomUUID();
  const obligationId = randomUUID();
  const overdueItemId = randomUUID();
  const transactionId = randomUUID();

  beforeAll(async () =>
    pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [owner]);
      await client.query(
        `insert into public.salary_profiles(id,user_id,name,amount_minor,currency_code,frequency,expected_day)
      values($1,$2,'Salary',1000,'SAR','monthly',extract(day from current_date)::integer)`,
        [salaryId, owner],
      );
      await client.query(
        `insert into public.obligations(id,user_id,name,direction,type,schedule_kind,currency_code,
      principal_minor,installment_amount_minor,installment_count,frequency,expected_day,start_date,
      automatic_matching_enabled,provider_keywords,reminder_timing)
      values($1,$2,'Worker loan','payable','installment','fixed_term','SAR',300,100,3,'monthly',
        extract(day from current_date)::integer,current_date,true,array['worker merchant'],'seven_days')`,
        [obligationId, owner],
      );
      await client.query(
        `insert into public.obligation_schedule_items(id,user_id,obligation_id,due_at,amount_minor,sequence_no)
      values($1,$2,$3,current_date-interval '1 day',100,99)`,
        [overdueItemId, owner, obligationId],
      );
      await client.query(
        `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,merchant,occurred_at)
      values($1,$2,'expense','confirmed',100,'SAR','Installment','Worker Merchant',clock_timestamp())`,
        [transactionId, owner],
      );
      await client.query('commit');
    }),
  );

  afterAll(async () => {
    await worker.stop();
    await pool.onModuleDestroy();
  });

  it('runs all five bounded jobs idempotently and emits one intent per eligible due item', async () => {
    for (const job of [
      'planning.salary-cycle.generate',
      'planning.obligation-schedule.generate',
      'planning.payment-match.propose',
      'planning.overdue.mark',
      'planning.reminders.emit',
    ] as const)
      await expect(worker.runJob(job)).resolves.toBeGreaterThanOrEqual(1);
    await expect(worker.runJob('planning.reminders.emit')).resolves.toBe(0);
    const counts = await pool.query<{
      receipts: string;
      matches: string;
      reminders: string;
      overdue: string;
    }>(
      `select
      (select count(*)::text from public.salary_receipts where salary_profile_id=$1) receipts,
      (select count(*)::text from public.payment_matches where obligation_id=$2) matches,
      (select count(*)::text from private.planning_reminder_intents where resource_id=$2) reminders,
      (select count(*)::text from public.obligation_schedule_items where id=$3 and status='overdue') overdue`,
      [salaryId, obligationId, overdueItemId],
    );
    expect(Number(counts.rows[0]?.receipts)).toBeGreaterThan(0);
    expect(counts.rows[0]).toMatchObject({ matches: '1', reminders: '2', overdue: '1' });
  });

  it('reclaims every expired job lease and rejects every stale execution fence', async () => {
    const jobs = [
      ['planning.salary-cycle.generate', salaryId],
      ['planning.obligation-schedule.generate', obligationId],
      ['planning.payment-match.propose', transactionId],
      ['planning.overdue.mark', overdueItemId],
      ['planning.reminders.emit', overdueItemId],
    ] as const;
    for (const [job, resourceId] of jobs) {
      if (job === 'planning.overdue.mark')
        await pool.query(
          "update public.obligation_schedule_items set status='due',paid_minor=0 where id=$1",
          [overdueItemId],
        );
      await pool.query(
        `update private.planning_job_claims set status='failed',locked_by=null,locked_until=null,
        lease_token=null,available_at=clock_timestamp() where job_name=$1 and resource_id=$2`,
        [job, resourceId],
      );
      const first = (await repository.claimPlanning(job, 1, 60))[0];
      if (!first) throw new Error(`PLANNING_CLAIM_EXPECTED:${job}`);
      await pool.query(
        "update private.planning_job_claims set locked_until=clock_timestamp()-interval '1 second' where id=$1",
        [first.id],
      );
      const reclaimed = (await repository.claimPlanning(job, 1, 60))[0];
      if (!reclaimed) throw new Error(`PLANNING_RECLAIM_EXPECTED:${job}`);
      expect(reclaimed.attemptCount).toBe(first.attemptCount + 1);
      await expect(repository.executePlanningClaim(job, first)).rejects.toThrow(
        /PLANNING_CLAIM_STALE/,
      );
      await expect(
        repository.completePlanningClaim(first.id, first.leaseToken, 'completed', {}),
      ).rejects.toThrow(/PLANNING_CLAIM_STALE/);
      await expect(
        repository.completePlanningClaim(reclaimed.id, reclaimed.leaseToken, 'completed', {}),
      ).resolves.toBeUndefined();
    }
  });

  it('finds and repairs bounded schedule projection drift', async () => {
    await pool.query(
      "update public.obligation_schedule_items set paid_minor=50,status='partial' where id=$1",
      [overdueItemId],
    );
    await expect(repository.reconcilePlanning(false, 100)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resource_id: overdueItemId,
          difference_code: 'paid_projection',
          repaired: false,
        }),
      ]),
    );
    await repository.reconcilePlanning(true, 100);
    const repaired = await pool.query<{ paid_minor: string }>(
      'select paid_minor::text paid_minor from public.obligation_schedule_items where id=$1',
      [overdueItemId],
    );
    expect(repaired.rows[0]?.paid_minor).toBe('0');
  });
});
