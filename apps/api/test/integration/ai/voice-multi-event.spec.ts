import { randomUUID } from 'node:crypto';
import { AiRepository } from '../../../src/ai/ai.repository';
import {
  decideVoiceBatch,
  parseVoiceBatchProviderOutput,
  type BatchContext,
} from '../../../src/ai/voice-batch';
import { ReportsRepository } from '../../../src/reports/reports.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing multi-event fixture row');
  return value;
}
interface EventEffect {
  ordinal: number;
  status: string;
  reason_code: string | null;
  transaction_id: string | null;
  kind: string | null;
  amount_minor: string | null;
  currency_code: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  category_id: string | null;
  external_ref: string | null;
}

describeLiveDatabase('Voice extracted multi-event authoritative posting', () => {
  const pool = createLivePool();
  afterAll(() => pool.onModuleDestroy());
  const event = (patch = {}) => ({
    s: 1,
    k: 'e',
    a: '1000',
    c: 'e:SAR',
    b: 'o:',
    g: 'CATEGORY-1',
    d: 'o:',
    m: '',
    i: true,
    q: 1,
    ...patch,
  });

  async function fixture(
    events: unknown[],
    language = 'ar',
    foreignBank = false,
    beforeAccept?: (session: string, token: string) => Promise<void>,
  ) {
    const user = 'multi_voice_' + randomUUID();
    const account = randomUUID(),
      bank = randomUUID(),
      dollars = randomUUID();
    const coffee = randomUUID(),
      food = randomUUID(),
      salary = randomUUID();
    const session = randomUUID(),
      token = randomUUID();
    const recordedAt = new Date(Date.now() - 1000).toISOString();
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [user]);
    const bankOwner = foreignBank ? 'voice_stranger_' + randomUUID() : user;
    if (foreignBank)
      await pool.query("insert into public.profiles(id,status) values($1,'active')", [bankOwner]);
    for (const [id, name, type, currency, selected] of [
      [account, 'النقدية / Cash', 'cash', 'SAR', true],
      [bank, 'الراجحي / Al Rajhi', 'bank', 'SAR', false],
      [dollars, 'Dollar Wallet', 'wallet', 'USD', false],
    ])
      await pool.query(
        'insert into public.accounts(id,user_id,name,type,currency_code,is_default) values($1,$2,$3,$4,$5,$6)',
        [id, id === bank ? bankOwner : user, name, type, currency, selected],
      );
    for (const [id, kind, label] of [
      [coffee, 'expense', 'Coffee'],
      [food, 'expense', 'Food'],
      [salary, 'income', 'Salary'],
    ])
      await pool.query(
        'insert into public.categories(id,user_id,kind,label_ar,label_en) values($1,$2,$3,$4,$4)',
        [id, user, kind, label],
      );
    await pool.query('update private.voice_automatic_policy set enabled=true');
    await pool.query(
      "insert into public.voice_sessions(id,user_id,locale,status,duration_ms,content_type,size_bytes,storage_ref,expires_at,operation_id,contract_version,claimed_by,claim_token,lease_until,capture_at,capture_timezone_offset) values($1,$2,$3,'processing',3000,'audio/m4a',100,'voice/'||$1::uuid::text||'/'||$4::uuid::text,clock_timestamp()+interval '23 hours',$4,3,'multi-test',$5,clock_timestamp()+interval '2 minutes',$6,-180)",
      [session, user, language, randomUUID(), token, recordedAt],
    );
    await pool.query(
      'insert into private.voice_batch_context(session_id,user_id,default_account_id,thresholds) values($1,$2,$3,$4::jsonb)',
      [session, user, account, '{}'],
    );
    const context: BatchContext = {
      recordedAt,
      timezoneOffsetMinutes: -180,
      defaultAccountId: account,
      references: [
        { alias: 'ACCOUNT-1', id: account, kind: 'account', data: { currency: 'SAR' } },
        { alias: 'ACCOUNT-2', id: bank, kind: 'account', data: { currency: 'SAR' } },
        { alias: 'ACCOUNT-3', id: dollars, kind: 'account', data: { currency: 'USD' } },
        { alias: 'CATEGORY-1', id: coffee, kind: 'category', data: { kind: 'expense' } },
        { alias: 'CATEGORY-2', id: food, kind: 'category', data: { kind: 'expense' } },
        { alias: 'CATEGORY-3', id: salary, kind: 'category', data: { kind: 'income' } },
      ],
    };
    await beforeAccept?.(session, token);
    const decisions = decideVoiceBatch(
      parseVoiceBatchProviderOutput({ complete: true, language, events }),
      context,
    );
    const accepted = await pool.query<{ result: { batchId: string } }>(
      'select private.accept_voice_batch($1,$2,$3::jsonb,$4) result',
      [session, token, JSON.stringify(decisions), 'automatic-or-skip-v3.1'],
    );
    const batch = required(accepted.rows[0]).result.batchId;
    const rows = (
      await pool.query<{ id: string; ordinal: number; status: string }>(
        'select id,ordinal,status from private.voice_events where batch_id=$1 order by ordinal',
        [batch],
      )
    ).rows;
    return {
      user,
      account,
      bank,
      dollars,
      session,
      token,
      batch,
      rows,
      decisions,
      context,
      coffee,
      food,
      salary,
    };
  }
  async function result(f: Awaited<ReturnType<typeof fixture>>) {
    const effects = (
      await pool.query<EventEffect>(
        "select e.ordinal,e.status,e.reason_code,e.transaction_id,t.kind,t.amount_minor,t.currency_code,(select p.account_id from public.transaction_postings p where p.transaction_id=t.id and p.posting_role='source') source_account_id,(select p.account_id from public.transaction_postings p where p.transaction_id=t.id and p.posting_role='destination') destination_account_id,t.category_id,t.external_ref from private.voice_events e left join public.transactions t on t.id=e.transaction_id where e.batch_id=$1 order by e.ordinal",
        [f.batch],
      )
    ).rows;
    const balances = (
      await pool.query<{ account_id: string; confirmed_minor: string }>(
        'select account_id,confirmed_minor from public.account_balances where account_id=any($1)',
        [[f.account, f.bank, f.dollars]],
      )
    ).rows;
    const mismatches = (
      await pool.query(
        "select count(*)::int mismatch from public.account_balances b join public.accounts a on a.id=b.account_id where a.user_id=$1 and (b.confirmed_minor<>coalesce((select sum(p.amount_minor) from public.transaction_postings p where p.account_id=b.account_id and p.clearing_state='confirmed'),0) or b.pending_minor<>coalesce((select sum(p.amount_minor) from public.transaction_postings p where p.account_id=b.account_id and p.clearing_state='pending'),0))",
        [f.user],
      )
    ).rows[0];
    expect(mismatches).toEqual({ mismatch: 0 });
    return { effects, balances };
  }
  async function finish() {
    await new AiRepository(pool).finalizeVoiceBatches(25);
  }
  it('marks disabled-currency work references unavailable without shrinking the account window', async () => {
    await pool.query("update public.currencies set enabled=false where code='USD'");
    try {
      await fixture([], 'en', false, async (session, token) => {
        const input = required(
          (
            await pool.query<{
              result: {
                aliases: BatchContext['references'];
                defaultAccountId: string;
                recordedAt: string;
                timezoneOffsetMinutes: number;
              };
            }>('select private.get_ai_work_input($1,$2,$3) result', [
              'voice.transcribe_extract',
              session,
              token,
            ])
          ).rows[0],
        ).result;
        const accounts = input.aliases.filter((ref) => ref.kind === 'account');
        expect(accounts).toHaveLength(3);
        const disabled = required(accounts.find((ref) => ref.data.currency === 'USD'));
        expect(disabled.data.available).toBe(false);
        expect(
          accounts
            .filter((ref) => ref.data.currency === 'SAR')
            .every((ref) => ref.data.available === true),
        ).toBe(true);
        const decisions = decideVoiceBatch(
          parseVoiceBatchProviderOutput({
            complete: true,
            language: 'en',
            events: [event({ b: `e:${disabled.alias}`, c: 'e:USD' })],
          }),
          {
            recordedAt: input.recordedAt,
            timezoneOffsetMinutes: input.timezoneOffsetMinutes,
            defaultAccountId: input.defaultAccountId,
            references: input.aliases,
          },
        );
        expect(decisions).toEqual([{ status: 'skipped', reason: 'currency_mismatch' }]);
      });
    } finally {
      await pool.query("update public.currencies set enabled=true where code='USD'");
    }
  });
  it('keeps both work-input capabilities private while granting only the guarded wrapper to the worker', async () => {
    expect(
      required(
        (
          await pool.query(
            "select has_function_privilege('masarifi_worker','private.get_ai_work_input(text,uuid,uuid)','EXECUTE') worker,has_function_privilege('masarifi_api','private.get_ai_work_input(text,uuid,uuid)','EXECUTE') api,has_function_privilege('anon','private.get_ai_work_input(text,uuid,uuid)','EXECUTE') anon,has_function_privilege('authenticated','private.get_ai_work_input(text,uuid,uuid)','EXECUTE') authenticated,has_function_privilege('masarifi_worker','private.get_ai_work_input_before_account_availability(text,uuid,uuid)','EXECUTE') bypass",
          )
        ).rows[0],
      ),
    ).toEqual({ worker: true, api: false, anon: false, authenticated: false, bypass: false });
  });

  it.each(['ar', 'en'])(
    'posts two %s expenses to separate named accounts with separate provenance and ledger effects',
    async (language) => {
      const f = await fixture(
        [
          event({ a: '5000', b: 'e:ACCOUNT-1', g: 'CATEGORY-2' }),
          event({ s: 2, a: '2000', b: 'e:ACCOUNT-2' }),
        ],
        language,
      );
      await finish();
      const { effects, balances } = await result(f);
      expect(effects).toMatchObject([
        {
          ordinal: 0,
          status: 'committed',
          kind: 'expense',
          amount_minor: '5000',
          source_account_id: f.account,
          category_id: f.food,
        },
        {
          ordinal: 1,
          status: 'committed',
          kind: 'expense',
          amount_minor: '2000',
          source_account_id: f.bank,
          category_id: f.coffee,
        },
      ]);
      expect(balances).toEqual(
        expect.arrayContaining([
          { account_id: f.account, confirmed_minor: '-5000' },
          { account_id: f.bank, confirmed_minor: '-2000' },
        ]),
      );
      expect(new Set(effects.map((row) => row.transaction_id)).size).toBe(2);
      expect(effects.map((row) => row.external_ref)).toEqual(
        f.rows.map((row) => 'voice-event:' + row.id),
      );
      await pool.query('select private.accept_voice_batch($1,$2,$3::jsonb,$4)', [
        f.session,
        f.token,
        JSON.stringify(f.decisions),
        'automatic-or-skip-v3.1',
      ]);
      await finish();
      expect(await result(f)).toEqual({ effects, balances });
    },
  );
  it('posts three mixed events and exposes only committed effects in the real Reports summary', async () => {
    const f = await fixture([
      event(),
      event({ s: 2, a: '2500', g: 'CATEGORY-2' }),
      event({ s: 3, k: 'i', a: '-10000', b: 'e:ACCOUNT-2', g: 'CATEGORY-3' }),
    ]);
    await finish();
    const { effects, balances } = await result(f);
    expect(effects.map((row) => [row.kind, row.amount_minor])).toEqual([
      ['expense', '1000'],
      ['expense', '2500'],
      ['income', '10000'],
    ]);
    expect(balances).toEqual(
      expect.arrayContaining([
        { account_id: f.account, confirmed_minor: '-3500' },
        { account_id: f.bank, confirmed_minor: '10000' },
      ]),
    );
    const report = await new ReportsRepository(pool).getSummary(
      { userId: f.user, sessionId: 'local-fixture', factorAgeSeconds: 0 },
      'financial_summary',
      {
        kind: 'monthly',
        timezone: 'Asia/Riyadh',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        startInstant: new Date('2026-09-30T21:00:00Z'),
        endExclusiveInstant: new Date('2026-10-31T21:00:00Z'),
      },
      'SAR',
      'multi-test',
    );
    expect(report.summaries).toEqual([
      {
        income: { amountMinor: 10000, currency: 'SAR' },
        expense: { amountMinor: 3500, currency: 'SAR' },
        netCashFlow: { amountMinor: 6500, currency: 'SAR' },
        savingsRateBasisPoints: 6500,
        transactionCount: 3,
      },
    ]);
  });
  it('keeps valid siblings and sole currency-compatible fallback while invalid/ambiguous/transfer events remain financially empty', async () => {
    const f = await fixture([
      event(),
      event({ s: 2, a: '' }),
      event({ s: 3, b: 'e:ACCOUNT-1', c: 'e:USD' }),
      event({ s: 4, b: 'a:' }),
      event({ s: 5, k: 't', a: '20000' }),
      event({ s: 6, c: 'e:USD', a: '1200' }),
    ]);
    await finish();
    const { effects, balances } = await result(f);
    expect(effects.map((row) => [row.status, row.reason_code])).toEqual([
      ['committed', null],
      ['skipped', 'missing_amount'],
      ['skipped', 'currency_mismatch'],
      ['skipped', 'ambiguous_account'],
      ['skipped', 'unsupported_event'],
      ['committed', null],
    ]);
    expect(
      effects.filter((row) => row.status === 'skipped').every((row) => row.transaction_id === null),
    ).toBe(true);
    expect(balances).toEqual(
      expect.arrayContaining([
        { account_id: f.account, confirmed_minor: '-1000' },
        { account_id: f.dollars, confirmed_minor: '-1200' },
      ]),
    );
    expect(
      (
        await pool.query('select count(*)::int count from public.transactions where user_id=$1', [
          f.user,
        ])
      ).rows[0],
    ).toEqual({ count: 2 });
  });
  it('resumes after a committed occurrence and expired worker lease without duplicating repeated amounts', async () => {
    const f = await fixture([event(), event({ s: 2 })]);
    const claim = required(
      (
        await pool.query<{ batch_id: string; token: string }>(
          'select * from private.claim_voice_finalization(25)',
        )
      ).rows.find((row) => row.batch_id === f.batch),
    );
    await pool.query('select private.execute_voice_event($1,$2,$3)', [
      f.batch,
      claim.token,
      required(f.rows[0]).id,
    ]);
    await pool.query(
      "update private.voice_batches set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [f.batch],
    );
    await finish();
    const before = await result(f);
    expect(before.effects.map((row) => row.status)).toEqual(['committed', 'committed']);
    expect(before.balances).toContainEqual({ account_id: f.account, confirmed_minor: '-2000' });
    await Promise.all(
      f.rows.map((row) =>
        pool.query('select private.execute_voice_event($1,$2,$3)', [f.batch, claim.token, row.id]),
      ),
    );
    expect(await result(f)).toEqual(before);
  });
  it('rejects a forged foreign-account alias at execution without substituting the default or blocking a safe sibling', async () => {
    const f = await fixture([event({ b: 'e:ACCOUNT-2' }), event({ s: 2 })], 'ar', true);
    await finish();
    const { effects, balances } = await result(f);
    expect(effects.map((row) => [row.status, row.reason_code])).toEqual([
      ['skipped', 'ambiguous_account'],
      ['committed', null],
    ]);
    expect(effects[0]?.transaction_id).toBeNull();
    expect(balances).toContainEqual({ account_id: f.account, confirmed_minor: '-1000' });
    expect(balances.find((row) => row.account_id === f.bank)?.confirmed_minor ?? '0').toBe('0');
  });
});
