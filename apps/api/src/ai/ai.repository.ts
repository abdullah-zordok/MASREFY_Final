import { createHash } from 'node:crypto';

import { HttpException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey, hashNormalizedCommand } from '../ledger/idempotency';
import { PoolService } from '../platform/database/pool.service';
import type { EffectiveAiRoute } from './ai.gateway';

interface JsonRow extends QueryResultRow {
  result: Record<string, unknown>;
}
interface ClaimRow extends QueryResultRow {
  outcome: 'new' | 'replay' | 'hash_mismatch' | 'in_progress';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  lease_token: string | null;
}
export interface AiWorkClaim extends QueryResultRow {
  kind: 'voice.transcribe_extract' | 'assistant.respond' | 'ai.evaluate_route';
  id: string;
  user_id: string | null;
  claim_token: string;
  attempt_count: number;
}
export interface VoicePurgeClaim extends QueryResultRow {
  id: string;
  storage_ref: string;
  purge_token: string;
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

function mapped(error: unknown): Error {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(Reflect.get(error, 'message'))
      : '';
  if (/NOT_FOUND/.test(message)) return new HttpException({ code: message }, 404);
  if (/EXPIRED/.test(message)) return new HttpException({ code: message }, 410);
  if (/CONSENT|OWNER|PERMISSION|DENIED/.test(message))
    return new HttpException({ code: message }, 403);
  if (/QUOTA|BUDGET/.test(message)) return new HttpException({ code: message }, 429);
  if (/CONFLICT|FENCE|IN_PROGRESS|REUSED/.test(message))
    return new HttpException({ code: message }, 409);
  if (/ROUTE_UNAVAILABLE|PROMPT_UNAVAILABLE/.test(message))
    return new HttpException({ code: 'AI_UNAVAILABLE' }, 503);
  if (/INVALID|LIMIT|REQUIRED|SCHEMA/.test(message))
    return new HttpException({ code: message }, 422);
  return error instanceof Error ? error : new Error('AI_DATABASE_UNAVAILABLE');
}

@Injectable()
export class AiRepository {
  constructor(private readonly pool: PoolService) {}

  operationId(principal: ClerkPrincipal, scope: string, key: string): string {
    return stableUuid(`${principal.userId}:${scope}:${hashIdempotencyKey(key)}`);
  }

  workloadAvailable(workload: string): Promise<boolean> {
    return this.worker(async (client) =>
      Boolean(
        (
          await client.query<{ result: boolean }>(
            'select private.ai_workload_available($1) result',
            [workload],
          )
        ).rows[0]?.result,
      ),
    );
  }

  createVoiceSession(principal: ClerkPrincipal, input: Record<string, unknown>, key: string) {
    return this.idempotent(
      principal,
      'ai.voice-session.create',
      key,
      input,
      201,
      async (client, operationId) =>
        this.json(client, 'select private.create_voice_session($1,$2,$3,$4,$5,$6::uuid) result', [
          principal.userId,
          input.locale,
          input.durationMs,
          input.contentType,
          input.sizeBytes,
          operationId,
        ]),
    );
  }

  processVoiceSession(
    principal: ClerkPrincipal,
    sessionId: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.idempotent(
      principal,
      `ai.voice-session.process.${sessionId}`,
      key,
      input,
      202,
      async (client, operationId) => {
        const quota = await this.json(
          client,
          'select private.reserve_ai_quota($1,$2::uuid,$3) result',
          [principal.userId, operationId, 'voice_transcription'],
        );
        if (!quota.allowed)
          throw new Error(typeof quota.reason === 'string' ? quota.reason : 'AI_QUOTA_EXHAUSTED');
        return this.json(
          client,
          'select private.finalize_voice_session($1,$2::uuid,$3,$4) result',
          [principal.userId, sessionId, input.expectedVersion, input.contentHash],
        );
      },
    );
  }

  getVoiceSession(principal: ClerkPrincipal, sessionId: string) {
    return this.ownerJson(principal, 'select private.get_voice_session($1,$2::uuid) result', [
      principal.userId,
      sessionId,
    ]);
  }

  getVoiceProposal(principal: ClerkPrincipal, sessionId: string) {
    return this.ownerJson(principal, 'select private.get_voice_proposal($1,$2::uuid) result', [
      principal.userId,
      sessionId,
    ]);
  }

  listVoicePreferences(principal: ClerkPrincipal) {
    return this.ownerValues(
      principal,
      'select value from private.list_voice_category_preferences($1)',
      [principal.userId],
    );
  }

