import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReportsRepository } from '../../../src/reports/reports.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('immutable report generation requests', () => {
  const userId = `report_generation_${randomUUID()}`;
  const principal = { userId, sessionId: 'session', factorAgeSeconds: 0 };
  const accountId = randomUUID();
  let pool: PoolService;
  let repository: ReportsRepository;

  beforeAll(async () => {
    pool = new PoolService({ get: (key: string) => key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4 } as never);
    repository = new ReportsRepository(pool);
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query("select set_config('masarifi.ledger_command','on',true)");
      await client.query("insert into public.profiles(id,status,timezone) values($1,'active','Asia/Riyadh')", [userId]);
      await client.query("insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Main','bank','SAR')", [accountId, userId]);
      await client.query('insert into public.account_balances(account_id,confirmed_minor,ledger_version) values($1,5000,2)', [accountId]);
      await client.query("insert into public.transactions(id,user_id,kind,amount_minor,currency_code,title,occurred_at) values($1,$2,'income',5000,'SAR','fixture','2026-08-04T10:00:00Z')", [randomUUID(), userId]);
      await client.query('commit');
    });
  });

  afterAll(async () => pool.onModuleDestroy());

  it('captures once and replays an identical idempotent response', async () => {
    const command = {
      type: 'financial_summary' as const,
      periodStart: '2026-08-01', periodEnd: '2026-08-31', format: 'json' as const,
      delivery: 'download' as const, recipient: null,
    };
    const first = await repository.captureSnapshot(principal, command, 'generation-key-1', 'request');
    const replay = await repository.captureSnapshot(principal, command, 'generation-key-1', 'request');
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ status: 'queued', ledgerVersion: 2, schemaVersion: 1 });
    const count = await pool.query<{ count: string }>('select count(*) from private.report_output_attempts where user_id=$1', [userId]);
    expect(count.rows[0]?.count).toBe('1');
  });

  it('returns only owner-safe status and keeps the persisted snapshot immutable', async () => {
    const page = await repository.listAttempts(principal, { cursor: null, limit: 25, scheduleId: null, status: null }, 'list');
    const attempt = (page.items as Array<{ id: string }>)[0];
    expect(attempt).toBeDefined();
    const result = await repository.getAttempt(principal, attempt?.id ?? '', 'get');
    expect(result).not.toHaveProperty('snapshot');
    expect(result).not.toHaveProperty('storageRef');
    await expect(pool.query("update private.report_output_attempts set snapshot='{}' where id=$1", [attempt?.id])).rejects.toThrow('REPORT_SNAPSHOT_IMMUTABLE');
  });
});
