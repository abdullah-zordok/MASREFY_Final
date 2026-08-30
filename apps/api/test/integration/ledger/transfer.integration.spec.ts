import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type LedgerResponse = {
  transaction: { transaction: { id: string }; postings: Array<{ amountMinor: number }> };
  balances: Array<{ confirmedMinor: number }>;
};

describeLiveDatabase('ledger transfer', () => {
  const owner = {
    userId: `ledger_transfer_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const [sourceAccountId, destinationAccountId, feeAccountId, usdAccountId] = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const pool = createLivePool(),
    repository = new LedgerRepository(pool);
  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query("insert into public.profiles(id,status) values($1,'active')", [
        owner.userId,
      ]);
      await client.query(
        `insert into public.accounts(id,user_id,name,type,currency_code) values
        ($1,$5,'Source','cash','SAR'),($2,$5,'Destination','cash','SAR'),
        ($3,$5,'Fees','cash','SAR'),($4,$5,'USD','cash','USD')`,
        [sourceAccountId, destinationAccountId, feeAccountId, usdAccountId, owner.userId],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());
  const mutation = (key: string, command: Record<string, unknown>) => ({
    operation: 'transfer',
    scope: 'ledger.transfer.create',
    principal: owner,
    command,
    idempotencyKey: key,
    requestId: `req-${key}`,
    status: 201,
  });
  const command = {
    sourceAccountId,
    destinationAccountId,
    amountMinor: 100,
    currency: 'SAR',
    feeMinor: 5,
    feeAccountId,
    occurredAt: new Date().toISOString(),
    title: 'Transfer',
    note: null,
  };

  it('posts source, destination, and fee exactly once and replays identically', async () => {
    const first = (await repository.mutate(
      mutation('transfer-key-100', command),
    )) as LedgerResponse;
    expect(await repository.mutate(mutation('transfer-key-100', command))).toEqual(first);
    expect(
      first.transaction.postings
        .map((row: { amountMinor: number }) => row.amountMinor)
        .sort((a: number, b: number) => a - b),
    ).toEqual([-100, -5, 100]);
    expect(
      first.balances
        .map((row: { confirmedMinor: number }) => row.confirmedMinor)
        .sort((a: number, b: number) => a - b),
    ).toEqual([-100, -5, 100]);
    const events = await pool.query<{ event_type: string }>(
      'select event_type from private.outbox_events where aggregate_id=$1 order by event_type',
      [first.transaction.transaction.id],
    );
    expect(events.rows).toEqual([
      { event_type: 'balance.changed' },
      { event_type: 'transfer.created' },
    ]);
  });

  it('rejects cross-currency atomically and serializes opposite transfers without deadlock or lost projection', async () => {
    await expect(
      repository.mutate(
        mutation('transfer-key-usd', { ...command, destinationAccountId: usdAccountId }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CURRENCY_MISMATCH' } });
    const jobs = Array.from({ length: 8 }, (_, index) => [
      repository.mutate(
        mutation(`opposite-a-${String(index)}`, {
          ...command,
          amountMinor: 10,
          feeMinor: 0,
          feeAccountId: sourceAccountId,
          title: `A ${String(index)}`,
        }),
      ),
      repository.mutate(
        mutation(`opposite-b-${String(index)}`, {
          ...command,
          sourceAccountId: destinationAccountId,
          destinationAccountId: sourceAccountId,
          amountMinor: 10,
          feeMinor: 0,
          feeAccountId: destinationAccountId,
          title: `B ${String(index)}`,
        }),
      ),
    ]).flat();
    expect((await Promise.allSettled(jobs)).every(({ status }) => status === 'fulfilled')).toBe(
      true,
    );
    const balances = await pool.query<{ account_id: string; confirmed_minor: string }>(
      'select account_id,confirmed_minor from public.account_balances where account_id=any($1::uuid[]) order by account_id',
      [[sourceAccountId, destinationAccountId, feeAccountId]],
    );
    expect(balances.rows.reduce((sum, row) => sum + Number(row.confirmed_minor), 0)).toBe(-5);
  });
});
