import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import { buildLedgerEvent } from '../../../src/ledger/ledger.events';
import {
  normalizeCreateTransaction,
  normalizeLedgerRead,
  normalizeRevision,
  normalizeTransfer,
} from '../../../src/ledger/ledger.dto';
import { LedgerRepository } from '../../../src/ledger/ledger.repository';
import { assertMetricLabels } from '../../../src/platform/observability/platform-metrics';
import { safeError } from '../../../src/platform/http/safe-exception.filter';
import { createLivePool, describeLiveDatabase } from '../../live-database';

const accountId = '10000000-0000-4000-8000-000000000001';
const otherAccountId = '10000000-0000-4000-8000-000000000002';
const transactionId = '10000000-0000-4000-8000-000000000003';
const now = new Date('2026-08-30T08:01:00.000Z');

describe('ledger OWASP API3/API8 and ASVS V5 input and telemetry boundaries', () => {
  const create = {
    kind: 'expense',
    amountMinor: 100,
    currency: 'SAR',
    accountId,
    categoryId: null,
    title: 'Groceries',
    merchant: null,
    paymentMethod: null,
    note: null,
    occurredAt: '2026-08-30T08:00:00.000Z',
  };

  it.each([
    ['create userId', { ...create, userId: 'another-user' }],
    ['create status', { ...create, status: 'confirmed' }],
    ['create version', { ...create, version: 99 }],
    [
      'transfer fee authority',
      {
        sourceAccountId: accountId,
        destinationAccountId: otherAccountId,
        amountMinor: 100,
        currency: 'SAR',
        feeMinor: 0,
        occurredAt: '2026-08-30T08:00:00.000Z',
        title: 'Move',
        transactionId,
      },
    ],
  ])('rejects mass-assigned %s', (_name, body) => {
    const normalize = 'sourceAccountId' in body ? normalizeTransfer : normalizeCreateTransaction;
    expect(() => normalize(body, now)).toThrow('VALIDATION_FAILED');
  });

  it('rejects mass-assigned immutable revision properties', () => {
    expect(() =>
      normalizeRevision(
        {
          expectedVersion: 1,
          reason: 'Correction',
          title: 'Corrected',
          userId: 'another-user',
        },
        now,
      ),
    ).toThrow('VALIDATION_FAILED');
  });

  it('turns SQL-looking search text into bounded tokens instead of a query language', () => {
    expect(normalizeLedgerRead({ query: "'; select pg_sleep(10); --" })).toMatchObject({
      query: "'; select pg_sleep(10); --",
      limit: 25,
    });
  });

  it('keeps database detail, credentials, and raw financial values out of error, event, and metric payloads', () => {
    const error = safeError(503, 'ledger-hardening', [], 'LEDGER_UNAVAILABLE');
    expect(error).toEqual({
      code: 'LEDGER_UNAVAILABLE',
      message: 'Ledger is unavailable',
      requestId: 'ledger-hardening',
    });
    expect(JSON.stringify(error)).not.toMatch(/password|sqlstate|amount|balance/i);

    const event = buildLedgerEvent('transaction.created', {
      transactionId,
      kind: 'expense',
      accountIds: [accountId],
      version: 1,
      ledgerVersion: 1,
      occurredAt: '2026-08-30T08:00:00.000Z',
      requestId: 'ledger-hardening',
    });
    expect(event).not.toHaveProperty('amountMinor');
    expect(() => buildLedgerEvent('transaction.created', { ...event, amountMinor: 100 })).toThrow(
      'LEDGER_EVENT_INVALID',
    );
    for (const label of ['user_id', 'account_id', 'transaction_id', 'amount_minor', 'request_id']) {
      expect(() => {
        assertMetricLabels({ [label]: 'sensitive' });
      }).toThrow('METRIC_LABEL_INVALID');
    }
  });
});

type Principal = { userId: string; sessionId: string; factorAgeSeconds: number };
type LedgerReads = LedgerRepository & {
  listTransactions(
    principal: Principal,
    query: Record<string, unknown>,
  ): Promise<{
    items: Array<{ id: string }>;
  }>;
  getTransaction(principal: Principal, id: string): Promise<unknown>;
  getAccountSummary(
    principal: Principal,
    id: string,
    query: Record<string, unknown>,
  ): Promise<unknown>;
};
type DirectRole = 'anon' | 'authenticated' | 'masarifi_worker' | 'masarifi_migration';

