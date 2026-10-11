import { randomUUID } from 'node:crypto';

import { IdentityRepository } from '../../../src/identity/identity.repository';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('authenticated default Cash onboarding', () => {
  const pool = createLivePool();
  const identity = new IdentityRepository(pool);

  async function customer() {
    const userId = `cash_${randomUUID()}`;
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [userId]);
    await pool.query('insert into public.user_preferences(user_id) values($1)', [userId]);
    return { userId, sessionId: 'cash_session', factorAgeSeconds: 0 };
  }

  async function selectCurrency(owner: Awaited<ReturnType<typeof customer>>, currency = 'SAR') {
    const before = await identity.getPreferences(owner);
    return identity.replacePreferences(owner, {
      ...before,
      defaultCurrency: currency,
      currencySelectionConfirmed: true,
      expectedVersion: before.version,
    });
  }

  async function accounts(userId: string) {
    return (
      await pool.query<{ id: string }>(
        'select * from public.accounts where user_id=$1 order by id',
        [userId],
      )
    ).rows;
  }

  afterAll(async () => {
    // Leave evidence rows inside this disposable database, matching the other ledger suites.
    await pool.onModuleDestroy();
  });

  it('creates one owned active default zero Cash atomically when currency is selected', async () => {
    const owner = await customer();
    await selectCurrency(owner, 'AED');
    expect(await accounts(owner.userId)).toMatchObject([
      {
        user_id: owner.userId,
        name: 'النقدية',
        type: 'cash',
        currency_code: 'AED',
        status: 'active',
        is_default: true,
      },
    ]);
    const evidence = (
      await pool.query(
        `select
      (select count(*)::int from public.transactions where user_id=$1) transactions,
      (select count(*)::int from public.transaction_postings p join public.accounts a on a.id=p.account_id where a.user_id=$1) postings,
      (select confirmed_minor::text from public.v_account_balance_summary b join public.accounts a on a.id=b.account_id where a.user_id=$1) balance`,
        [owner.userId],
      )
    ).rows[0];
    expect(evidence).toEqual({ transactions: 0, postings: 0, balance: '0' });
  });

  it('does not treat bootstrap SAR or missing preferences as a selected currency', async () => {
    const owner = await customer();
    await identity.getProfile(owner);
    expect(await accounts(owner.userId)).toEqual([]);
    await pool.query('delete from public.user_preferences where user_id=$1', [owner.userId]);
    await identity.getProfile(owner);
    expect(await accounts(owner.userId)).toEqual([]);
  });

  it('does not infer currency selection from legacy preference edits or completed welcome', async () => {
    const owner = await customer();
    await pool.query("update public.user_preferences set language='en' where user_id=$1", [
      owner.userId,
    ]);
    await pool.query(
      "insert into public.onboarding_progress(user_id,step,completed_steps) values($1,'tracking_intro',array['welcome'])",
      [owner.userId],
    );
    await identity.getProfile(owner);
    expect(await accounts(owner.userId)).toEqual([]);
    expect(await identity.getPreferences(owner)).toMatchObject({ currencySelectionRequired: true });
  });

  it('does not provision from a legacy preference PUT that merely repeats bootstrap SAR', async () => {
    const owner = await customer();
    const before = await identity.getPreferences(owner);
    await identity.replacePreferences(owner, { ...before, expectedVersion: before.version });
    expect(await accounts(owner.userId)).toEqual([]);
    expect(await identity.getPreferences(owner)).toMatchObject({ currencySelectionRequired: true });
  });

  it('recognizes a configured owned default matching the enabled preference currency without backfill', async () => {
    const owner = await customer();
    await pool.query(
      "insert into public.accounts(user_id,name,type,currency_code,is_default) values($1,'Existing Test cash','cash','SAR',true)",
      [owner.userId],
    );
    const before = await accounts(owner.userId);
    expect(await identity.getPreferences(owner)).toMatchObject({
      currencySelectionRequired: false,
    });
    const preferences = await identity.getPreferences(owner);
    expect(
      await identity.replacePreferences(owner, {
        ...preferences,
        expectedVersion: preferences.version,
      }),
    ).toMatchObject({ currencySelectionRequired: false });
    expect(await accounts(owner.userId)).toEqual(before);
    expect(
      (
        await pool.query('select currency_selected from public.user_preferences where user_id=$1', [
          owner.userId,
        ])
      ).rows,
    ).toEqual([{ currency_selected: false }]);
  });

  it('requires selection when an existing default does not match the bootstrap preference currency', async () => {
    const owner = await customer();
    await pool.query(
      "insert into public.accounts(user_id,name,type,currency_code,is_default) values($1,'Existing bank','bank','EGP',true)",
      [owner.userId],
    );
    expect(await identity.getPreferences(owner)).toMatchObject({ currencySelectionRequired: true });
  });

  it('keeps hidden admin profiles readable without automatically creating Cash', async () => {
    const owner = await customer();
    await pool.query('insert into public.admin_profiles(user_id) values($1)', [owner.userId]);
    const visible = await identity.withCustomerTransaction(owner, (client) =>
      client.query('select user_id from public.admin_profiles where user_id=$1', [owner.userId]),
    );
    expect(visible.rows).toEqual([]);
    await selectCurrency(owner);
    expect(await identity.getProfile(owner)).toMatchObject({ status: 'active' });
    expect(await accounts(owner.userId)).toEqual([]);
    await expect(
      identity.withCustomerTransaction(owner, (client) =>
        client.query('select private.post_transaction($1,$2::jsonb)', [
          owner.userId,
          JSON.stringify({
            kind: 'expense',
            amountMinor: 100,
            currency: 'SAR',
            accountId: randomUUID(),
            title: 'Admin denied',
            occurredAt: new Date().toISOString(),
            source: 'manual',
          }),
        ]),
      ),
    ).rejects.toThrow('FINANCIAL_ACCESS_DENIED');
  });

  it('does not change the default of a sole account belonging to a hidden admin', async () => {
    const owner = await customer();
    await pool.query('insert into public.admin_profiles(user_id) values($1)', [owner.userId]);
    await pool.query(
      "insert into public.accounts(user_id,name,type,currency_code) values($1,'Admin bank','bank','SAR')",
      [owner.userId],
    );
    const before = await accounts(owner.userId);
    await identity.getProfile(owner);
    expect(await accounts(owner.userId)).toEqual(before);
  });

  it('retries across concurrent sessions without additional accounts or financial effects', async () => {
    const owner = await customer();
    await selectCurrency(owner);
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        identity.getProfile({ ...owner, sessionId: `device_${String(index)}` }),
      ),
    );
    expect(await accounts(owner.userId)).toHaveLength(1);
    expect(
      (
        await pool.query('select count(*)::int count from public.transactions where user_id=$1', [
          owner.userId,
        ])
      ).rows[0],
    ).toEqual({ count: 0 });
  });

  it('establishes a sole valid active account without changing its balance or name', async () => {
    const owner = await customer();
    await pool.query(
      "insert into public.accounts(user_id,name,type,currency_code) values($1,'Existing bank','bank','EGP')",
      [owner.userId],
    );
    await identity.getProfile(owner);
    expect(await accounts(owner.userId)).toMatchObject([
      { name: 'Existing bank', currency_code: 'EGP', is_default: true },
    ]);
  });

  it('preserves multiple accounts and existing default choice', async () => {
    const owner = await customer();
    for (const name of ['Bank one', 'Wallet two'])
      await pool.query(
        "insert into public.accounts(user_id,name,type,currency_code) values($1,$2,'wallet','SAR')",
        [owner.userId, name],
      );
    const before = await accounts(owner.userId);
    await identity.getProfile(owner);
    expect(await accounts(owner.userId)).toEqual(before);
    await selectCurrency(owner);
    expect(await accounts(owner.userId)).toEqual(before);
  });

  it('rejects suspended principals and never provisions for another owner', async () => {
    const owner = await customer();
    const other = await customer();
    await selectCurrency(owner);
    expect(await accounts(other.userId)).toEqual([]);
    await pool.query("update public.profiles set status='suspended' where id=$1", [other.userId]);
    await expect(identity.getProfile(other)).rejects.toThrow('PROFILE_INACTIVE');
    expect(await accounts(other.userId)).toEqual([]);
  });

  it('emits one account sync event across retries without financial transaction events', async () => {
    const owner = await customer();
    await selectCurrency(owner);
    await identity.getProfile(owner);
    await identity.getProfile(owner);
    const events = (
      await pool.query(
        "select event_type,payload from private.outbox_events where payload->>'userId'=$1",
        [owner.userId],
      )
    ).rows;
    expect(events).toMatchObject([
      { event_type: 'account.created', payload: { userId: owner.userId } },
    ]);
  });

  it('does not provision a disabled currency and still requires currency selection', async () => {
    const owner = await customer();
    await pool.query("update public.currencies set enabled=false where code='AED'");
    try {
      await selectCurrency(owner, 'AED');
      expect(await accounts(owner.userId)).toEqual([]);
      expect(await identity.getPreferences(owner)).toMatchObject({
        currencySelectionRequired: true,
      });
    } finally {
      await pool.query("update public.currencies set enabled=true where code='AED'");
    }
  });

  it('makes concurrent first-login provisioning converge on one account', async () => {
    const owner = await customer();
    await pool.query(
      "update public.user_preferences set currency_selected=true,default_currency='EGP' where user_id=$1",
      [owner.userId],
    );
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        identity.getProfile({ ...owner, sessionId: `first_device_${String(index)}` }),
      ),
    );
    expect(await accounts(owner.userId)).toMatchObject([
      { currency_code: 'EGP', is_default: true },
    ]);
  });

  it('serializes provisioning behind normal account creation using the same owner lock', async () => {
    const owner = await customer();
    await pool.query('update public.user_preferences set currency_selected=true where user_id=$1', [
      owner.userId,
    ]);
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
        `account-default:${owner.userId}`,
      ]);
      const pending = identity.getProfile(owner);
      await client.query(
        "insert into public.accounts(user_id,name,type,currency_code) values($1,'Chosen bank','bank','EGP')",
        [owner.userId],
      );
      await client.query('commit');
      await pending;
    });
    expect(await accounts(owner.userId)).toMatchObject([
      { name: 'Chosen bank', type: 'bank', is_default: true },
    ]);
  });

  it('locks default-changing account updates before rows so provisioning cannot deadlock', async () => {
    const owner = await customer();
    const inserted = await pool.query<{ id: string }>(
      "insert into public.accounts(user_id,name,type,currency_code) values($1,'Existing bank','bank','SAR') returning id",
      [owner.userId],
    );
    const accountId = inserted.rows[0]?.id;
    if (!accountId) throw new Error('Cash concurrency fixture account missing');
    const observer = createLivePool();
    const references = new ReferenceRepository(pool);
    let pending: Promise<unknown> | undefined;
    try {
      await identity.withCustomerTransaction(owner, async (client) => {
        const pid = (await client.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]
          ?.pid;
        if (!pid) throw new Error('Cash concurrency fixture backend missing');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
          `account-default:${owner.userId}`,
        ]);
        pending = references
          .execute({
            operation: 'updateAccount',
            principal: owner,
            requestId: randomUUID(),
            query: {},
            params: { accountId },
            body: { expectedVersion: 1, isDefault: true },
          })
          .catch((error: unknown) => error);
        const deadline = Date.now() + 3000;
        let waiting = false;
        while (Date.now() < deadline) {
          const blockers = await observer.query(
            "select 1 from pg_stat_activity where wait_event='advisory' and $1=any(pg_blocking_pids(pid))",
            [pid],
          );
          if (blockers.rowCount) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        // A waiting update must not already hold the account row needed by provisioning.
        await client.query('select id from public.accounts where id=$1 for update nowait', [
          accountId,
        ]);
        expect(
          (
            await client.query('select private.ensure_default_cash_account($1) outcome', [
              owner.userId,
            ])
          ).rows,
        ).toEqual([{ outcome: 'ready' }]);
      });
      // Provisioning increments the existing account version; the stale update gets its usual conflict.
      expect(await pending).toEqual(expect.objectContaining({ message: 'VERSION_CONFLICT' }));
      expect(await accounts(owner.userId)).toMatchObject([
        { id: accountId, is_default: true, version: '2' },
      ]);
    } finally {
      await pending;
      await observer.onModuleDestroy();
    }
  });

  it.each(['archived', 'closed'] as const)(
    'preserves a concurrently %s sole account without failing profile bootstrap or emitting an update',
    async (status) => {
      const owner = await customer();
      const inserted = await pool.query<{ id: string }>(
        "insert into public.accounts(user_id,name,type,currency_code) values($1,'Lifecycle bank','bank','SAR') returning id",
        [owner.userId],
      );
      const accountId = inserted.rows[0]?.id;
      if (!accountId) throw new Error('Cash lifecycle fixture account missing');
      const observer = createLivePool();
      let pending: Promise<unknown> | undefined;
      try {
        await pool.withClient(async (client) => {
          await client.query('begin');
          try {
            const pid = (await client.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]
              ?.pid;
            if (!pid) throw new Error('Cash lifecycle fixture backend missing');
            await client.query(
              "update public.accounts set status=$2,is_default=false,deleted_at=case when $2='archived' then clock_timestamp() else null end,closed_at=case when $2='closed' then clock_timestamp() else null end where id=$1",
              [accountId, status],
            );
            pending = identity.getProfile(owner).catch((error: unknown) => error);
            const deadline = Date.now() + 3000;
            let waiting = false;
            while (Date.now() < deadline) {
              const blockers = await observer.query(
                'select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))',
                [pid],
              );
              if (blockers.rowCount) {
                waiting = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            expect(waiting).toBe(true);
            await client.query('commit');
          } catch (error) {
            await client.query('rollback');
            throw error;
          }
        });
        expect(await pending).toMatchObject({ status: 'active' });
        expect(await accounts(owner.userId)).toMatchObject([
          { id: accountId, status, is_default: false, version: '2' },
        ]);
        const outcome = await identity.withCustomerTransaction(owner, (client) =>
          client.query('select private.ensure_default_cash_account($1) outcome', [owner.userId]),
        );
        expect(outcome.rows).toEqual([{ outcome: 'account_selection_required' }]);
        expect(
          (
            await pool.query(
              "select event_type from private.outbox_events where payload->>'userId'=$1",
              [owner.userId],
            )
          ).rows,
        ).toEqual([]);
      } finally {
        await pending;
        await observer.onModuleDestroy();
      }
    },
  );

  it('supports real expense and income ledger commands on provisioned zero Cash', async () => {
    const owner = await customer();
    await selectCurrency(owner);
    const accountId = (await accounts(owner.userId))[0]?.id;
    for (const [kind, amountMinor] of [
      ['expense', 5000],
      ['income', 2000],
    ] as const) {
      await identity.withCustomerTransaction(owner, (client) =>
        client.query('select private.post_transaction($1,$2::jsonb)', [
          owner.userId,
          JSON.stringify({
            kind,
            amountMinor,
            currency: 'SAR',
            accountId,
            title: `Disposable ${kind}`,
            occurredAt: new Date().toISOString(),
            source: 'manual',
          }),
        ]),
      );
    }
    expect(
      (
        await pool.query(
          'select confirmed_minor::text from public.account_balances where account_id=$1',
          [accountId],
        )
      ).rows[0],
    ).toEqual({ confirmed_minor: '-3000' });
    expect(
      (
        await pool.query('select count(*)::int count from public.transactions where user_id=$1', [
          owner.userId,
        ])
      ).rows[0],
    ).toEqual({ count: 2 });
  });

  it('rejects a mismatched owner and missing authenticated session at the SQL boundary', async () => {
    const owner = await customer();
    const other = await customer();
    await expect(
      identity.withCustomerTransaction(owner, (client) =>
        client.query('select private.ensure_default_cash_account($1)', [other.userId]),
      ),
    ).rejects.toThrow('AUTH_TOKEN_INVALID');
    await expect(
      identity.withCustomerTransaction({ ...owner, sessionId: '' }, (client) =>
        client.query('select private.ensure_default_cash_account($1)', [owner.userId]),
      ),
    ).rejects.toThrow('AUTH_TOKEN_INVALID');
    expect(await accounts(other.userId)).toEqual([]);
  });

  it('rolls back selected currency and account when provisioning fails', async () => {
    const owner = await customer();
    await pool.query(
      `create function private.cash_test_fail() returns trigger language plpgsql as $$ begin raise exception 'CASH_PROVISION_INJECTED_FAILURE'; end $$`,
    );
    await pool.query(
      `create trigger cash_test_failure before insert on public.accounts for each row when(new.user_id='${owner.userId}') execute function private.cash_test_fail()`,
    );
    try {
      await expect(selectCurrency(owner, 'AED')).rejects.toThrow('CASH_PROVISION_INJECTED_FAILURE');
      expect(await identity.getPreferences(owner)).toMatchObject({
        defaultCurrency: 'SAR',
        version: 1,
        currencySelectionRequired: true,
      });
      expect(await accounts(owner.userId)).toEqual([]);
    } finally {
      await pool.query('drop trigger cash_test_failure on public.accounts');
      await pool.query('drop function private.cash_test_fail()');
    }
    await selectCurrency(owner, 'AED');
    expect(await accounts(owner.userId)).toMatchObject([{ currency_code: 'AED' }]);
  });

  it('denies direct authenticated-role invocation and cross-owner account insertion through RLS', async () => {
    const owner = await customer();
    const other = await customer();
    await expect(
      identity.withCustomerTransaction(owner, (client) =>
        client.query(
          "insert into public.accounts(user_id,name,type,currency_code) values($1,'Foreign','cash','SAR')",
          [other.userId],
        ),
      ),
    ).rejects.toThrow('row-level security');
    await expect(
      identity.withCustomerTransaction(owner, async (client) => {
        await client.query('set local role authenticated');
        await client.query('select private.ensure_default_cash_account($1)', [owner.userId]);
      }),
    ).rejects.toThrow('permission denied');
    expect(await accounts(other.userId)).toEqual([]);
  });
});
