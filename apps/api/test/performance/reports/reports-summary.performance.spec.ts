import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReportsRepository } from '../../../src/reports/reports.repository';
import { resolveReportPeriod } from '../../../src/reports/reports.period';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('report summary performance', () => {
  const userId = `report_perf_${randomUUID()}`;
  let raw: Pool;
  let pool: PoolService;

  beforeAll(async () => {
    raw = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4),
    } as never);
    await raw.query("select set_config('masarifi.ledger_command','on',false)");
    await raw.query(
      "insert into public.profiles(id,status,timezone) values($1,'active','Asia/Riyadh')",
      [userId],
    );
  });

  afterAll(async () => {
    await pool.onModuleDestroy();
    await raw.end();
  });

  it('keeps empty/normal summary reads inside the cached-summary p95 budget', async () => {
    const repository = new ReportsRepository(pool);
    const period = resolveReportPeriod('monthly', '2026-08-15', 'Asia/Riyadh');
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      await repository.getSummary(
        { userId, sessionId: 's', factorAgeSeconds: 0 },
        'financial_summary',
        period,
        null,
        'perf',
      );
      durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(800);
  });

  it('keeps category output bounded in the database query', async () => {
    const plan = await raw.query<{ 'QUERY PLAN': Array<{ Plan: { 'Plan Rows': number } }> }>(
      `explain (format json) select * from public.v_category_spending_summary
       where user_id=$1 and month_start between '2026-08-01' and '2026-08-31'
       order by currency_code,expense_minor desc,category_id limit 100`,
      [userId],
    );
    expect(plan.rows[0]?.['QUERY PLAN'][0]?.Plan['Plan Rows']).toBeLessThanOrEqual(100);
  });
});