  upsertVoicePreference(
    principal: ClerkPrincipal,
    input: {
      id: string | null;
      expectedVersion: number | null;
      merchantPattern: string;
      categoryId: string;
      confidence: number;
    },
    key: string,
  ) {
    return this.idempotent(
      principal,
      `ai.voice-category-preference.${input.id ? 'update' : 'create'}`,
      key,
      input,
      200,
      (client) =>
        this.json(
          client,
          'select private.upsert_voice_category_preference($1,$2::uuid,$3,$4,$5::uuid,$6) result',
          [
            principal.userId,
            input.id,
            input.expectedVersion,
            input.merchantPattern,
            input.categoryId,
            input.confidence,
          ],
        ),
    );
  }

  deleteVoicePreference(principal: ClerkPrincipal, id: string, version: number, key: string) {
    return this.idempotent(
      principal,
      `ai.voice-category-preference.delete.${id}`,
      key,
      { expectedVersion: version },
      204,
      async (client) => ({
        id,
        deleted: Boolean(
          (
            await client.query<{ result: boolean }>(
              'select private.delete_voice_category_preference($1,$2::uuid,$3) result',
              [principal.userId, id, version],
            )
          ).rows[0]?.result,
        ),
      }),
    );
  }

  getConsent(principal: ClerkPrincipal, policyVersion: string) {
    return this.ownerJson(principal, 'select private.get_assistant_consent($1,$2) result', [
      principal.userId,
      policyVersion,
    ]);
  }

  setConsent(principal: ClerkPrincipal, policyVersion: string, enabled: boolean, key: string) {
    return this.idempotent(
      principal,
      `ai.assistant-consent.${enabled ? 'grant' : 'revoke'}`,
      key,
      { policyVersion, enabled },
      200,
      (client) =>
        this.json(client, 'select private.set_assistant_consent($1,$2,$3) result', [
          principal.userId,
          policyVersion,
          enabled,
        ]),
    );
  }

  createConversation(principal: ClerkPrincipal, title: string | null, key: string) {
    return this.idempotent(
      principal,
      'ai.assistant-conversation.create',
      key,
      { title },
      201,
      (client) =>
        this.json(client, 'select private.create_assistant_conversation($1,$2) result', [
          principal.userId,
          title,
        ]),
    );
  }

  updateConversation(
    principal: ClerkPrincipal,
    id: string,
    input: { title?: string | null; status?: string; expectedVersion: number },
    key: string,
  ) {
    return this.idempotent(
      principal,
      `ai.assistant-conversation.update.${id}`,
      key,
      input,
      200,
      (client) =>
        this.json(
          client,
          'select private.update_assistant_conversation($1,$2::uuid,$3,$4,$5) result',
          [principal.userId, id, input.title ?? null, input.status ?? null, input.expectedVersion],
        ),
    );
  }

  async getConversation(principal: ClerkPrincipal, id: string) {
    return this.owner(principal, async (client) => {
      const row = (
        await client.query<Record<string, unknown>>(
          `select id,title,status,last_message_at,version,created_at from public.assistant_conversations where id=$1 and user_id=$2 and status<>'deleted'`,
          [id, principal.userId],
        )
      ).rows[0];
      if (!row) throw new Error('AI_CONVERSATION_NOT_FOUND');
      return publicValue(row) as Record<string, unknown>;
    });
  }

  listConversations(
    principal: ClerkPrincipal,
    cursor: { time: string | null; id: string | null },
    limit: number,
  ) {
    return this.ownerValues(
      principal,
      'select value from private.list_assistant_conversations($1,$2::timestamptz,$3::uuid,$4)',
      [principal.userId, cursor.time, cursor.id, limit],
    );
  }

  enqueueMessage(
    principal: ClerkPrincipal,
    conversationId: string,
    input: Record<string, unknown>,
    key: string,
  ) {
    return this.idempotent(
      principal,
      `ai.assistant-message.create.${conversationId}`,
      key,
      input,
      202,
      async (client, operationId) => {
        const quota = await this.json(
          client,
          'select private.reserve_ai_quota($1,$2::uuid,$3) result',
          [principal.userId, operationId, 'financial_assistant'],
        );
        if (!quota.allowed)
          throw new Error(typeof quota.reason === 'string' ? quota.reason : 'AI_QUOTA_EXHAUSTED');
        return this.json(
          client,
          'select private.enqueue_assistant_message($1,$2::uuid,$3,$4::text[],$5,$6::uuid) result',
          [
            principal.userId,
            conversationId,
            input.content,
            input.contextScope,
            input.responseMode,
            operationId,
          ],
        );
      },
    );
  }

