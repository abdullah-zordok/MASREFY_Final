import { createHash } from 'node:crypto';

import { HttpException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey, hashNormalizedCommand } from '../ledger/idempotency';
import { PoolService } from '../platform/database/pool.service';
import type { NormalizedImport, TrackingCursor } from './tracking.dto';

interface Claim extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  lease_token: string | null;
}

interface JsonResult extends QueryResultRow {
  result: Record<string, unknown>;
}

export interface ImportClaim extends QueryResultRow {
  id: string;
  user_id: string;
  claim_token: string;
  attempt_count: number;
}

export interface ParserCorpusClaim extends QueryResultRow {
  id: string;
  claim_token: string;
  attempt_count: number;
}

function stableUuid(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function publicValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      camel(key),
      publicValue(child),
    ]),
  );
}

function mappedError(error: unknown): HttpException | Error {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(Reflect.get(error, 'message'))
      : '';
  if (/CONFLICT|STALE|IN_PROGRESS|REUSED/.test(message))
    return new HttpException({ code: message }, 409);
  if (/NOT_FOUND/.test(message)) return new HttpException({ code: message }, 404);
  if (/INVALID|LIMIT|REQUIRED/.test(message)) return new HttpException({ code: message }, 400);
  return error instanceof Error ? error : new Error('TRACKING_DATABASE_UNAVAILABLE');
}

@Injectable()
export class TrackingRepository {
  constructor(private readonly pool: PoolService) {}

  getPreferences(principal: ClerkPrincipal): Promise<Record<string, unknown>> {
    return this.ownerJson(principal, 'select private.get_tracking_preferences($1) result', [
      principal.userId,
    ]);
  }

  trackingStatus(principal: ClerkPrincipal): Promise<Record<string, unknown>> {
    return this.ownerJson(
      principal,
      `select jsonb_build_object(
        'lastDetectedAt',(select max(h.occurred_at) from public.tracking_history h where h.user_id=$1),
        'lastSuccessfulTransactionId',(select h.transaction_id from public.tracking_history h where h.user_id=$1 and h.outcome='accepted' and h.transaction_id is not null order by h.occurred_at desc,h.id desc limit 1),
        'detectedThisMonth',(select count(*) from public.tracking_history h where h.user_id=$1 and h.occurred_at>=date_trunc('month',clock_timestamp())),
        'reviewCount',(select count(*) from public.review_items r where r.user_id=$1 and r.status='pending'),
        'activeKeywordCount',(select count(*) from public.user_keyword_rules k where k.user_id=$1 and k.enabled),
        'activeSenderCount',(select count(*) from public.user_sender_rules s where s.user_id=$1 and s.enabled),
        'lastUpdatedAt',greatest(p.updated_at,coalesce((select max(h.occurred_at) from public.tracking_history h where h.user_id=$1),p.updated_at))
      ) result from public.tracking_preferences p where p.user_id=$1`,
      [principal.userId],
    );
  }

