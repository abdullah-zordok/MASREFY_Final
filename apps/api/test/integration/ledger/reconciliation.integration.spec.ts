import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type ReconciliationResult = {
  rows: Array<{
    accountId: string;
    matches: boolean;
    mismatchKind: 'confirmed' | 'pending' | 'confirmed_and_pending' | null;
    ledgerVersion: number;
  }>;
  nextCursor: string | null;
};
type ReconciliationRepository = LedgerRepository & {
  reconcile(cursor: string | null, batchSize: number): Promise<ReconciliationResult>;
};

describeLiveDatabase('ledger reconciliation repository', () => {
  const ownerId = `ledger_reconcile_${randomUUID()}`;
  const accountPrefix = randomUUID().slice(0, 8);
  const accountIds = [1, 2, 3].map(
    (suffix) => `${accountPrefix}-ffff-4fff-bfff-fffffffffff${String(suffix)}`,
  );
  const precedingAccountId = `${accountPrefix}-ffff-4fff-bfff-fffffffffff0`;
  const pool = createLivePool();
  const repository = new LedgerRepository(pool) as ReconciliationRepository;

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query("select set_config('masarifi.ledger_command','on',true)");
        await client.query("insert into public.profiles(id,status) values($1,'active')", [ownerId]);
        await client.query(
          `insert into public.accounts(id,user_id,name,type,currency_code) values
            ($1,$4,'First','cash','SAR'),($2,$4,'Second','cash','SAR'),($3,$4,'Third','cash','SAR')`,
          [...accountIds, ownerId],
        );
        await client.query(
          `insert into public.account_balances(account_id,confirmed_minor,pending_minor,ledger_version) values
            ($1,100,20,1),($2,999,0,2),($3,0,77,3)`,
          accountIds,
        );
        const confirmedTransactionId = randomUUID();
        const pendingTransactionId = randomUUID();
        await client.query(
          `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at) values
            ($1,$3,'income','confirmed',100,'SAR','Confirmed fixture',clock_timestamp()),
            ($2,$3,'income','pending',20,'SAR','Pending fixture',clock_timestamp())`,
          [confirmedTransactionId, pendingTransactionId, ownerId],
        );
        await client.query(
          `insert into public.transaction_postings(transaction_id,account_id,amount_minor,clearing_state,posting_role,occurred_at) values
            ($1,$3,100,'confirmed','destination',clock_timestamp()),
            ($2,$3,20,'pending','destination',clock_timestamp()),
            ($1,$4,200,'confirmed','destination',clock_timestamp()),
            ($2,$5,20,'pending','destination',clock_timestamp())`,
          [
            confirmedTransactionId,
            pendingTransactionId,
            accountIds[0],
            accountIds[1],
            accountIds[2],
          ],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  });

  afterAll(() => pool.onModuleDestroy());

  it('compares grouped confirmed and pending postings exactly without changing a mismatched projection', async () => {
    const before = await pool.query(
      'select confirmed_minor::text,pending_minor::text,reconciled_at from public.account_balances where account_id=$1',
      [accountIds[1]],
    );

    const result = await repository.reconcile(null, 500);

    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: accountIds[0], matches: true, mismatchKind: null }),
        expect.objectContaining({
          accountId: accountIds[1],
          matches: false,
          mismatchKind: 'confirmed',
        }),
        expect.objectContaining({
          accountId: accountIds[2],
          matches: false,
          mismatchKind: 'pending',
        }),
      ]),
    );
    const after = await pool.query(
      'select confirmed_minor::text,pending_minor::text,reconciled_at from public.account_balances where account_id=$1',
      [accountIds[1]],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('uses UUID ordering for deterministic bounded pages and carries the last account as the next cursor', async () => {
    const first = await repository.reconcile(precedingAccountId, 2);
    const second = await repository.reconcile(first.nextCursor, 2);

    expect(first.rows.map(({ accountId }) => accountId)).toEqual(accountIds.slice(0, 2));
    expect(first.nextCursor).toBe(accountIds[1]);
    expect(second.rows[0]?.accountId).toBe(accountIds[2]);
    expect(second.rows.length).toBeLessThanOrEqual(2);
  });

  it('records one redacted mismatch incident per account/version/kind across retry', async () => {
    const base = {
      accountId: accountIds[1] ?? '',
      mismatchKind: 'confirmed' as const,
      ledgerVersion: 2,
      observedAt: '2026-08-30T08:00:00.000Z',
      requestId: 'reconciliation-first',
    };
    await repository.recordReconciliationMismatch(base);
    await repository.recordReconciliationMismatch({
      ...base,
      observedAt: '2026-08-30T08:01:00.000Z',
      requestId: 'reconciliation-retry',
    });
    const events = await pool.query<{ payload: Record<string, unknown> }>(
      `select payload from private.outbox_events where event_type='ledger.reconciliation_failed'
        and aggregate_id=$1 and payload->>'ledgerVersion'='2' and payload->>'mismatchKind'='confirmed'`,
      [accountIds[1]],
    );
    expect(events.rows).toHaveLength(1);
    expect(Object.keys(events.rows[0]?.payload ?? {}).sort()).toEqual(
      ['accountId', 'ledgerVersion', 'mismatchKind', 'observedAt', 'requestId'].sort(),
    );
  });
});