  listMessages(
    principal: ClerkPrincipal,
    conversationId: string,
    cursor: { time: string | null; id: string | null },
    limit: number,
  ) {
    return this.ownerValues(
      principal,
      'select value from private.list_assistant_messages($1,$2::uuid,$3::timestamptz,$4::uuid,$5)',
      [principal.userId, conversationId, cursor.time, cursor.id, limit],
    );
  }

  messageResult(principal: ClerkPrincipal, messageId: string) {
    return this.ownerJson(
      principal,
      'select private.get_assistant_message_result($1,$2::uuid) result',
      [principal.userId, messageId],
    );
  }

  cancelMessage(principal: ClerkPrincipal, messageId: string) {
    return this.owner(principal, async (client) =>
      Boolean(
        (
          await client.query<{ result: boolean }>(
            'select private.cancel_assistant_message($1,$2::uuid) result',
            [principal.userId, messageId],
          )
        ).rows[0]?.result,
      ),
    );
  }

  claimAction(
    principal: ClerkPrincipal,
    id: string,
    version: number,
    operationId: string,
    patch: Record<string, unknown> = {},
  ) {
    return this.ownerJson(
      principal,
      'select private.confirm_ai_action($1::uuid,$2,$3::uuid,$4::jsonb) result',
      [id, version, operationId, JSON.stringify(patch)],
    );
  }

  completeAction(principal: ClerkPrincipal, id: string, token: string, resourceId: string) {
    return this.ownerJson(
      principal,
      'select private.complete_ai_action($1::uuid,$2::uuid,$3::uuid) result',
      [id, token, resourceId],
    );
  }

  rejectAction(
    principal: ClerkPrincipal,
    id: string,
    version: number,
    reason: string | null,
    key: string,
  ) {
    return this.idempotent(
      principal,
      `ai.action.reject.${id}`,
      key,
      { expectedVersion: version, reason },
      200,
      (client) =>
        this.json(client, 'select private.reject_ai_action($1,$2::uuid,$3,$4) result', [
          principal.userId,
          id,
          version,
          reason,
        ]),
    );
  }

  feedback(
    principal: ClerkPrincipal,
    messageId: string,
    rating: number,
    reason: string | null,
    key: string,
  ) {
    return this.idempotent(
      principal,
      `ai.assistant-feedback.${messageId}`,
      key,
      { rating, reason },
      200,
      (client) =>
        this.json(
          client,
          'select private.record_assistant_feedback($1,$2::uuid,$3::smallint,$4) result',
          [principal.userId, messageId, rating, reason],
        ),
    );
  }

  report(principal: ClerkPrincipal, messageId: string, type: string, reason: string, key: string) {
    return this.idempotent(
      principal,
      `ai.assistant-report.${messageId}`,
      key,
      { type, reason },
      201,
      (client) =>
        this.json(client, 'select private.create_ai_response_report($1,$2::uuid,$3,$4) result', [
          principal.userId,
          messageId,
          type,
          reason,
        ]),
    );
  }

  adminRead(principal: ClerkPrincipal, resource: string, id: string | null, limit: number) {
    return this.ownerValues(principal, 'select value from private.read_admin_ai($1,$2::uuid,$3)', [
      resource,
      id,
      limit,
    ]);
  }

  adminReadPage(
    principal: ClerkPrincipal,
    resource: string,
    afterId: string | null,
    limit: number,
  ) {
    return this.ownerValues(
      principal,
      'select value from private.read_admin_ai($1,$2::uuid,$3,false)',
      [resource, afterId, limit],
    );
  }

  adminMutate(
    principal: ClerkPrincipal,
    resource: string,
    id: string | null,
    input: Record<string, unknown>,
    key: string,
    requestId: string,
  ) {
    return this.idempotent(
      principal,
      `ai.admin.${resource}.${id ? 'update' : 'create'}`,
      key,
      input,
      id ? 200 : 201,
      async (client) => {
        const { reason, expectedVersion, ...patch } = input;
        return this.json(
          client,
          'select private.mutate_admin_ai($1,$2::uuid,$3,$4::jsonb,$5,$6,$7) result',
          [
            resource,
            id,
            expectedVersion ?? 1,
            JSON.stringify(patch),
            principal.userId,
            reason,
            requestId,
          ],
        );
      },
      true,
    );
  }

