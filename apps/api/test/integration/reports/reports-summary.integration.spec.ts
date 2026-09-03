import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReportsRepository } from '../../../src/reports/reports.repository';
import { resolveReportPeriod } from '../../../src/reports/reports.period';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('report summary reads', () => {
  const suffix = randomUUID().slice(0, 8);
  const owner = { userId: `report_summary_${suffix}`, sessionId: 'session', factorAgeSeconds: 0 };
  const other = { userId: `report_other_${suffix}`, sessionId: 'other', factorAgeSeconds: 0 };
  const account = randomUUID();
  const otherAccount = randomUUID();
  let pool: PoolService;
  let repository: ReportsRepository;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 4),
    } as never);
    repository = new ReportsRepository(pool);
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('masarifi.ledger_command','on',true)");
        await client.query(
          `insert into public.profiles(id,status,timezone) values($1,'active','Asia/Riyadh'),($2,'active','Asia/Riyadh')`,
          [owner.userId, other.userId],
        );
        await client.query(
          `insert into public.accounts(id,user_id,name,type,currency_code) values
           ($1,$2,'SAR account','bank','SAR'),($3,$2,'USD account','bank','USD'),
           ($4,$5,'Other','bank','SAR')`,
          [account, owner.userId, randomUUID(), otherAccount, other.userId],
        );
        const transactionValues = [
          [randomUUID(), owner.userId, 'income', 100_00, 'SAR', '2026-08-01T10:00:00Z'],
          [randomUUID(), owner.userId, 'expense', 40_00, 'SAR', '2026-08-02T10:00:00Z'],
          [randomUUID(), owner.userId, 'income', 25_00, 'USD', '2026-08-03T10:00:00Z'],
          [randomUUID(), other.userId, 'income', 999_00, 'SAR', '2026-08-01T10:00:00Z'],
        ];
        for (const row of transactionValues) {
          await client.query(
            `insert into public.transactions(id,user_id,kind,amount_minor,currency_code,title,occurred_at)
             values($1,$2,$3,$4,$5,'fixture',$6)`,
            row,
          );
        }
        await client.query(
          `insert into public.account_balances(account_id,confirmed_minor,ledger_version)
           values($1,6000,3),($2,-99900,1)`,
          [account, otherAccount],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  afterAll(async () => {
    await pool.query('delete from public.transactions where user_id=any($1)', [[owner.userId, other.userId]]);
    await pool.onModuleDestroy();
  });

  it('returns stable separately grouped currencies and no other-owner values', async () => {
    const result = await repository.getSummary(
      owner,
      'financial_summary',
      resolveReportPeriod('monthly', '2026-08-17', 'Asia/Riyadh'),
      null,
      'report-summary-test',
    );
    expect(result).toMatchObject({
      metadata: { schemaVersion: 1, ledgerVersion: 3, reportType: 'financial_summary' },
      summaries: [
        {
          income: { amountMinor: 10_000, currency: 'SAR' },
          expense: { amountMinor: 4_000, currency: 'SAR' },
          netCashFlow: { amountMinor: 6_000, currency: 'SAR' },
        },
        {
          income: { amountMinor: 2_500, currency: 'USD' },
          expense: { amountMinor: 0, currency: 'USD' },
          netCashFlow: { amountMinor: 2_500, currency: 'USD' },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('99900');
  });

  it('returns a valid empty result and honors a currency filter', async () => {
    const empty = await repository.getSummary(
      owner,
      'financial_summary',
      resolveReportPeriod('monthly', '2025-01-01', 'Asia/Riyadh'),
      'SAR',
      'empty',
    );
    expect(empty).toMatchObject({ summaries: [], metadata: { dataState: 'empty', ledgerVersion: 3 } });

    const usd = await repository.getSummary(
      owner,
      'financial_summary',
      resolveReportPeriod('monthly', '2026-08-17', 'Asia/Riyadh'),
      'USD',
      'usd',
    );
    expect(usd.summaries).toEqual([
      {
        income: { amountMinor: 2_500, currency: 'USD' },
        expense: { amountMinor: 0, currency: 'USD' },
        netCashFlow: { amountMinor: 2_500, currency: 'USD' },
        savingsRateBasisPoints: 10_000,
        transactionCount: 1,
      },
    ]);
  });

  it('reads dashboard balances, planning, activity, and summary from a bounded snapshot', async () => {
    const home = await repository.getHome(
      owner,
      resolveReportPeriod('monthly', '2026-08-17', 'Asia/Riyadh'),
      'SAR',
      'home',
    );
    expect(home).toMatchObject({
      metadata: { ledgerVersion: 3, reportType: 'financial_summary' },
      balances: [{ accountId: account, confirmed: { amountMinor: 6000, currency: 'SAR' } }],
      planning: { budgets: [] },
    });
    expect((home.recentItems as unknown[])).toHaveLength(2);
    expect(Buffer.byteLength(JSON.stringify(home))).toBeLessThan(250_000);
  });
});
