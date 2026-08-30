import { randomUUID } from 'node:crypto';

import { HttpException } from '@nestjs/common';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('ledger transaction write boundary', () => {
  const owner = {
    userId: `ledger_write_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const accountId = randomUUID();
  const requestId = `ledger-${randomUUID()}`;
  const command = {
    kind: 'expense',
    amountMinor: 1250,
    currency: 'SAR',
    accountId,
    categoryId: null,
    title: 'Groceries',
    merchant: null,
    paymentMethod: 'card',
    note: null,
    occurredAt: new Date().toISOString(),
    source: 'manual',
    externalRef: null,
  };
  const pool = createLivePool();
  const repository = new LedgerRepository(pool);

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
  });
  afterAll(() => pool.onModuleDestroy());

  const input = (key = 'ledger-key-1234', body = command) => ({
    operation: 'createTransaction',
    scope: 'ledger.transaction.create',
    principal: owner,
    command: body,
    idempotencyKey: key,
    requestId,
    status: 201,
  });

  it('atomically commits and replays one exact financial effect and two contract outbox records', async () => {
    const first = (await repository.mutate(input())) as {
      transaction: { transaction: { id: string } };
      requestId: string;
    };
    const replay = await repository.mutate(input());
    expect(replay).toEqual(first);
    expect(first.requestId).toBe(requestId);
    const evidence = await pool.query<{
      headers: string;
      postings: string;
      revisions: string;
      balance: string;
      audits: string;
      events: string;
      keys: string;
    }>(
      `select
       (select count(*)::text from public.transactions where id=$1) headers,
       (select count(*)::text from public.transaction_postings where transaction_id=$1) postings,
       (select count(*)::text from audit.transaction_revisions where transaction_id=$1) revisions,
       (select confirmed_minor::text from public.account_balances where account_id=$2) balance,
       (select count(*)::text from audit.audit_events where request_id=$3) audits,
       (select count(*)::text from private.outbox_events where aggregate_id=$1) events,
       (select count(*)::text from private.idempotency_keys where actor_id=$4 and scope='ledger.transaction.create') keys`,
      [first.transaction.transaction.id, accountId, requestId, owner.userId],
    );
    expect(evidence.rows[0]).toEqual({
      headers: '1',
      postings: '1',
      revisions: '1',
      balance: '-1250',
      audits: '1',
      events: '2',
      keys: '1',
    });
  });

  it('rejects a changed request for the same key and rolls back a failed owner/account command including its claim', async () => {
    await expect(
      repository.mutate(input('ledger-key-1234', { ...command, amountMinor: 1251 })),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    const failedKey = 'ledger-key-failed';
    await expect(
      repository.mutate(input(failedKey, { ...command, accountId: randomUUID() })),
    ).rejects.toBeInstanceOf(HttpException);
    const count = await pool.query<{ count: string }>(
      "select count(*)::text count from private.idempotency_keys where actor_id=$1 and key_hash<>'' and state='claimed'",
      [owner.userId],
    );
    expect(count.rows[0]?.count).toBe('0');
  });
});