describeLiveDatabase('ledger OWASP API1/API3/API5 and ASVS V4 database boundaries', () => {
  const owner = {
    userId: `ledger_hardening_owner_${randomUUID()}`,
    sessionId: 'owner',
    factorAgeSeconds: 0,
  };
  const nonowner = {
    userId: `ledger_hardening_nonowner_${randomUUID()}`,
    sessionId: 'other',
    factorAgeSeconds: 0,
  };
  const admin = {
    userId: `ledger_hardening_admin_${randomUUID()}`,
    sessionId: 'admin',
    factorAgeSeconds: 0,
  };
  const ownerAccountId = randomUUID();
  const nonownerAccountId = randomUUID();
  const pool = createLivePool();
  const ledger = new LedgerRepository(pool) as LedgerReads;
  let ownerTransactionId = '';
  let nonownerTransactionId = '';

  async function asRole<T>(
    role: DirectRole,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(`set local role ${role}`);
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  async function createTransaction(principal: Principal, id: string, key: string): Promise<void> {
    const result = (await ledger.mutate({
      operation: 'createTransaction',
      scope: 'ledger.transaction.create',
      principal,
      command: {
        kind: 'expense',
        amountMinor: 100,
        currency: 'SAR',
        accountId: id,
        categoryId: null,
        title: 'Private salary',
        merchant: null,
        paymentMethod: null,
        note: null,
        occurredAt: new Date().toISOString(),
        source: 'manual',
        externalRef: null,
      },
      idempotencyKey: key,
      requestId: key,
      status: 201,
    })) as { transaction: { transaction: { id: string } } };
    if (principal.userId === owner.userId) ownerTransactionId = result.transaction.transaction.id;
    else nonownerTransactionId = result.transaction.transaction.id;
  }

  beforeAll(async () => {
    await asRole('masarifi_migration', async (client) => {
      await client.query(
        "insert into public.profiles(id,status) values($1,'active'),($2,'active'),($3,'active')",
        [owner.userId, nonowner.userId, admin.userId],
      );
      await client.query("insert into public.admin_profiles(user_id,status) values($1,'active')", [
        admin.userId,
      ]);
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Owner','cash','SAR'),($3,$4,'Other','cash','SAR')",
        [ownerAccountId, owner.userId, nonownerAccountId, nonowner.userId],
      );
    });
    await createTransaction(owner, ownerAccountId, `ledger-hardening-owner-${randomUUID()}`);
    await createTransaction(nonowner, nonownerAccountId, `ledger-hardening-other-${randomUUID()}`);
  });

  afterAll(() => pool.onModuleDestroy());

  it('prevents BOLA and BFLA from disclosing another customer or an Admin ledger row', async () => {
    await expect(ledger.getTransaction(owner, nonownerTransactionId)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    await expect(ledger.getAccountSummary(owner, nonownerAccountId, {})).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    await expect(ledger.getTransaction(admin, ownerTransactionId)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  it('contains SQL-looking search text to the owner-scoped parameterized read', async () => {
    const result = await ledger.listTransactions(owner, { query: "'; select pg_sleep(10); --" });
    expect(result.items.map(({ id }) => id)).not.toContain(nonownerTransactionId);
  });

  it('denies direct table, view, and money-RPC access outside the API boundary', async () => {
    for (const role of ['anon', 'authenticated', 'masarifi_worker'] as const) {
      for (const relation of [
        'private.idempotency_keys',
        'public.transactions',
        'public.transaction_postings',
        'audit.transaction_revisions',
        'public.account_balances',
        'public.v_account_balance_summary',
      ]) {
        await expect(
          asRole(role, (client) => client.query(`select * from ${relation} limit 1`)),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        asRole(role, (client) =>
          client.query('select private.post_transaction($1,$2::jsonb)', [owner.userId, '{}']),
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('keeps RLS forced, grants minimum, and security-definer search paths empty', async () => {
    const tables = await asRole('masarifi_migration', (client) =>
      client.query<{
        name: string;
        rls: boolean;
        forced: boolean;
        anon_select: boolean;
        auth_select: boolean;
        worker_select: boolean;
      }>(`
      select n.nspname||'.'||c.relname name,c.relrowsecurity rls,c.relforcerowsecurity forced,
        has_table_privilege('anon',c.oid,'select') anon_select,
        has_table_privilege('authenticated',c.oid,'select') auth_select,
        has_table_privilege('masarifi_worker',c.oid,'select') worker_select
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where (n.nspname,c.relname) in (
        ('private','idempotency_keys'),('public','transactions'),('public','transaction_postings'),
        ('audit','transaction_revisions'),('public','account_balances')
      ) order by 1
    `),
    );
    expect(tables.rows).toHaveLength(5);
    for (const row of tables.rows) {
      expect(row).toMatchObject({
        rls: true,
        forced: true,
        anon_select: false,
        auth_select: false,
        worker_select: false,
      });
    }

    const functions = await asRole('masarifi_migration', (client) =>
      client.query<{
        name: string;
        security_definer: boolean;
        search_path: string;
        public_execute: boolean;
      }>(
        `
      select p.proname name,p.prosecdef security_definer,
        coalesce((select value from unnest(p.proconfig) value where value like 'search_path=%' limit 1),'') search_path,
        has_function_privilege('public',p.oid,'execute') public_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname = any($1::text[])
      order by p.proname
    `,
        [
          [
            'claim_idempotency_key',
            'complete_idempotency_key',
            'post_transaction',
            'transfer_funds',
            'post_opening_transaction',
            'revise_transaction',
            'refund_transaction',
            'reverse_transaction',
            'soft_delete_transaction',
            'restore_transaction',
            'reconcile_account_balance',
          ],
        ],
      ),
    );
    expect(functions.rows).toHaveLength(11);
    for (const row of functions.rows) {
      expect(row).toMatchObject({
        security_definer: true,
        search_path: 'search_path=""',
        public_execute: false,
      });
    }
  });
});
