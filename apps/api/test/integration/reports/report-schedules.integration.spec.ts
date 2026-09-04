import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReportsRepository } from '../../../src/reports/reports.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('report schedules', () => {
  const owner = { userId: `schedule_${randomUUID()}`, sessionId: 's', factorAgeSeconds: 0 };
  const other = { userId: `schedule_other_${randomUUID()}`, sessionId: 's', factorAgeSeconds: 0 };
  let pool: PoolService;
  let repository: ReportsRepository;

  beforeAll(async () => {
    pool = new PoolService({ get: (key: string) => key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4 } as never);
    repository = new ReportsRepository(pool);
    await pool.query("insert into public.profiles(id,status) values($1,'active'),($2,'active')", [owner.userId, other.userId]);
  });
  afterAll(async () => pool.onModuleDestroy());

  it('creates idempotently, masks recipients, paginates, and isolates owners', async () => {
    const command = {
      reportType: 'financial_summary', frequency: 'monthly', timezone: 'Asia/Riyadh',
      nextRunAt: '2026-10-01T05:00:00.000Z', deliveryChannel: 'email', recipient: 'reports@example.test', enabled: true,
    };
    const first = await repository.createSchedule(owner, command, 'schedule-key-1', 'request');
    expect(await repository.createSchedule(owner, command, 'schedule-key-1', 'request')).toEqual(first);
    expect(first).toMatchObject({ version: 1, recipientMasked: 'r***@example.test' });
    expect((await repository.listSchedules(owner, null, 25, 'list')).items).toHaveLength(1);
    expect((await repository.listSchedules(other, null, 25, 'list')).items).toHaveLength(0);
  });

  it('uses compare-and-set updates and rejects stale versions', async () => {
    const page = await repository.listSchedules(owner, null, 25, 'list');
    const current = (page.items as Array<{ id: string }>)[0];
    const command = {
      id: current?.id, expectedVersion: 1, reportType: 'financial_summary', frequency: 'monthly',
      timezone: 'Asia/Riyadh', nextRunAt: '2026-11-01T05:00:00.000Z', deliveryChannel: 'email',
      recipient: 'reports@example.test', enabled: false,
    };
    await expect(repository.updateSchedule(owner, command, 'schedule-key-2', 'request')).resolves.toMatchObject({ version: 2, enabled: false });
    await expect(repository.updateSchedule(owner, { ...command, enabled: true }, 'schedule-key-3', 'request')).rejects.toMatchObject({ status: 409 });
  });
});
