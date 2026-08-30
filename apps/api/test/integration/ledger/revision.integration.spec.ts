import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type LedgerResponse = {
  transaction: {
    transaction: { id: string; version: number; accountIds: string[] };
    postings: Array<{ amountMinor: number }>;
    revisions: unknown[];
  };
  balances: Array<{ confirmedMinor: number }>;
};

describeLiveDatabase('append-only transaction revision', () => {
  const owner = {
    userId: `ledger_revision_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const accountId = randomUUID(),
    revisionAccountIds = [randomUUID(), randomUUID(), randomUUID()],
    pool = createLivePool(),
    repository = new LedgerRepository(pool);
  let transactionId: string;
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [
        owner.userId,
      ]);
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Cash','cash','SAR')",
        [accountId, owner.userId],
      );
      for (const [index, id] of revisionAccountIds.entries())
        await client.query(
          "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,$3,'cash','SAR')",
          [id, owner.userId, `Revision ${String(index)}`],
        );
      await client.query('commit');
    });
    const created = (await repository.mutate({
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal: owner,
      idempotencyKey: 'revision-create-key',
      requestId: 'revision-create',
      status: 201,
      command: {
        kind: 'expense',
        amountMinor: 1000,
        currency: 'SAR',
        accountId,
        categoryId: null,
        title: 'Old',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt: new Date().toISOString(),
        source: 'manual',
        externalRef: null,
      },
    })) as LedgerResponse;
    transactionId = created.transaction.transaction.id;
  });
  afterAll(() => pool.onModuleDestroy());
  const revise = (key: string, expectedVersion: number, patch: Record<string, unknown>) =>
    repository.mutate({
      operation: 'reviseTransaction',
      scope: 'ledger.transaction.revise',
      principal: owner,
      idempotencyKey: key,
      requestId: `req-${key}`,
      status: 200,
      command: { transactionId, expectedVersion, reason: 'Correction', patch },
    }) as Promise<LedgerResponse>;

  it('adds no posting for metadata and only the financial delta for amount correction', async () => {
    const metadata = await revise('revision-meta-key', 1, { title: 'New' });
    expect(metadata.transaction.transaction.version).toBe(2);
    expect(metadata.transaction.postings).toHaveLength(1);
    await expect(
      repository.replayCompleted({
        operation: 'reviseTransaction',
        scope: 'ledger.transaction.revise',
        principal: owner,
        idempotencyKey: 'revision-meta-key',
        requestId: 'retry-after-version-advanced',
        status: 200,
        command: {
          transactionId,
          expectedVersion: 1,
          reason: 'Correction',
          patch: { title: 'New' },
        },
      }),
    ).resolves.toEqual(metadata);
    const financial = await revise('revision-money-key', 2, { amountMinor: 1200 });
    expect(
      financial.transaction.postings.map((row: { amountMinor: number }) => row.amountMinor),
    ).toEqual([-1000, -200]);
    expect(financial.transaction.revisions).toHaveLength(3);
    expect(financial.balances.at(0)?.confirmedMinor).toBe(-1200);
    const evidence = await pool.query<{
      before_snapshot: unknown;
      after_snapshot: unknown;
      events: string;
      balances: string;
    }>(
      "select r.before_snapshot,r.after_snapshot,(select count(*)::text from private.outbox_events where aggregate_id=$1 and event_type='transaction.revised') events,(select count(*)::text from private.outbox_events where aggregate_id=$1 and event_type='balance.changed') balances from audit.transaction_revisions r where r.transaction_id=$1 and r.revision_no=3",
      [transactionId],
    );
    expect(evidence.rows[0]).toMatchObject({ events: '2', balances: '3' });
    expect(evidence.rows[0]?.before_snapshot).not.toEqual(evidence.rows[0]?.after_snapshot);
  });

  it('allows one concurrent expected-version writer and leaves the stale writer side-effect free', async () => {
    const settled = await Promise.allSettled([
      revise('revision-race-a', 3, { title: 'Winner A' }),
      revise('revision-race-b', 3, { title: 'Winner B' }),
    ]);
    expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find(({ status }) => status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      response: { code: 'VERSION_CONFLICT', currentVersion: 4 },
    });
    const counts = await pool.query<{ version: string; revisions: string }>(
      'select t.version,(select count(*)::text from audit.transaction_revisions where transaction_id=t.id) revisions from public.transactions t where id=$1',
      [transactionId],
    );
    expect(counts.rows[0]).toEqual({ version: '4', revisions: '4' });
  });

  it('reports only current/touched accounts after repeated account revisions', async () => {
    let expectedVersion = 4;
    for (const [index, nextAccountId] of revisionAccountIds.entries()) {
      const changed = await revise(`revision-account-${String(index)}`, expectedVersion, {
        accountId: nextAccountId,
      });
      expectedVersion += 1;
      expect(changed.transaction.transaction).toMatchObject({
        version: expectedVersion,
        accountIds: [nextAccountId],
      });
      expect(changed.balances).toHaveLength(2);
    }
  });
});