  updatePreferences(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.preferences.update',
      key,
      command,
      200,
      requestId,
      (client) =>
        this.queryJson(
          client,
          'select private.update_tracking_preferences($1,$2,$3,$4,$5,$6) result',
          [
            principal.userId,
            command.enabled,
            command.reviewRequired,
            command.sourceRetentionDays,
            command.historyRetentionDays,
            command.expectedVersion,
          ],
        ),
    );
  }

  listOwner(
    principal: ClerkPrincipal,
    table: string,
    id: string | null,
    limit: number,
    cursor: TrackingCursor | null = null,
    filters: Record<string, string | number> = {},
  ): Promise<unknown[]> {
    const allowed: Record<string, string> = {
      keywords: 'user_keyword_rules',
      senders: 'user_sender_rules',
      sessions: 'import_sessions',
      items: 'import_items',
      reviews: 'review_items',
      duplicates: 'duplicate_candidates',
      history: 'tracking_history',
    };
    const name = allowed[table];
    if (!name) throw new Error('TRACKING_RESOURCE_INVALID');
    const cursorColumn =
      name === 'import_sessions'
        ? 'started_at'
        : name === 'import_items'
          ? 'coalesce(occurred_at,created_at)'
          : name === 'tracking_history'
            ? 'occurred_at'
            : 'created_at';
    const sensitive =
      name === 'import_sessions'
        ? "-'request_hash'-'claim_token'-'claimed_by'-'lease_until'-'last_error_code'"
        : name === 'user_keyword_rules'
          ? "||jsonb_build_object('recent_use_count',(select count(*) from public.import_items i where i.user_id=x.user_id and x.id=any(i.applied_rule_ids)),'last_used_at',(select max(i.occurred_at) from public.import_items i where i.user_id=x.user_id and x.id=any(i.applied_rule_ids)))"
          : name === 'user_sender_rules'
            ? "||jsonb_build_object('recent_use_count',(select count(*) from public.import_items i where i.user_id=x.user_id and lower(i.normalized_payload->>'sender')=lower(x.sender_pattern)),'last_used_at',(select max(i.occurred_at) from public.import_items i where i.user_id=x.user_id and lower(i.normalized_payload->>'sender')=lower(x.sender_pattern)))"
            : name === 'import_items'
              ? "-'source_hash'-'normalized_hash'||jsonb_build_object('normalized_payload',x.normalized_payload-'body'-'sender'-'metadata'-'sourceText')"
              : name === 'review_items'
                ? "-'decision_token'-'decision_lease_until'"
                : name === 'duplicate_candidates'
                  ? "-'decision_token'-'decision_lease_until'"
                  : '';
    const predicates: Record<string, string> = {
      sessions: 'and ($6::text is null or status=$6) and ($7::text is null or source_type=$7)',
      reviews: 'and ($6::text is null or status=$6)',
      duplicates:
        'and ($6::text is null or status=$6) and ($8::integer is null or score*10000 >= $8)',
      history: 'and ($9::text is null or outcome=$9) and ($7::text is null or source_type=$7)',
    };
    return this.owner(principal, async (client) => {
      const rows = await client.query<{ value: unknown } & QueryResultRow>(
        `select to_jsonb(x)${sensitive} value from public.${name} x
         where user_id=$1 and ($2::uuid is null or id=$2)
           and ($4::timestamptz is null or (${cursorColumn},id)<($4::timestamptz,$5::uuid))
           ${predicates[table] ?? ''}
           and ($6::text is null or true) and ($7::text is null or true)
           and ($8::integer is null or true) and ($9::text is null or true)
         order by ${cursorColumn} desc,id desc limit $3`,
        [
          principal.userId,
          id,
          limit,
          cursor?.at ?? null,
          cursor?.id ?? null,
          filters.status ?? null,
          filters.sourceType ?? null,
          filters.minScore ?? null,
          filters.outcome ?? null,
        ],
      );
      return rows.rows.map((row) => publicValue(row.value));
    });
  }

  listSessionItems(
    principal: ClerkPrincipal,
    sessionId: string,
    itemId: string | null,
    limit: number,
    cursor: TrackingCursor | null = null,
    filters: Record<string, string | number> = {},
  ): Promise<unknown[]> {
    return this.owner(principal, async (client) => {
      const rows = await client.query<{ value: unknown } & QueryResultRow>(
        `select to_jsonb(i)-'user_id'-'source_hash'-'normalized_hash'||jsonb_build_object('normalized_payload',i.normalized_payload-'body'-'sender'-'metadata'-'sourceText') value from public.import_items i
         where user_id=$1 and session_id=$2::uuid and ($3::uuid is null or id=$3)
           and ($5::timestamptz is null or (coalesce(occurred_at,created_at),id)<($5::timestamptz,$6::uuid))
           and ($7::text is null or status=$7)
         order by coalesce(occurred_at,created_at) desc,id desc limit $4`,
        [
          principal.userId,
          sessionId,
          itemId,
          limit,
          cursor?.at ?? null,
          cursor?.id ?? null,
          filters.status ?? null,
        ],
      );
      return rows.rows.map((row) => publicValue(row.value));
    });
  }

  getImportSourceIdentityHash(principal: ClerkPrincipal, itemId: string): Promise<string> {
    return this.owner(principal, async (client) => {
      const row = (
        await client.query<{ source_type: string; source_item_key: string } & QueryResultRow>(
          `select s.source_type,i.source_item_key from public.import_items i
           join public.import_sessions s on s.id=i.session_id and s.user_id=i.user_id
           where i.id=$1::uuid and i.user_id=$2`,
          [itemId, principal.userId],
        )
      ).rows[0];
      if (!row) throw new HttpException({ code: 'IMPORT_ITEM_NOT_FOUND' }, 404);
      return createHash('sha256')
        .update(`${row.source_type}\0${row.source_item_key}`)
        .digest('hex');
    });
  }

  rawPayloadRegistered(principal: ClerkPrincipal, storageRef: string): Promise<boolean> {
    return this.owner(principal, async (client) => {
      const row = (
        await client.query<{ registered: boolean } & QueryResultRow>(
          'select private.raw_ingestion_payload_registered($1,$2) registered',
          [principal.userId, storageRef],
        )
      ).rows[0];
      return row?.registered === true;
    });
  }

  queueRawCleanup(
    principal: ClerkPrincipal,
    raw: {
      storageRef: string;
      payloadHash: string;
      contentType: string;
      sizeBytes: number;
    },
  ): Promise<void> {
    return this.owner(principal, async (client) => {
      await client.query('select private.queue_raw_ingestion_cleanup($1,$2,$3,$4)', [
        raw.storageRef,
        raw.payloadHash,
        raw.contentType,
        raw.sizeBytes,
      ]);
    });
  }

  async createImport(
    principal: ClerkPrincipal,
    input: NormalizedImport,
    request: {
      sourceName: string | null;
      key: string;
      requestId: string;
      raw?: {
        storageRef: string;
        payloadHash: string;
        contentType: string;
        sizeBytes: number;
        expiresAt: Date;
      };
    },
  ): Promise<Record<string, unknown>> {
    const replayCommand = {
      ...input,
      events: input.events.map((event) =>
        Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'receivedAt')),
      ),
    };
    return this.idempotent(
      principal,
      'tracking.import.create',
      request.key,
      replayCommand,
      201,
      request.requestId,
      async (client) => {
        const requestHash = hashNormalizedCommand(input).replace('sha256:', '');
        const sourceType = input.sourceType;
        const row = await this.queryJson(
          client,
          'select private.create_import_session($1,$2,$3,1,$4,$5::jsonb) result',
          [
            principal.userId,
            sourceType,
            request.sourceName,
            requestHash,
            JSON.stringify(input.events),
          ],
        );
        if (request.raw)
          await this.queryJson(
            client,
            'select private.register_raw_ingestion_payload($1,$2::uuid,$3,$4,$5,$6,$7) result',
            [
              principal.userId,
              row.id,
              request.raw.storageRef,
              request.raw.payloadHash,
              request.raw.contentType,
              request.raw.sizeBytes,
              request.raw.expiresAt,
            ],
          );
        return row;
      },
    );
  }

  recordUnsupported(
    principal: ClerkPrincipal,
    contentHash: string,
    sourceName: string | null,
    reason: string,
  ): Promise<Record<string, unknown>> {
    return this.ownerJson(
      principal,
      'select private.record_unsupported_import($1,$2,$3,$4) result',
      [principal.userId, contentHash, sourceName, reason],
    );
  }

  keyword(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.keyword.mutate',
      key,
      command,
      command.id ? 200 : 201,
      requestId,
      (client) =>
        this.queryJson(
          client,
          'select private.upsert_keyword_rule($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
          [
            principal.userId,
            command.id,
            command.keyword,
            command.groupKey,
            command.languageCode,
            command.matchType,
            command.categoryId,
            command.priority,
            command.enabled,
            command.expectedVersion,
          ],
        ),
    );
  }

  sender(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.sender.mutate',
      key,
      command,
      command.id ? 200 : 201,
      requestId,
      (client) =>
        this.queryJson(
          client,
          'select private.upsert_sender_rule($1,$2,$3,$4,$5,$6,$7,$8) result',
          [
            principal.userId,
            command.id,
            command.senderPattern,
            command.displayLabel,
            command.institutionId,
            command.trusted,
            command.enabled,
            command.expectedVersion,
          ],
        ),
    );
  }

  removeRule(
    principal: ClerkPrincipal,
    kind: 'keyword' | 'sender',
    id: string,
    version: number,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      `tracking.${kind}.delete`,
      key,
      { id, version },
      204,
      requestId,
      async (client) => {
        await client.query(`select private.delete_${kind}_rule($1,$2::uuid,$3)`, [
          principal.userId,
          id,
          version,
        ]);
        return { id };
      },
    );
  }

  restoreKeywords(
    principal: ClerkPrincipal,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.keyword.restore',
      key,
      {},
      200,
      requestId,
      async (client) => ({
        restored: Number(
          (
            await client.query<{ result: string } & QueryResultRow>(
              'select private.restore_default_keyword_rules($1) result',
              [principal.userId],
            )
          ).rows[0]?.result ?? 0,
        ),
      }),
    );
  }

  claimReview(
    principal: ClerkPrincipal,
    id: string,
    decision: unknown,
    expectedVersion: unknown,
    decisionToken: string,
  ): Promise<Record<string, unknown>> {
    return this.owner(principal, (client) =>
      this.queryJson(
        client,
        'select private.claim_review_decision($1,$2::uuid,$3,$4,$5::uuid,120) result',
        [principal.userId, id, decision, expectedVersion, decisionToken],
      ),
    );
  }

  decideReview(
    principal: ClerkPrincipal,
    id: string,
    command: Record<string, unknown>,
    decisionToken: string,
    operationId: string | null,
    transactionId: string | null,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.review.decide',
      key,
      { id, ...command },
      200,
      requestId,
      async (client) => {
        return this.queryJson(
          client,
          'select private.decide_review_item($1,$2::uuid,$3,$4::jsonb,$5::uuid,$6::uuid,$7::uuid) result',
          [
            principal.userId,
            id,
            command.decision,
            JSON.stringify(command.patch ?? {}),
            decisionToken,
            operationId,
            transactionId,
          ],
        );
      },
    );
  }

  claimDuplicate(
    principal: ClerkPrincipal,
    id: string,
    resolution: unknown,
    expectedVersion: unknown,
    decisionToken: string,
  ): Promise<Record<string, unknown>> {
    return this.owner(principal, (client) =>
      this.queryJson(
        client,
        'select private.claim_duplicate_decision($1,$2::uuid,$3,$4,$5::uuid,120) result',
        [principal.userId, id, resolution, expectedVersion, decisionToken],
      ),
    );
  }

  decideDuplicate(
    principal: ClerkPrincipal,
    id: string,
    command: Record<string, unknown>,
    decisionToken: string,
    operationId: string | null,
    transactionId: string,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.duplicate.decide',
      key,
      { id, ...command },
      200,
      requestId,
      async (client) => {
        return this.queryJson(
          client,
          'select private.decide_duplicate_candidate($1,$2::uuid,$3,$4::uuid,$5::uuid,$6::uuid) result',
          [principal.userId, id, command.resolution, decisionToken, operationId, transactionId],
        );
      },
    );
  }

  feedback(
    principal: ClerkPrincipal,
    command: Record<string, unknown>,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.feedback.create',
      key,
      command,
      201,
      requestId,
      (client) =>
        this.queryJson(
          client,
          'select private.record_tracking_feedback($1,$2::uuid,$3,$4::uuid,$5) result',
          [
            principal.userId,
            command.historyId,
            command.feedbackType,
            command.correctedCategoryId,
            command.comment,
          ],
        ),
    );
  }

  clearHistory(
    principal: ClerkPrincipal,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.history.clear',
      key,
      {},
      204,
      requestId,
      async (client) => ({
        cleared: Number(
          (
            await client.query<{ result: string } & QueryResultRow>(
              'select private.clear_tracking_history($1) result',
              [principal.userId],
            )
          ).rows[0]?.result ?? 0,
        ),
      }),
    );
  }

  adminRead(
    principal: ClerkPrincipal,
    resource: string,
    id: string | null,
    limit: number,
    purpose: string | null,
    cursor: TrackingCursor | null,
    filters: Record<string, unknown>,
  ): Promise<unknown> {
    return this.owner(principal, async (client) =>
      publicValue(
        (
          await client.query<{ result: unknown } & QueryResultRow>(
            'select private.read_tracking_admin($1,$2::uuid,$3,$4,$5,$6::timestamptz,$7::uuid,$8::jsonb) result',
            [
              resource,
              id,
              limit,
              purpose,
              principal.userId,
              cursor?.at ?? null,
              cursor?.id ?? null,
              JSON.stringify(filters),
            ],
          )
        ).rows[0]?.result,
      ),
    );
  }

  publishVersion(
    principal: ClerkPrincipal,
    id: string,
    expectedVersion: number,
    reason: string,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.parser.publish',
      key,
      { id, expectedVersion, reason },
      200,
      requestId,
      (client) =>
        this.queryJson(client, 'select private.publish_parser_version($1::uuid,$2,$3,$4) result', [
          id,
          expectedVersion,
          principal.userId,
          reason,
        ]),
      true,
    );
  }

  adminMutate(
    principal: ClerkPrincipal,
    resource: string,
    id: string | null,
    action: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    reason: string,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const command = { resource, id, action, patch, expectedVersion, reason };
    return this.idempotent(
      principal,
      `tracking.admin.${resource}`,
      key,
      command,
      200,
      requestId,
      (client) =>
        this.queryJson(
          client,
          'select private.mutate_tracking_admin($1,$2::uuid,$3,$4::jsonb,$5,$6,$7) result',
          [resource, id, action, JSON.stringify(patch), expectedVersion, reason, principal.userId],
        ),
      true,
    );
  }

  parserPreview(principal: ClerkPrincipal, ruleId: string): Promise<Record<string, unknown>> {
    return this.ownerJson(principal, 'select private.read_parser_preview($1::uuid) result', [
      ruleId,
    ]);
  }

  queueParserCorpus(
    principal: ClerkPrincipal,
    versionId: string,
    reason: string,
    key: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    return this.idempotent(
      principal,
      'tracking.parser.corpus',
      key,
      { versionId, reason },
      202,
      requestId,
      (client) =>
        this.queryJson(client, 'select private.queue_parser_corpus($1::uuid,$2,$3) result', [
          versionId,
          principal.userId,
          reason,
        ]),
      true,
    );
  }

  claimParserCorpus(workerId: string): Promise<ParserCorpusClaim[]> {
    return this.worker(
      async (client) =>
        (
          await client.query<ParserCorpusClaim>(
            'select * from private.claim_parser_corpus($1,20,60)',
            [workerId],
          )
        ).rows,
    );
  }

  prepareParserCorpus(id: string, token: string): Promise<Record<string, unknown>> {
    return this.worker((client) =>
      this.queryJson(client, 'select private.read_parser_corpus($1::uuid,$2::uuid) result', [
        id,
        token,
      ]),
    );
  }

  completeParserCorpus(
    id: string,
    token: string,
    results: Array<{ id: string; passed: boolean }> | null,
    errorCode: string | null,
  ): Promise<Record<string, unknown>> {
    return this.worker((client) =>
      this.queryJson(
        client,
        'select private.complete_parser_corpus($1::uuid,$2::uuid,$3::jsonb,$4) result',
        [id, token, results ? JSON.stringify(results) : null, errorCode],
      ),
    );
  }

  claimImports(workerId: string): Promise<ImportClaim[]> {
    return this.worker(
      async (client) =>
        (
          await client.query<ImportClaim>('select * from private.claim_import_session($1,100,60)', [
            workerId,
          ])
        ).rows,
    );
  }

  completeImport(
    id: string,
    token: string,
    status: 'succeeded' | 'failed',
    code: string | null,
  ): Promise<void> {
    return this.worker(async (client) => {
      await client.query('select private.complete_import_attempt($1::uuid,$2::uuid,$3,$4)', [
        id,
        token,
        status,
        code,
      ]);
    });
  }

  prepareImport(id: string, token: string): Promise<Record<string, unknown>> {
    return this.worker(
      async (client) =>
        publicValue(
          await this.queryJson(
            client,
            'select private.prepare_import_session($1::uuid,$2::uuid) result',
            [id, token],
          ),
        ) as Record<string, unknown>,
    );
  }

  applyParserResult(id: string, token: string, result: Record<string, unknown>): Promise<void> {
    return this.worker(async (client) => {
      await client.query('select private.apply_parser_result($1::uuid,$2::uuid,$3::jsonb)', [
        id,
        token,
        JSON.stringify(result),
      ]);
    });
  }

  finalizeImport(id: string, token: string): Promise<Record<string, unknown>> {
    return this.worker((client) =>
      this.queryJson(client, 'select private.finalize_import_session($1::uuid,$2::uuid) result', [
        id,
        token,
      ]),
    );
  }

  acceptImportItem(
    id: string,
    token: string,
    operationId: string,
    transactionId: string,
  ): Promise<void> {
    return this.worker(async (client) => {
      await client.query('select private.accept_import_item($1::uuid,$2::uuid,$3::uuid,$4::uuid)', [
        id,
        token,
        operationId,
        transactionId,
      ]);
    });
  }

  deferImportItem(id: string, token: string, reason: string): Promise<void> {
    return this.worker(async (client) => {
      await client.query('select private.defer_import_item($1::uuid,$2::uuid,$3)', [
        id,
        token,
        reason,
      ]);
    });
  }

  maintenance(): Promise<void> {
    return this.worker(async (client) => {
      await client.query('select private.compact_tracking_history(1000)');
      await client.query('select private.reconcile_import_sessions(1000)');
    });
  }

  operationalMetrics(): Promise<Record<string, unknown>> {
    return this.worker((client) =>
      this.queryJson(client, 'select private.tracking_operational_metrics() result', []),
    );
  }

  rawDue(): Promise<Array<{ id: string; storage_ref: string; purge_token: string }>> {
    return this.worker(
      async (client) =>
        (
          await client.query<
            { id: string; storage_ref: string; purge_token: string } & QueryResultRow
          >('select * from private.purge_raw_ingestion_payloads(100)')
        ).rows,
    );
  }

  completeRaw(id: string, purgeToken: string): Promise<boolean> {
    return this.worker(async (client) => {
      const row = (
        await client.query<{ completed: boolean } & QueryResultRow>(
          'select private.complete_raw_ingestion_purge($1::uuid,$2::uuid) completed',
          [id, purgeToken],
        )
      ).rows[0];
      return row?.completed === true;
    });
  }

  private async idempotent(
    principal: ClerkPrincipal,
    scope: string,
    key: string,
    command: Record<string, unknown>,
    status: number,
    requestId: string,
    action: (client: PoolClient) => Promise<Record<string, unknown>>,
    admin = false,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.owner(principal, async (client) => {
        const keyHash = hashIdempotencyKey(key),
          requestHash = hashNormalizedCommand(command);
        const claim = (
          await client.query<Claim>(
            admin
              ? 'select * from private.claim_tracking_admin_idempotency($1,$2,$3,$4,$5::interval)'
              : 'select * from private.claim_sync_idempotency_key($1,$2,$3,$4,$5::interval)',
            [principal.userId, scope, keyHash, requestHash, '2 minutes'],
          )
        ).rows[0];
        if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
        if (claim.outcome === 'replay') return { ...(claim.response_body ?? {}), replayed: true };
        if (claim.outcome === 'hash_mismatch') throw new Error('IDEMPOTENCY_KEY_REUSED');
        if (claim.outcome === 'in_progress' || !claim.lease_token)
          throw new Error('IDEMPOTENCY_IN_PROGRESS');
        const resource = await action(client);
        const operationId = stableUuid(`${principal.userId}:${scope}:${keyHash}`);
        const response = {
          operationId,
          replayed: false,
          resource: publicValue(resource) as Record<string, unknown>,
          requestId,
          occurredAt: new Date().toISOString(),
        };
        await client.query(
          admin
            ? 'select private.complete_tracking_admin_idempotency($1,$2,$3,$4,$5,$6,$7::jsonb,$8)'
            : 'select private.complete_sync_idempotency_key($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
          [
            principal.userId,
            scope,
            keyHash,
            requestHash,
            claim.lease_token,
            status,
            JSON.stringify(response),
            typeof resource.id === 'string' ? resource.id : operationId,
          ],
        );
        return response;
      });
    } catch (error) {
      throw mappedError(error);
    }
  }

  private ownerJson(
    principal: ClerkPrincipal,
    sql: string,
    values: readonly unknown[],
  ): Promise<Record<string, unknown>> {
    return this.owner(
      principal,
      async (client) =>
        publicValue(await this.queryJson(client, sql, values)) as Record<string, unknown>,
    );
  }

  private async queryJson(
    client: PoolClient,
    sql: string,
    values: readonly unknown[],
  ): Promise<Record<string, unknown>> {
    const result = (await client.query<JsonResult>(sql, [...values])).rows[0]?.result;
    if (!result) throw new Error('TRACKING_RESULT_MISSING');
    return result;
  }

  private owner<T>(
    principal: ClerkPrincipal,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction('masarifi_api', principal, action);
  }

  private worker<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.transaction('masarifi_worker', null, action);
  }

  private async transaction<T>(
    role: 'masarifi_api' | 'masarifi_worker',
    principal: ClerkPrincipal | null,
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.pool.withClient(async (client) => {
      await client.query('begin');
      try {
        if (principal)
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              role: 'authenticated',
              sub: principal.userId,
              sid: principal.sessionId,
            }),
          ]);
        await client.query(
          role === 'masarifi_api'
            ? 'set local role masarifi_api'
            : 'set local role masarifi_worker',
        );
        const result = await action(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw mappedError(error);
      }
    });
  }
}