  testPrompt(
    principal: ClerkPrincipal,
    id: string,
    input: Record<string, unknown>,
    key: string,
    requestId: string,
  ) {
    return this.idempotent(
      principal,
      `ai.prompts.test.${id}`,
      key,
      input,
      202,
      (client) =>
        this.json(client, 'select private.test_ai_prompt_version($1::uuid,$2,$3,$4,$5) result', [
          id,
          input.expectedVersion,
          principal.userId,
          input.reason,
          requestId,
        ]),
      true,
    );
  }

  publishPrompt(
    principal: ClerkPrincipal,
    id: string,
    input: Record<string, unknown>,
    key: string,
    requestId: string,
  ) {
    return this.idempotent(
      principal,
      `ai.prompts.publish.${id}`,
      key,
      input,
      200,
      (client) =>
        this.json(client, 'select private.publish_ai_prompt_version($1::uuid,$2,$3,$4,$5) result', [
          id,
          input.expectedVersion,
          principal.userId,
          input.reason,
          requestId,
        ]),
      true,
    );
  }

  getRoute(workload: string): Promise<EffectiveAiRoute | null> {
    return this.worker(
      async (client) =>
        (
          await client.query<{ result: EffectiveAiRoute | null }>(
            'select private.get_effective_ai_route($1) result',
            [workload],
          )
        ).rows[0]?.result ?? null,
    );
  }

  claimWork(kind: AiWorkClaim['kind'], workerId: string, limit: number, leaseSeconds: number) {
    return this.worker(
      async (client) =>
        (
          await client.query<AiWorkClaim>('select * from private.claim_ai_work($1,$2,$3,$4)', [
            kind,
            workerId,
            limit,
            leaseSeconds,
          ])
        ).rows,
    );
  }

  workInput(kind: string, id: string, token: string) {
    return this.workerJson('select private.get_ai_work_input($1,$2::uuid,$3::uuid) result', [
      kind,
      id,
      token,
    ]);
  }

  saveVoiceResult(
    id: string,
    token: string,
    result: {
      provider: string;
      model: string;
      transcript: string;
      confidence: number;
      language: string;
      payload: unknown;
    },
  ) {
    return this.workerJson(
      'select private.save_voice_result($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::jsonb) result',
      [
        id,
        token,
        result.provider,
        result.model,
        result.transcript,
        result.confidence,
        result.language,
        JSON.stringify(result.payload),
      ],
    );
  }

  saveAssistantResult(
    id: string,
    token: string,
    result: {
      provider: string;
      model: string;
      content: string;
      evidence: unknown;
      preview: unknown;
    },
  ) {
    return this.workerJson(
      'select private.save_assistant_result($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb) result',
      [
        id,
        token,
        result.provider,
        result.model,
        result.content,
        JSON.stringify(result.evidence),
        result.preview == null ? null : JSON.stringify(result.preview),
      ],
    );
  }

  completeWork(
    kind: string,
    id: string,
    token: string,
    status: 'completed' | 'failed' | 'retry',
    error: string | null,
  ) {
    return this.worker(async (client) =>
      Boolean(
        (
          await client.query<{ result: boolean }>(
            'select private.complete_ai_work($1,$2::uuid,$3::uuid,$4,$5) result',
            [kind, id, token, status, error],
          )
        ).rows[0]?.result,
      ),
    );
  }

  recordUsage(
    userId: string | null,
    workload: string,
    completion: {
      model: string;
      provider: string;
      usage: { inputTokens: number; outputTokens: number; cost: number };
      latencyMs: number;
      fallbackUsed: boolean;
      generationId: string;
    },
    requestId: string,
  ) {
    const generationHash = createHash('sha256').update(completion.generationId).digest('hex');
    return this.worker(async (client) => {
      await client.query('select private.record_ai_usage($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [
        userId,
        workload,
        completion.model,
        completion.provider,
        completion.usage.inputTokens,
        completion.usage.outputTokens,
        completion.usage.cost,
        completion.latencyMs,
        completion.fallbackUsed,
        requestId,
      ]);
      await client.query('select private.record_ai_generation_hash($1,$2)', [
        requestId,
        generationHash,
      ]);
    });
  }

