import { randomUUID } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('salary planning live invariants', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const owner = `salary_live_${randomUUID()}`;
  const other = `salary_other_${randomUUID()}`;
  const accountId = randomUUID();
  const transactionId = randomUUID();
  const profileId = randomUUID();
  const operationId = randomUUID();
  const occurredAt = new Date().toISOString();
  const horizon = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 2, 0))
    .toISOString()
    .slice(0, 10);

  async function api<T extends QueryResultRow>(userId: string, sql: string, values: unknown[]) {
    return pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ role: 'authenticated', sub: userId, sid: 'session' }),
        ]);
        await client.query('set local role masarifi_api');
        const result = await client.query<T>(sql, values);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });
  }

  type InvalidPredecessor =
    | 'foreign-owner'
    | 'other-profile'
    | 'ineligible-status'
    | 'correction-cycle'
    | 'already-replaced';

  async function seedInvalidCorrectionPredecessor(kind: InvalidPredecessor) {
    const targetProfileId = randomUUID();
    const predecessorProfileId =
      kind === 'foreign-owner' || kind === 'other-profile' ? randomUUID() : targetProfileId;
    const predecessorOwner = kind === 'foreign-owner' ? other : owner;
    const targetReceiptId = randomUUID();
    const predecessorReceiptId = randomUUID();
    const targetTransactionId = randomUUID();
    const predecessorTransactionId = randomUUID();
    const existingReplacementId = randomUUID();
    const existingReplacementTransactionId = randomUUID();
    const timestamp = Date.now() - 2 * 86_400_000;
    const targetExpectedAt = new Date(timestamp).toISOString();
    const predecessorExpectedAt = new Date(timestamp - 86_400_000).toISOString();
    const replacementExpectedAt = new Date(timestamp + 86_400_000).toISOString();

    await pool.withClient(async (client) => {
      await client.query('begin');
      try {
        await client.query('set local role masarifi_migration');
        await client.query(
          `insert into public.salary_profiles(
             id,user_id,name,amount_minor,currency_code,frequency,expected_day
           ) values($1,$2,'Correction target',125000,'SAR','monthly',1)`,
          [targetProfileId, owner],
        );
        if (predecessorProfileId !== targetProfileId)
          await client.query(
            `insert into public.salary_profiles(
               id,user_id,name,amount_minor,currency_code,frequency,expected_day
             ) values($1,$2,'Unrelated predecessor',125000,'SAR','monthly',1)`,
            [predecessorProfileId, predecessorOwner],
          );
        await client.query(
          `insert into public.transactions(
             id,user_id,kind,status,amount_minor,currency_code,title,occurred_at
           ) values
             ($1,$2,'income','confirmed',125000,'SAR','Correction target',$3),
             ($4,$5,'income','confirmed',125000,'SAR','Correction predecessor',$6)`,
          [
            targetTransactionId,
            owner,
            targetExpectedAt,
            predecessorTransactionId,
            predecessorOwner,
            predecessorExpectedAt,
          ],
        );
        await client.query(
          `insert into public.salary_receipts(
             id,user_id,salary_profile_id,expected_at,amount_minor,status
           ) values($1,$2,$3,$4,125000,'expected')`,
          [targetReceiptId, owner, targetProfileId, targetExpectedAt],
        );
        if (kind === 'ineligible-status') {
          await client.query(
            `insert into public.salary_receipts(
               id,user_id,salary_profile_id,expected_at,amount_minor,status
             ) values($1,$2,$3,$4,125000,'expected')`,
            [predecessorReceiptId, predecessorOwner, predecessorProfileId, predecessorExpectedAt],
          );
        } else {
          await client.query(
            `insert into public.salary_receipts(
               id,user_id,salary_profile_id,transaction_id,expected_at,received_at,
               amount_minor,status,replaces_receipt_id
             ) values($1,$2,$3,$4,$5,$5,125000,$6,$7)`,
            [
              predecessorReceiptId,
              predecessorOwner,
              predecessorProfileId,
              predecessorTransactionId,
              predecessorExpectedAt,
              kind === 'correction-cycle' ? 'corrected' : 'received',
              kind === 'correction-cycle' ? targetReceiptId : null,
            ],
          );
        }
        if (kind === 'already-replaced') {
          await client.query(
            `insert into public.transactions(
               id,user_id,kind,status,amount_minor,currency_code,title,occurred_at
             ) values($1,$2,'income','confirmed',125000,'SAR','Existing replacement',$3)`,
            [existingReplacementTransactionId, owner, replacementExpectedAt],
          );
          await client.query(
            `insert into public.salary_receipts(
               id,user_id,salary_profile_id,transaction_id,expected_at,received_at,
               amount_minor,status,replaces_receipt_id
             ) values($1,$2,$3,$4,$5,$5,125000,'corrected',$6)`,
            [
              existingReplacementId,
              owner,
              targetProfileId,
              existingReplacementTransactionId,
              replacementExpectedAt,
              predecessorReceiptId,
            ],
          );
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    });

    return {
      command: {
        operation: 'link',
        profileId: targetProfileId,
        transactionId: targetTransactionId,
        expectedAt: targetExpectedAt,
        replacesReceiptId: predecessorReceiptId,
        operationId: randomUUID(),
        requestId: `salary-invalid-predecessor-${kind}`,
      },
      targetReceiptId,
    };
  }

  beforeAll(async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_migration');
      await client.query(
        "insert into public.profiles(id,status) values($1,'active'),($2,'active')",
        [owner, other],
      );
      await client.query(
        "insert into public.accounts(id,user_id,name,type,currency_code) values($1,$2,'Bank','bank','SAR')",
        [accountId, owner],
      );
      await client.query(
        `insert into public.transactions(id,user_id,kind,status,amount_minor,currency_code,title,occurred_at)
         values($1,$2,'income','confirmed',125000,'SAR','Salary',$3)`,
        [transactionId, owner, occurredAt],
      );
      await client.query('commit');
    });
  });
  afterAll(() => pool.onModuleDestroy());

  it('creates one exact owner profile and hides it from another owner', async () => {
    const command = {
      operation: 'create',
      profileId,
      operationId,
      requestId: 'salary-live-create',
      name: 'Main salary',
      amountMinor: '125000',
      currencyCode: 'SAR',
      frequency: 'monthly',
      expectedDay: 1,
      customIntervalDays: null,
      accountId,
      automaticDetectionEnabled: true,
    };
    const created = await api<{ result: Record<string, unknown> }>(
      owner,
      'select private.save_salary_profile($1,$2::jsonb) result',
      [owner, JSON.stringify(command)],
    );
    expect(created.rows[0]?.result).toMatchObject({
      id: profileId,
      amountMinor: '125000',
      version: 1,
    });
    const hidden = await api<{ count: string }>(
      other,
      'select count(*)::text count from public.salary_profiles where id=$1',
      [profileId],
    );
    expect(hidden.rows[0]?.count).toBe('0');
  });

  it('generates once, links only the eligible income, and removes it audibly on unlink', async () => {
    await pool.withClient(async (client) => {
      await client.query('begin');
      await client.query('set local role masarifi_worker');
      await client.query('select * from private.generate_salary_receipts($1,$2,$3)', [
        owner,
        profileId,
        horizon,
      ]);
      await client.query('commit');
    });
    const expected = await pool.query<{ id: string; expected_at: Date }>(
      'select id,expected_at from public.salary_receipts where salary_profile_id=$1 order by expected_at limit 1',
      [profileId],
    );
    const receiptId = expected.rows[0]?.id as string;
    const expectedAt = expected.rows[0]?.expected_at.toISOString() as string;
    const link = {
      operation: 'link',
      profileId,
      transactionId,
      expectedAt,
      replacesReceiptId: null,
      operationId: randomUUID(),
      requestId: 'salary-live-link',
    };
    const linked = await api<{ result: Record<string, unknown> }>(
      owner,
      'select private.link_salary_receipt($1,$2::jsonb) result',
      [owner, JSON.stringify(link)],
    );
    expect(linked.rows[0]?.result).toMatchObject({
      id: receiptId,
      status: 'received',
      amountMinor: '125000',
    });
    await expect(
      api(other, 'select private.link_salary_receipt($1,$2::jsonb)', [other, JSON.stringify(link)]),
    ).rejects.toThrow(/SALARY_RECEIPT_NOT_FOUND|SALARY_PROFILE_NOT_FOUND/);

    const unlink = {
      operation: 'unlink',
      profileId,
      receiptId,
      expectedVersion: 2,
      operationId: randomUUID(),
      requestId: 'salary-live-unlink',
    };
    const unlinked = await api<{ result: Record<string, unknown> }>(
      owner,
      'select private.link_salary_receipt($1,$2::jsonb) result',
      [owner, JSON.stringify(unlink)],
    );
    expect(unlinked.rows[0]?.result).toMatchObject({ id: receiptId, status: 'undone' });
  });

  it.each([
    ['a cross-owner correction', 'foreign-owner', /SALARY_RECEIPT_NOT_FOUND/],
    ['a different-profile correction', 'other-profile', /SALARY_RECEIPT_NOT_FOUND/],
    ['an ineligible-status correction', 'ineligible-status', /SALARY_RECEIPT_INELIGIBLE/],
    ['a correction-cycle', 'correction-cycle', /SALARY_RECEIPT_INELIGIBLE/],
    ['an already-replaced correction', 'already-replaced', /SALARY_RECEIPT_INELIGIBLE/],
  ] as const)(
    'rejects %s predecessor without mutating the target receipt',
    async (_case, kind, expectedError) => {
      const fixture = await seedInvalidCorrectionPredecessor(kind);

      await expect(
        api(owner, 'select private.link_salary_receipt($1,$2::jsonb)', [
          owner,
          JSON.stringify(fixture.command),
        ]),
      ).rejects.toThrow(expectedError);
      const persisted = await pool.query<{ status: string; replaces_receipt_id: string | null }>(
        'select status,replaces_receipt_id from public.salary_receipts where id=$1',
        [fixture.targetReceiptId],
      );
      expect(persisted.rows[0]).toEqual({ status: 'expected', replaces_receipt_id: null });
    },
  );

  it('makes concurrent repeated generation and linking converge without duplicates', async () => {
    const generations = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        pool.query('select * from private.generate_salary_receipts($1,$2,$3)', [
          owner,
          profileId,
          horizon,
        ]),
      ),
    );
    expect(generations.every(({ status }) => status === 'fulfilled')).toBe(true);
    const count = await pool.query<{ count: string; distinct_count: string }>(
      'select count(*)::text count,count(distinct expected_at)::text distinct_count from public.salary_receipts where salary_profile_id=$1',
      [profileId],
    );
    expect(count.rows[0]?.count).toBe(count.rows[0]?.distinct_count);
  });

  it('stores and replays one exact create result for one idempotency key', async () => {
    const input = {
      operation: 'createSalaryProfile',
      scope: 'planning.salary-profile.create',
      status: 201,
      principal: { userId: owner, sessionId: 'session', factorAgeSeconds: 0 },
      command: {
        name: 'Secondary salary',
        amountMinor: '50000',
        currencyCode: 'SAR',
        frequency: 'monthly',
        expectedDay: 15,
        customIntervalDays: null,
        accountId,
        automaticDetectionEnabled: false,
      },
      idempotencyKey: 'salary-live-replay-key-0001',
      requestId: 'salary-live-replay',
    };
    const first = await repository.mutate(input);
    const replay = await repository.mutate(input);
    expect(replay).toEqual(first);
    const resource = first.resource as { id: string };
    const evidence = await pool.query<{ profiles: string; events: string; keys: string }>(
      `select
       (select count(*)::text from public.salary_profiles where id=$1) profiles,
       (select count(*)::text from private.outbox_events where aggregate_id=$1) events,
       (select count(*)::text from private.idempotency_keys where actor_id=$2 and scope=$3 and state='completed') keys`,
      [resource.id, owner, input.scope],
    );
    expect(evidence.rows[0]).toEqual({ profiles: '1', events: '1', keys: '1' });
    await expect(
      repository.mutate({ ...input, command: { ...input.command, amountMinor: '50001' } }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });
});
