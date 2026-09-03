import { createHash, randomUUID } from 'node:crypto';

import { HttpException } from '@nestjs/common';

import { decodeTrackingCursor, encodeTrackingCursor } from '../../../src/tracking/tracking.dto';
import { executeParserDefinition } from '../../../src/tracking/tracking.parser';
import { TrackingRepository } from '../../../src/tracking/tracking.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

async function rejectedCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'code' in response) {
      const code = Reflect.get(response, 'code');
      if (typeof code === 'string') return code;
    }
    throw error;
  }
  throw new Error('REJECTION_EXPECTED');
}

describeLiveDatabase('tracking owner, import, lease, and retention lifecycle', () => {
  const pool = createLivePool();
  const repository = new TrackingRepository(pool);
  const owner = `tracking_${randomUUID()}`;
  const other = `tracking_other_${randomUUID()}`;
  const admin = `tracking_admin_${randomUUID()}`;
  const reader = `tracking_reader_${randomUUID()}`;
  const principal = { userId: owner, sessionId: 'tracking-session', factorAgeSeconds: 0 };
  const adminPrincipal = { userId: admin, sessionId: 'tracking-admin', factorAgeSeconds: 0 };
  const readerPrincipal = { userId: reader, sessionId: 'tracking-reader', factorAgeSeconds: 0 };

  beforeAll(async () => {
    await pool.query(
      "insert into public.profiles(id,status) values($1,'active'),($2,'active'),($3,'active'),($4,'active')",
      [owner, other, admin, reader],
    );
    await pool.query(
      "insert into public.admin_profiles(user_id,status) values($1,'active'),($2,'active')",
      [admin, reader],
    );
    await pool.query(
      `insert into public.admin_role_assignments(user_id,role_id,assigned_by,reason)
       select $1,id,$1,'Tracking integration role' from public.roles where key='import-operator'
       union all select $2,id,$1,'Tracking integration reader role' from public.roles where key='support-agent'`,
      [admin, reader],
    );
  });

  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query("select set_config('app.tracking_retention','on',false)");
      await client.query('delete from public.admin_role_assignments where user_id in ($1,$2)', [
        admin,
        reader,
      ]);
      await client.query('delete from public.admin_profiles where user_id in ($1,$2)', [
        admin,
        reader,
      ]);
      await client.query('delete from public.profiles where id in ($1,$2,$3,$4)', [
        owner,
        other,
        admin,
        reader,
      ]);
    });
    await pool.onModuleDestroy();
  });

  it('isolates owner preferences and rules while preserving optimistic versions', async () => {
    expect(await repository.getPreferences(principal)).toMatchObject({
      enabled: false,
      reviewRequired: true,
      version: 1,
    });
    const preferenceCommand = {
      enabled: true,
      reviewRequired: true,
      sourceRetentionDays: 7,
      historyRetentionDays: 90,
      expectedVersion: 1,
    };
    const preference = await repository.updatePreferences(
      principal,
      preferenceCommand,
      'tracking-preferences-key',
      randomUUID(),
    );
    await expect(
      repository.updatePreferences(
        principal,
        preferenceCommand,
        'tracking-preferences-key',
        randomUUID(),
      ),
    ).resolves.toEqual({ ...preference, replayed: true });
    const createdRule = await repository.keyword(
      principal,
      {
        id: null,
        keyword: 'Demo purchase',
        groupKey: 'expense',
        languageCode: 'en',
        matchType: 'contains',
        categoryId: null,
        priority: 10,
        enabled: true,
        expectedVersion: null,
      },
      'tracking-keyword-key-1',
      randomUUID(),
    );
    const rule = createdRule.resource as Record<string, unknown>;
    expect(rule).toMatchObject({ keyword: 'Demo purchase', version: 1 });
    await expect(
      rejectedCode(
        repository.updatePreferences(
          principal,
          {
            enabled: false,
            reviewRequired: true,
            sourceRetentionDays: 7,
            historyRetentionDays: 90,
            expectedVersion: 1,
          },
          'tracking-preferences-key-2',
          randomUUID(),
        ),
      ),
    ).resolves.toMatch(/CONFLICT/);
    await repository.keyword(
      principal,
      {
        id: null,
        keyword: 'Another demo purchase',
        groupKey: 'expense',
        languageCode: 'en',
        matchType: 'contains',
        categoryId: null,
        priority: 11,
        enabled: true,
        expectedVersion: null,
      },
      'tracking-keyword-key-2',
      randomUUID(),
    );
    const firstPage = await repository.listOwner(principal, 'keywords', null, 1);
    const firstRule = firstPage[0] as { id: string; createdAt: string };
    const cursor = decodeTrackingCursor(
      encodeTrackingCursor({ at: firstRule.createdAt, id: firstRule.id }),
    );
    const secondPage = await repository.listOwner(principal, 'keywords', null, 1, cursor);
    expect(secondPage).toHaveLength(1);
    expect((secondPage[0] as { id: string }).id).not.toBe(firstRule.id);
    await expect(
      repository.listOwner({ ...principal, userId: other }, 'keywords', String(rule.id), 1),
    ).resolves.toEqual([]);
  });

  it('replays intake, fences claims, creates review, and purges raw references idempotently', async () => {
    const input = {
      schemaVersion: 1 as const,
      sourceType: 'sms' as const,
      sourceChannel: 'android_sms' as const,
      events: [
        {
          sourceItemKey: 'message-1',
          sender: 'EXAMPLE-CRESCENT',
          body: 'paid 120 SAR',
          receivedAt: new Date().toISOString(),
        },
      ],
    };
    const hash = createHash('sha256').update('paid 120 SAR').digest('hex');
    const rawId = randomUUID();
    const storageRef = `tracking/${randomUUID()}/${rawId}`;
    const created = await repository.createImport(principal, input, {
      sourceName: null,
      key: 'tracking-integration-key',
      requestId: randomUUID(),
      raw: {
        storageRef,
        payloadHash: hash,
        contentType: 'application/json',
        sizeBytes: 8,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const replay = await repository.createImport(principal, input, {
      sourceName: null,
      key: 'tracking-integration-key',
      requestId: randomUUID(),
    });
    expect(replay.resource).toEqual(created.resource);
    const sessionId = String((created.resource as Record<string, unknown>).id);
    await expect(
      repository.listOwner(principal, 'sessions', null, 10, null, {
        status: 'received',
        sourceType: 'sms',
      }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sessionId, sourceType: 'sms' })]),
    );
    await expect(
      repository.listOwner(principal, 'sessions', null, 10, null, { sourceType: 'manual' }),
    ).resolves.toEqual([]);
    const claim = (await repository.claimImports('tracking-integration-worker'))[0];
    expect(claim?.id).toBe(sessionId);
    if (!claim) throw new Error('IMPORT_CLAIM_EXPECTED');
    const prepared = await repository.prepareImport(claim.id, claim.claim_token);
    expect(prepared).toMatchObject({ sessionId });
    const parserItems = prepared.parserItems as Array<{
      id: string;
      definition: unknown;
      input: Record<string, string>;
      parserVersionId: string;
    }>;
    expect(parserItems).toHaveLength(1);
    const parserItem = parserItems[0];
    if (!parserItem) throw new Error('PARSER_ITEM_EXPECTED');
    const parserResult = executeParserDefinition(parserItem.definition, parserItem.input);
    expect(parserResult).toEqual({ amountMinor: 12000, currency: 'SAR' });
    await repository.applyParserResult(parserItem.id, claim.claim_token, parserResult);
    await repository.finalizeImport(claim.id, claim.claim_token);
    await repository.completeImport(claim.id, claim.claim_token, 'succeeded', null);
    await expect(
      rejectedCode(repository.completeImport(claim.id, claim.claim_token, 'succeeded', null)),
    ).resolves.toMatch(/STALE/);
    const reviews = await repository.listOwner(principal, 'reviews', null, 10);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      proposedValues: { amountMinor: 12000, currency: 'SAR' },
      originalValues: { amountMinor: 12000, currency: 'SAR' },
    });
    expect(JSON.stringify(reviews[0])).not.toContain('paid 120 SAR');
    await pool.query(
      "update private.raw_ingestion_payloads set created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' where session_id=$1",
      [sessionId],
    );
    const due = await repository.rawDue();
    expect(due).toEqual(
      expect.arrayContaining([expect.objectContaining({ storage_ref: storageRef })]),
    );
    const rawClaim = due.find((item) => item.storage_ref.endsWith(rawId));
    await repository.completeRaw(String(rawClaim?.id), String(rawClaim?.purge_token));
    await expect(
      repository.completeRaw(String(rawClaim?.id), String(rawClaim?.purge_token)),
    ).resolves.toBe(false);
    const retained = await pool.query<{ storage_ref: string | null; scan_status: string }>(
      'select storage_ref,scan_status from private.raw_ingestion_payloads where session_id=$1',
      [sessionId],
    );
    expect(retained.rows[0]).toEqual({ storage_ref: null, scan_status: 'purged' });
    const purgedItem = await pool.query<{ normalized_payload: Record<string, unknown> }>(
      'select normalized_payload from public.import_items where session_id=$1',
      [sessionId],
    );
    expect(purgedItem.rows[0]?.normalized_payload).not.toHaveProperty('body');
    expect(purgedItem.rows[0]?.normalized_payload).not.toHaveProperty('sender');
  });

  it('redacts Admin reads, fences operational actions, and keeps owner ledger decisions owner-only', async () => {
    const created = await repository.createImport(
      principal,
      {
        schemaVersion: 1,
        sourceType: 'manual',
        events: [
          {
            sourceItemKey: 'admin-review-fixture',
            body: 'private source content',
            receivedAt: new Date().toISOString(),
          },
        ],
      },
      { sourceName: null, key: 'tracking-admin-fixture', requestId: randomUUID() },
    );
    const sessionId = String((created.resource as Record<string, unknown>).id);
    const item = await pool.query<{ id: string }>(
      'select id::text from public.import_items where session_id=$1',
      [sessionId],
    );
    const itemId = String(item.rows[0]?.id);
    await pool.query(
      'select private.create_review_item($1::uuid,\'low_confidence\',\'{"merchant":"Fictional"}\'::jsonb)',
      [itemId],
    );
    await pool.query(
      "update public.import_sessions set status='failed',completed_at=clock_timestamp() where id=$1",
      [sessionId],
    );
    const session = await pool.query<{ version: string }>(
      'select version::text from public.import_sessions where id=$1',
      [sessionId],
    );

    const list = (await repository.adminRead(adminPrincipal, 'sessions', null, 10, null, null, {
      status: 'failed',
    })) as unknown[];
    expect(list).toEqual(expect.arrayContaining([expect.objectContaining({ id: sessionId })]));
    expect(JSON.stringify(list)).not.toContain(owner);
    await expect(
      rejectedCode(repository.adminRead(adminPrincipal, 'sessions', sessionId, 1, null, null, {})),
    ).resolves.toBe('ADMIN_PURPOSE_REQUIRED');
    await expect(
      repository.adminRead(
        adminPrincipal,
        'sessions',
        sessionId,
        1,
        'Investigating the selected import failure',
        null,
        {},
      ),
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: sessionId })]));
    await expect(
      repository.adminRead(readerPrincipal, 'sessions', null, 10, null, null, {}),
    ).resolves.toEqual(expect.any(Array));

    const retry = await repository.adminMutate(
      adminPrincipal,
      'sessions',
      sessionId,
      'retry',
      {},
      Number(session.rows[0]?.version),
      'Retrying a verified transient import failure',
      'tracking-admin-retry',
      randomUUID(),
    );
    await expect(
      repository.adminMutate(
        adminPrincipal,
        'sessions',
        sessionId,
        'retry',
        {},
        Number(session.rows[0]?.version),
        'Retrying a verified transient import failure',
        'tracking-admin-retry',
        randomUUID(),
      ),
    ).resolves.toEqual({ ...retry, replayed: true });
    await expect(
      repository.adminMutate(
        readerPrincipal,
        'sessions',
        sessionId,
        'cancel',
        {},
        Number(session.rows[0]?.version) + 1,
        'Reader must not mutate import sessions',
        'tracking-reader-mutation',
        randomUUID(),
      ),
    ).rejects.toThrow('ADMIN_PERMISSION_DENIED');

    const review = await pool.query<{ id: string; version: string }>(
      'select id::text,version::text from public.review_items where import_item_id=$1',
      [itemId],
    );
    const reviewId = String(review.rows[0]?.id);
    const ledgerBefore = await pool.query<{ count: string }>(
      'select count(*)::text from public.transactions where user_id=$1',
      [owner],
    );
    await repository.adminMutate(
      adminPrincipal,
      'low-confidence',
      reviewId,
      'accept_suggestion',
      {},
      Number(review.rows[0]?.version),
      'Recording an operator recommendation for owner review',
      'tracking-admin-recommendation',
      randomUUID(),
    );
    const ownerBoundary = await pool.query<{ status: string; transactions: string }>(
      `select r.status,
        (select count(*)::text from public.transactions where user_id=$2) transactions
       from public.review_items r where r.id=$1`,
      [reviewId, owner],
    );
    expect(ownerBoundary.rows[0]).toEqual({
      status: 'pending',
      transactions: ledgerBefore.rows[0]?.count,
    });
    const evidence = await pool.query<{ audits: string; events: string }>(
      `select
        (select count(*)::text from audit.audit_events where actor_id=$1 and resource_id in ($2,$3)) audits,
        (select count(*)::text from private.outbox_events where event_type='tracking.admin.action.v1' and aggregate_id in ($2::uuid,$3::uuid)) events`,
      [admin, sessionId, reviewId],
    );
    expect(Number(evidence.rows[0]?.audits)).toBeGreaterThanOrEqual(3);
    expect(evidence.rows[0]?.events).toBe('2');
  });
});
