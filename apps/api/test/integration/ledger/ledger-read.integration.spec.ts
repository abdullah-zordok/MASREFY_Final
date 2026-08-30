import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type Principal = { userId: string; sessionId: string; factorAgeSeconds: number };
type Page = {
  items: Array<{ id: string; title: string; occurredAt: string }>;
  nextCursor: string | null;
  ledgerVersion: number;
};
type ReadRepository = LedgerRepository & {
  listTransactions(principal: Principal, query: Record<string, unknown>): Promise<Page>;
  getAccountSummary(
    principal: Principal,
    accountId: string,
    query: Record<string, unknown>,
  ): Promise<{
    accountId: string;
    balance: { confirmedMinor: number; pendingMinor: number; ledgerVersion: number };
    ledgerVersion: number;
  }>;
};

describeLiveDatabase('ledger read repository', () => {
  const owner = {
    userId: `ledger_read_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const accountId = randomUUID();
  const pool = createLivePool();
  const reads = new LedgerRepository(pool) as ReadRepository;
  const occurredAt = '2026-08-30T08:00:00.000Z';

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
      await client.query('commit');
    });
    for (const [key, title, time] of [
      ['ledger-read-1', 'Groceries', occurredAt],
      ['ledger-read-2', 'Groceries late', occurredAt],
      ['ledger-read-3', 'Taxi', '2026-08-29T08:00:00.000Z'],
    ] as const) {
      await reads.mutate({
        operation: 'createTransaction',
        scope: 'ledger.transaction.create',
        principal: owner,
        command: {
          kind: 'expense',
          amountMinor: 100,
          currency: 'SAR',
          accountId,
          categoryId: null,
          title,
          merchant: null,
          paymentMethod: null,
          note: null,
          occurredAt: time,
          source: 'manual',
          externalRef: null,
        },
        idempotencyKey: key,
        requestId: key,
        status: 201,
      });
    }
  });

  afterAll(() => pool.onModuleDestroy());

  it('uses a deterministic occurred-at/UUID keyset page without duplicate boundary rows', async () => {
    const first = await reads.listTransactions(owner, { accountId, limit: 2 });
    const second = await reads.listTransactions(owner, {
      accountId,
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    expect([...first.items, ...second.items].map(({ id }) => id)).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(3);
    expect(first.items.map(({ occurredAt: value }) => value)).toEqual([occurredAt, occurredAt]);
  });

  it('matches bounded token prefixes and returns the balance projection plus its ledger version', async () => {
    const page = await reads.listTransactions(owner, { accountId, query: 'Groc', limit: 25 });
    const summary = await reads.getAccountSummary(owner, accountId, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
    });

    expect(page.items.map(({ title }) => title).sort()).toEqual(['Groceries', 'Groceries late']);
    expect(summary).toMatchObject({
      accountId,
      balance: { confirmedMinor: -300, pendingMinor: 0, ledgerVersion: 3 },
      ledgerVersion: 3,
    });
  });

  it('uses a bounded number of database statements for a 100-row page rather than one query per row', async () => {
    const originalWithClient = pool.withClient.bind(pool);
    let queryCount = 0;
    const countedPool = Object.create(pool) as typeof pool;
    countedPool.withClient = async (work) =>
      originalWithClient(async (client) => {
        const query = client.query.bind(client) as (
          text: string,
          values?: unknown[],
        ) => Promise<unknown>;
        client.query = ((...args: Parameters<typeof query>) => {
          queryCount += 1;
          return query(...args);
        }) as typeof client.query;
        return work(client);
      });
    const countedReads = new LedgerRepository(countedPool) as ReadRepository;

    await countedReads.listTransactions(owner, { accountId, limit: 100 });

    expect(queryCount).toBeLessThanOrEqual(4);
  });
});
