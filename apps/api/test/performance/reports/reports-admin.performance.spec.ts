import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import { normalizeAdminOverviewQuery } from '../../../src/reports/reports.dto';
import { describeLiveDatabase } from '../../live-database';

describe('admin report input budgets', () => {
  it('allows only the fixed platform, period, and activity page bounds', () => {
    expect(normalizeAdminOverviewQuery({ platform: 'ios', period: '90d', page: '100', pageSize: '25' }, true)).toEqual({ platform: 'ios', period: '90d', locale: 'ar', page: 100, pageSize: 25 });
    expect(() => normalizeAdminOverviewQuery({ platform: 'all', period: '365d' })).toThrow();
    expect(() => normalizeAdminOverviewQuery({ pageSize: '26' }, true)).toThrow();
  });
});

describeLiveDatabase('admin report query performance', () => {
  let pool: Pool;
  beforeAll(() => { pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }); });
  afterAll(async () => pool.end());

  it('keeps aggregate user/device counts below the uncached p95 budget', async () => {
    const userId = `admin_report_perf_${randomUUID()}`;
    await pool.query("insert into public.profiles(id,status,timezone) values($1,'active','Asia/Riyadh')", [userId]);
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      await pool.query(`with device_users as (
        select user_id,bool_or(platform='ios') ios,bool_or(platform='android') android from public.user_devices
        where revoked_at is null and platform in ('ios','android') group by user_id
      ) select count(*) from public.profiles p left join device_users u on u.user_id=p.id where p.status<>'deleted'`);
      durations.push(performance.now() - startedAt);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(800);
  });
});
