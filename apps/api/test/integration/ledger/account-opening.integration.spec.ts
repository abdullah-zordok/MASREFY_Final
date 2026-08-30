import { randomUUID } from 'node:crypto';

import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { hashIdempotencyKey } from '../../../src/ledger/idempotency';
import { normalizeCreateAccount } from '../../../src/reference/reference.dto';
import {
  ReferenceRepository,
  type ReferenceOperation,
} from '../../../src/reference/reference.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

type AccountOpeningResponse = { account: { id: string }; openingTransactionId: string | null };

describeLiveDatabase('atomic account opening', () => {
  const owner = {
    userId: `ledger_open_${randomUUID()}`,
    sessionId: 'session',
    factorAgeSeconds: 0,
  };
  const pool = createLivePool();
  const ledger = new LedgerRepository(pool);
  const reference = new ReferenceRepository(pool);

  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status)values($1,'active')", [owner.userId]);
    await pool.query(`
      create or replace function private.phase05_test_atomicity_failure()
      returns trigger language plpgsql set search_path='' as $$
      begin raise exception 'PHASE05_INJECTED_FAILURE'; end $$
    `);
  });

  afterAll(async () => {
    await pool.query('drop function if exists private.phase05_test_atomicity_failure() cascade');
    await pool.onModuleDestroy();
  });

  const input = (key: string, name: string, openingBalanceMinor: number): ReferenceOperation => ({
    operation: 'createAccount',
    principal: owner,
    requestId: `req-${key}`,
    idempotencyKey: key,
    query: {},
    params: {},
    body: normalizeCreateAccount({ name, type: 'cash', currency: 'SAR', openingBalanceMinor }),
  });

  async function expectInjectedRollback(
    key: string,
    table: 'audit.audit_events' | 'private.outbox_events' | 'private.idempotency_keys',
    event: 'insert' | 'update',
    predicate: string,
  ): Promise<void> {
    const before = await pool.query<{ transactions: string }>(
      'select count(*)::text transactions from public.transactions where user_id=$1',
      [owner.userId],
    );
    await pool.query(
      `create trigger phase05_test_atomicity before ${event} on ${table}
       for each row when (${predicate}) execute function private.phase05_test_atomicity_failure()`,
    );
    try {
      await expect(ledger.createAccount(input(key, key, 100), reference)).rejects.toMatchObject({
        response: { code: 'LEDGER_UNAVAILABLE' },
      });
    } finally {
      await pool.query(`drop trigger phase05_test_atomicity on ${table}`);
    }
    const evidence = await pool.query<{ accounts: string; transactions: string; keys: string }>(
      `select
        (select count(*)::text from public.accounts where user_id=$1 and name=$2) accounts,
        (select count(*)::text from public.transactions where user_id=$1) transactions,
        (select count(*)::text from private.idempotency_keys where actor_id=$1
          and scope='reference.account.create' and key_hash=$3) keys`,
      [owner.userId, key, hashIdempotencyKey(key)],
    );
    expect(evidence.rows[0]?.accounts).toBe('0');
    expect(evidence.rows[0]?.transactions).toBe(before.rows[0]?.transactions);
    expect(evidence.rows[0]?.keys).toBe('0');
  }

  it('commits and replays one account/opening effect and both ledger outbox records', async () => {
    const command = input('opening-positive', 'Positive', 500);
    const first = (await ledger.createAccount(command, reference)) as AccountOpeningResponse;
    expect(await ledger.createAccount(command, reference)).toEqual(first);
    expect(first.openingTransactionId).toMatch(/^[0-9a-f-]{36}$/);
    const evidence = await pool.query<{
      accounts: string;
      transactions: string;
      postings: string;
      balance: string;
      audits: string;
      events: string;
      keys: string;
    }>(
      `select
        (select count(*)::text from public.accounts where id=$1) accounts,
        (select count(*)::text from public.transactions where id=$2) transactions,
        (select count(*)::text from public.transaction_postings where transaction_id=$2) postings,
        (select confirmed_minor::text from public.account_balances where account_id=$1) balance,
        (select count(*)::text from audit.audit_events where request_id=$3 and actor_id=$4) audits,
        (select count(*)::text from private.outbox_events where aggregate_id in($1,$2)) events,
        (select count(*)::text from private.idempotency_keys where actor_id=$4
          and scope='reference.account.create') keys`,
      [first.account.id, first.openingTransactionId, command.requestId, owner.userId],
    );
    expect(evidence.rows[0]).toEqual({
      accounts: '1',
      transactions: '1',
      postings: '1',
      balance: '500',
      audits: '2',
      events: '3',
      keys: '1',
    });
  });

  it('supports negative opening, creates no transaction for zero, and rolls account back if posting fails', async () => {
    const negative = (await ledger.createAccount(
      input('opening-negative', 'Negative', -250),
      reference,
    )) as AccountOpeningResponse;
    const neg = await pool.query<{ amount_minor: string }>(
      'select amount_minor from public.transaction_postings where transaction_id=$1',
      [negative.openingTransactionId],
    );
    expect(neg.rows[0]?.amount_minor).toBe('-250');

    const zero = (await ledger.createAccount(
      input('opening-zero', 'Zero', 0),
      reference,
    )) as AccountOpeningResponse;
    expect(zero.openingTransactionId).toBeNull();
    const zeroCount = await pool.query<{ transactions: string; balance: string }>(
      `select
        (select count(*)::text from public.transactions where user_id=$1
          and title='Opening balance' and id is not distinct from $2::uuid) transactions,
        (select confirmed_minor::text from public.account_balances where account_id=$3) balance`,
      [owner.userId, zero.openingTransactionId, zero.account.id],
    );
    expect(zeroCount.rows[0]).toEqual({ transactions: '0', balance: '0' });

    const failed: ReferenceOperation = {
      ...input('opening-failed', 'Must Roll Back', 1),
      body: {
        ...input('x-opening', 'x', 1).body,
        openingBalanceMinor: Number.MAX_SAFE_INTEGER + 1,
        name: 'Must Roll Back',
      },
    };
    await expect(ledger.createAccount(failed, reference)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED' },
    });
    const rolled = await pool.query<{ count: string }>(
      "select count(*)::text count from public.accounts where user_id=$1 and name='Must Roll Back'",
      [owner.userId],
    );
    expect(rolled.rows[0]?.count).toBe('0');
  });

  it('rolls back every injected audit, outbox, and completion boundary', async () => {
    await expectInjectedRollback(
      'opening-fail-account-audit',
      'audit.audit_events',
      'insert',
      "new.action='account.created'",
    );
    await expectInjectedRollback(
      'opening-fail-account-outbox',
      'private.outbox_events',
      'insert',
      "new.event_type='account.created'",
    );
    await expectInjectedRollback(
      'opening-fail-ledger-audit',
      'audit.audit_events',
      'insert',
      "new.action='transaction.created'",
    );
    await expectInjectedRollback(
      'opening-fail-ledger-outbox',
      'private.outbox_events',
      'insert',
      "new.event_type='transaction.created'",
    );
    await expectInjectedRollback(
      'opening-fail-complete',
      'private.idempotency_keys',
      'update',
      "new.state='completed' and old.state='claimed'",
    );
  });
});