  recordFailure(
    userId: string | null,
    workload: string,
    code: string,
    schemaFailure: boolean,
    retryable: boolean,
    latencyMs: number,
    requestId: string,
  ) {
    return this.worker(async (client) => {
      await client.query('select private.record_ai_failure($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
        userId,
        workload,
        null,
        null,
        code,
        schemaFailure,
        retryable,
        latencyMs,
        requestId,
      ]);
    });
  }

  expire(limit: number) {
    return this.worker(
      async (client) =>
        (
          await client.query<{ result: number }>('select private.expire_ai_proposals($1) result', [
            limit,
          ])
        ).rows[0]?.result ?? 0,
    );
  }
  reconcile(limit: number) {
    return this.workerJson('select private.reconcile_ai_state($1) result', [limit]);
  }
  rollup(limit: number) {
    return this.workerJson('select private.rollup_ai_usage($1) result', [limit]);
  }
  claimPurges(workerId: string, limit: number, leaseSeconds: number) {
    return this.worker(
      async (client) =>
        (
          await client.query<VoicePurgeClaim>(
            'select * from private.claim_voice_media_purge($1,$2,$3)',
            [workerId, limit, leaseSeconds],
          )
        ).rows,
    );
  }
  completePurge(id: string, token: string, deleted: boolean) {
    return this.worker(async (client) =>
      Boolean(
        (
          await client.query<{ result: boolean }>(
            'select private.complete_voice_media_purge($1::uuid,$2::uuid,$3,$4) result',
            [id, token, deleted, deleted ? null : 'VOICE_PURGE_FAILED'],
          )
        ).rows[0]?.result,
      ),
    );
  }

  private async idempotent(
    principal: ClerkPrincipal,
    scope: string,
    key: string,
    command: Record<string, unknown>,
    status: number,
    action: (client: PoolClient, operationId: string) => Promise<Record<string, unknown>>,
    admin = false,
  ) {
    return this.owner(principal, async (client) => {
      const keyHash = hashIdempotencyKey(key),
        requestHash = hashNormalizedCommand(command);
      const storedScope = admin ? `tracking.admin.${scope}` : scope;
      const claim = (
        await client.query<ClaimRow>(
          admin
            ? 'select * from private.claim_tracking_admin_idempotency($1,$2,$3,$4,$5::interval)'
            : 'select * from private.claim_sync_idempotency_key($1,$2,$3,$4,$5::interval)',
          [principal.userId, storedScope, keyHash, requestHash, '2 minutes'],
        )
      ).rows[0];
      if (!claim) throw new Error('IDEMPOTENCY_REPLAY_UNAVAILABLE');
      if (claim.outcome === 'replay') return { ...(claim.response_body ?? {}), replayed: true };
      if (claim.outcome === 'hash_mismatch') throw new Error('IDEMPOTENCY_KEY_REUSED');
      if (claim.outcome === 'in_progress' || !claim.lease_token)
        throw new Error('IDEMPOTENCY_IN_PROGRESS');
      const operationId = this.operationId(principal, scope, key);
      const resource = await action(client, operationId);
      const response = { resource: publicValue(resource), operationId, replayed: false };
      await client.query(
        admin
          ? 'select private.complete_tracking_admin_idempotency($1,$2,$3,$4,$5,$6,$7::jsonb,$8)'
          : 'select private.complete_sync_idempotency_key($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
        [
          principal.userId,
          storedScope,
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
  }

  private ownerJson(principal: ClerkPrincipal, sql: string, values: readonly unknown[]) {
    return this.owner(
      principal,
      async (client) =>
        publicValue(await this.json(client, sql, values)) as Record<string, unknown>,
    );
  }
  private workerJson(sql: string, values: readonly unknown[]) {
    return this.worker(
      async (client) =>
        publicValue(await this.json(client, sql, values)) as Record<string, unknown>,
    );
  }
  private ownerValues(principal: ClerkPrincipal, sql: string, values: readonly unknown[]) {
    return this.owner(
      principal,
      async (client) =>
        publicValue(
          (await client.query<{ value: Record<string, unknown> }>(sql, [...values])).rows.map(
            ({ value }) => value,
          ),
        ) as Record<string, unknown>[],
    );
  }
  private async json(client: PoolClient, sql: string, values: readonly unknown[]) {
    const result = (await client.query<JsonRow>(sql, [...values])).rows[0]?.result;
    if (!result) throw new Error('AI_RESULT_MISSING');
    return result;
  }
  private owner<T>(principal: ClerkPrincipal, action: (client: PoolClient) => Promise<T>) {
    return this.transaction('masarifi_api', principal, action);
  }
  private worker<T>(action: (client: PoolClient) => Promise<T>) {
    return this.transaction('masarifi_worker', null, action);
  }
  private transaction<T>(
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
        const value = await action(client);
        await client.query('commit');
        return value;
      } catch (error) {
        await client.query('rollback');
        throw mapped(error);
      }
    });
  }
}
