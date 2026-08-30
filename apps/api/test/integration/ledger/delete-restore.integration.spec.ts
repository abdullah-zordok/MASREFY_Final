import { randomUUID } from 'node:crypto';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type LedgerResponse = {
  transaction: {
    transaction: {
      id: string;
      status: string;
      version: number;
      deletedAt: string | null;
      undoExpiresAt: string | null;
    };
    postings: Array<{ amountMinor: number }>;
  };
  balances: Array<{ confirmedMinor: number }>;
  transactionId?: string;
  version?: number;
  deletedAt?: string;
  undoExpiresAt?: string;
};
describeLiveDatabase('soft delete and fixed-window restore', () => {
  const owner = {
      userId: `ledger_delete_${randomUUID()}`,
      sessionId: 'session',
      factorAgeSeconds: 0,
    },
    accountId = randomUUID(),
    pool = createLivePool(),
    repository = new LedgerRepository(pool);
  const mutate = (
    operation: string,
    scope: string,
    key: string,
    command: Record<string, unknown>,
  ) =>
    repository.mutate({
      operation,
      scope,
      principal: owner,
      idempotencyKey: key,
      requestId: `req-${key}`,
      status: 200,
      command,
    }) as Promise<LedgerResponse>;
  const create = async (key: string) => {
    const result = (await repository.mutate({
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal: owner,
      idempotencyKey: `create-${key}`,
      requestId: `create-${key}`,
      status: 201,
      command: {
        kind: 'expense',
        amountMinor: 1000,
        currency: 'SAR',
        accountId,
        categoryId: null,
        title: key,
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt: new Date().toISOString(),
        source: 'manual',
        externalRef: null,
      },
    })) as LedgerResponse;
    return result.transaction.transaction.id;
  };
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status)values($1,'active')", [
        owner.userId,
      ]);
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code)values($1,$2,'Cash','cash','SAR')",
        [accountId, owner.userId],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());
  it('compensates, replays without extending the server deadline, and restores from protected evidence after repository restart', async () => {
    const id = await create('delete-main');
    const deleted = await mutate(
      'deleteTransaction',
      'ledger.transaction.delete',
      'delete-main-key',
      { transactionId: id, expectedVersion: 1, reason: 'Mistake' },
    );
    expect(deleted).toMatchObject({
      transactionId: id,
      version: 2,
      balances: [{ confirmedMinor: 0 }],
    });
    expect(Date.parse(deleted.undoExpiresAt ?? '') - Date.parse(deleted.deletedAt ?? '')).toBe(
      30000,
    );
    const restarted = new LedgerRepository(pool);
    expect(
      await restarted.mutate({
        operation: 'deleteTransaction',
        scope: 'ledger.transaction.delete',
        principal: owner,
        idempotencyKey: 'delete-main-key',
        requestId: 'req-delete-main-key',
        status: 200,
        command: { transactionId: id, expectedVersion: 1, reason: 'Mistake' },
      }),
    ).toEqual(deleted);
    const restored = await mutate(
      'restoreTransaction',
      'ledger.transaction.restore',
      'restore-main-key',
      { transactionId: id, expectedVersion: 2 },
    );
    expect(restored.transaction.transaction).toMatchObject({
      id,
      status: 'confirmed',
      version: 3,
      deletedAt: null,
      undoExpiresAt: null,
    });
    expect(restored.balances.at(0)?.confirmedMinor).toBe(-1000);
    expect(
      restored.transaction.postings.map((row: { amountMinor: number }) => row.amountMinor),
    ).toEqual([-1000, 1000, -1000]);
  });
  it('rejects dependencies and expired server-time undo without changing projections', async () => {
    const dependent = await create('delete-dependent');
    await repository.mutate({
      operation: 'refundTransaction',
      scope: 'ledger.transaction.refund',
      principal: owner,
      idempotencyKey: 'dependent-refund',
      requestId: 'dependent-refund',
      status: 201,
      command: {
        transactionId: dependent,
        expectedVersion: 1,
        amountMinor: 100,
        accountId,
        occurredAt: new Date().toISOString(),
        reason: 'Partial',
      },
    });
    await expect(
      mutate('deleteTransaction', 'ledger.transaction.delete', 'delete-dependent-key', {
        transactionId: dependent,
        expectedVersion: 2,
        reason: 'Hide',
      }),
    ).rejects.toMatchObject({ response: { code: 'TRANSACTION_HAS_DEPENDENTS' } });
    const expired = await create('delete-expired');
    await mutate('deleteTransaction', 'ledger.transaction.delete', 'delete-expired-key', {
      transactionId: expired,
      expectedVersion: 1,
      reason: 'Mistake',
    });
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local session_replication_role=replica');
      await client.query(
        "with x as(select clock_timestamp()-interval '31 seconds' d) update public.transactions set deleted_at=x.d,undo_expires_at=x.d+interval '30 seconds' from x where id=$1",
        [expired],
      );
      await client.query('commit');
    });
    await expect(
      mutate('restoreTransaction', 'ledger.transaction.restore', 'restore-expired-key', {
        transactionId: expired,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ response: { code: 'UNDO_EXPIRED' } });
    const balance = await pool.query<{ confirmed_minor: string }>(
      'select confirmed_minor from public.account_balances where account_id=$1',
      [accountId],
    );
    expect(Number(balance.rows[0]?.confirmed_minor)).toBe(-1900);
  });
});
