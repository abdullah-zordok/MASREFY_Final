import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReportsRepository } from '../../../src/reports/reports.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('report schedule worker', () => {
  const userId = `schedule_worker_${randomUUID()}`;
  const principal = { userId, sessionId: 'session', factorAgeSeconds: 0 };
  let pool: PoolService;
  let repository: ReportsRepository;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4),
    } as never);
    repository = new ReportsRepository(pool);
    await pool.query(
      "insert into public.profiles(id,status,timezone) values($1,'active','Asia/Riyadh')",
      [userId],
    );
  });

  afterAll(async () => pool.onModuleDestroy());

  it('enqueues one immutable attempt under concurrent claims and advances one period', async () => {
    const schedule = (await repository.createSchedule(
      principal,
      {
        reportType: 'financial_summary',
        frequency: 'monthly',
        timezone: 'Asia/Riyadh',
        nextRunAt: '2026-08-01T05:00:00.000Z',
        deliveryChannel: 'download',
        recipient: null,
        enabled: true,
      },
      'schedule-worker-key',
      'request',
    )) as { id: string };
    const results = await Promise.all([
      repository.enqueueDueSchedule(schedule.id, new Date('2026-09-04T00:00:00.000Z')),
      repository.enqueueDueSchedule(schedule.id, new Date('2026-09-04T00:00:00.000Z')),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const attempts = await pool.query<{ count: string }>(
      'select count(*) from private.report_output_attempts where schedule_id=$1',
      [schedule.id],
    );
    const advanced = await repository.getSchedule(principal, schedule.id, 'request');
    expect(attempts.rows[0]?.count).toBe('1');
    expect(advanced).toMatchObject({
      version: 2,
      lastRunAt: '2026-08-01T05:00:00.000Z',
      nextRunAt: '2026-09-01T05:00:00.000Z',
    });
  });
});
