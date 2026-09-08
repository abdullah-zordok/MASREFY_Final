import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type Principal = { userId: string; sessionId: string; factorAgeSeconds: number };
type Page = {
  items: Array<{
    id: string;
    title: string;
    occurredAt: string;
    sourceAccountId: string;
    destinationAccountId: string | null;
  }>;
  nextCursor: string | null;
  ledgerVersion: number;
};
type ReadRepository = LedgerRepository & {
  listTransactions(principal: Principal, query: Record<string, unknown>): Promise<Page>;
  getTransaction(
    principal: Principal,
    transactionId: string,
  ): Promise<{
    transaction: {
      id: string;
      sourceAccountId: string;
      destinationAccountId: string | null;
    };
  }>;
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
  const transferAccountId = randomUUID();
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
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$3,'Cash','cash','SAR'),($2,$3,'Bank','bank','SAR')",
        [accountId, transferAccountId, owner.userId],
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

  it('returns transfer roles independently from sorted account membership', async () => {
    const [destinationAccountId, sourceAccountId] = [accountId, transferAccountId].sort();
    const transfer = (await reads.mutate({
      operation: 'transfer',
      scope: 'ledger.transfer.create',
      principal: owner,
      command: {
        sourceAccountId,
        destinationAccountId,
        amountMinor: 100,
        currency: 'SAR',
        feeMinor: 0,
        feeAccountId: sourceAccountId,
        occurredAt,
        title: 'Role ordered transfer',
        note: null,
      },
      idempotencyKey: 'ledger-read-transfer-role',
      requestId: 'ledger-read-transfer-role',
      status: 201,
    })) as { transaction: { transaction: { id: string } } };

    const page = await reads.listTransactions(owner, { limit: 25 });

    expect(page.items.find(({ id }) => id === transfer.transaction.transaction.id)).toMatchObject({
      sourceAccountId,
      destinationAccountId,
    });
  });

  it('maps an income account as source in mutation, list, and detail summaries', async () => {
    const response = (await reads.mutate({
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal: owner,
      command: {
        kind: 'income',
        amountMinor: 250,
        currency: 'SAR',
        accountId,
        categoryId: null,
        title: 'Income role mapping',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt,
        source: 'manual',
        externalRef: null,
      },
      idempotencyKey: 'ledger-read-income-role',
      requestId: 'ledger-read-income-role',
      status: 201,
    })) as {
      transaction: {
        transaction: {
          id: string;
          sourceAccountId: string;
          destinationAccountId: string | null;
        };
      };
    };
    const expected = { sourceAccountId: accountId, destinationAccountId: null };
    const id = response.transaction.transaction.id;

    expect(response.transaction.transaction).toMatchObject(expected);
    const page = await reads.listTransactions(owner, { limit: 25 });
    const detail = await reads.getTransaction(owner, id);
    expect(page.items.find((item) => item.id === id)).toMatchObject(expected);
    expect(detail.transaction).toMatchObject({ id, ...expected });
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
