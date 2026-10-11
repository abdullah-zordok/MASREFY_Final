import { createHash } from 'node:crypto';
import { HttpException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { LedgerService } from '../ledger/ledger.service';
import { PlanningService } from '../planning/planning.service';
import { PlatformConfigService } from '../platform/config/platform-config.service';
import { TrackingService } from '../tracking/tracking.service';
import {
  actionDecision,
  adminCreate,
  adminMutation,
  assistantMessage,
  consent,
  conversationCreate,
  conversationUpdate,
  createVoiceV2,
  feedback,
  idempotencyKey,
  page,
  positiveVersion,
  processVoice,
  responseReport,
  uuid,
  voicePreference,
  voiceDecision,
  wantsVoiceEventResults,
} from './ai.dto';
import { recordAiResult } from './ai.observability';
import { AiRepository } from './ai.repository';
import { redactAiText } from './ai.schemas';
import { AiStorage } from './ai.storage';
import { AssistantFinancialTools } from './ai-financial-tools';
import { routeAssistantMessage, selectConversationHistory } from './ai-routing';
import { zonedDateTimeToInstant } from '../reports/reports.period';

const CONSENT_POLICY = 'assistant-privacy-v1';
const STREAM_TIMEOUT_MS = 65_000;

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

function resource(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function resourceId(value: unknown): string {
  const root = resource(value);
  for (const candidate of [
    root.resourceId,
    root.id,
    resource(root.resource).id,
    resource(root.transaction).id,
    resource(resource(root.transaction).transaction).id,
    resource(root.budget).id,
    resource(root.goal).id,
    resource(root.payment).id,
  ]) {
    if (typeof candidate === 'string') return uuid(candidate);
  }
  throw new HttpException({ code: 'AI_ACTION_RESULT_INVALID' }, 500);
}

function resultResource(value: unknown): Record<string, unknown> {
  return resource(resource(value).resource);
}

function publicVoiceSession(row: Record<string, unknown>) {
  return {
    id: row.id,
    locale: row.locale,
    status: row.status,
    durationMs: row.durationMs,
    expiresAt: row.expiresAt,
    confirmedAt: row.confirmedAt ?? null,
    failureCode: row.failureCode ?? null,
    version: row.version,
    createdAt: row.createdAt,
  };
}

function cursor(value: string | undefined): { time: string | null; id: string | null } {
  if (!value) return { time: null, id: null };
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== 'string' ||
      typeof decoded[1] !== 'string'
    )
      throw new Error();
    if (new Date(decoded[0]).toISOString() !== decoded[0]) throw new Error();
    return { time: decoded[0], id: uuid(decoded[1]) };
  } catch {
    throw new HttpException({ code: 'VALIDATION_FAILED' }, 422);
  }
}

function paged(items: Record<string, unknown>[], limit: number, timeKey: string) {
  const selected = items.slice(0, limit);
  const last = selected.at(-1);
  const nextCursor =
    items.length > limit && last && typeof last[timeKey] === 'string' && typeof last.id === 'string'
      ? Buffer.from(JSON.stringify([last[timeKey], last.id])).toString('base64url')
      : null;
  return { items: selected, nextCursor };
}

function adminCursor(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return uuid(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new HttpException({ code: 'VALIDATION_FAILED' }, 422);
  }
}

@Injectable()
export class AiService {
  constructor(
    private readonly repository: AiRepository,
    private readonly storage: AiStorage,
    private readonly ledger: LedgerService,
    private readonly planning: PlanningService,
    private readonly tracking: TrackingService,
    private readonly financialTools: AssistantFinancialTools,
    private readonly config: PlatformConfigService,
  ) {}

  async createVoiceSession(principal: ClerkPrincipal, body: unknown, key: unknown, contract = '2') {
    const started = performance.now();
    await this.available('voice_transcription');
    if (!['2', '3'].includes(contract))
      throw new HttpException({ code: 'VOICE_CLIENT_UPGRADE_REQUIRED' }, 410);
    const input = createVoiceV2(body);
    const result = resource(
      contract === '2' && this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY')
        ? await this.repository.createVoiceReviewSession(
            principal,
            input,
            idempotencyKey(key),
            this.config.getRequired('MASARIFI_AI_SIGNED_UPLOAD_SECONDS'),
          )
        : await this.repository.createVoiceSession(
            principal,
            input,
            idempotencyKey(key),
            this.config.getRequired('MASARIFI_AI_SIGNED_UPLOAD_SECONDS'),
            contract === '3'
              ? {
                  maxAuthAge: this.config.getRequired('MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS'),
                  thresholds: this.config.get('MASARIFI_LEDGER_RECENT_AUTH_THRESHOLDS') ?? {},
                  ...(this.config.get('MASARIFI_VOICE_ANALYSIS_ONLY')
                    ? { analysisOnly: true }
                    : {}),
                }
              : undefined,
          ),
    );
    const session = resource(result.resource);
    if (typeof session.id !== 'string' || typeof session.uploadDeadline !== 'string')
      throw new HttpException({ code: 'AI_UNAVAILABLE' }, 503);
    recordAiResult('voice_session_create', 'success', performance.now() - started);
    return {
      session: publicVoiceSession(session),
      upload: {
        method: 'PUT',
        path: '/api/v1/voice/sessions/' + session.id + '/audio',
        expiresAt: session.uploadDeadline,
      },
    };
  }

  async processVoiceSession(
    principal: ClerkPrincipal,
    sessionId: string,
    body: unknown,
    key: unknown,
  ) {
    await this.available('voice_transcription');
    const input = processVoice(body);
    await this.repository.processVoiceSession(
      principal,
      uuid(sessionId),
      input,
      idempotencyKey(key),
    );
    return { id: sessionId, status: 'queued' };
  }

  getVoiceBatchResult(principal: ClerkPrincipal, sessionId: string, accept?: string) {
    return this.repository.getVoiceBatchResult(
      principal,
      uuid(sessionId),
      wantsVoiceEventResults(accept),
    );
  }
  listVoiceBatchRecovery(
    principal: ClerkPrincipal,
    after?: string,
    afterId?: string,
    accept?: string,
  ) {
    if (
      (after && !afterId) ||
      (!after && afterId) ||
      (after && !Number.isFinite(Date.parse(after)))
    )
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 422);
    return this.repository.listVoiceBatchRecovery(
      principal,
      after ?? null,
      afterId ? uuid(afterId) : null,
      100,
      wantsVoiceEventResults(accept),
    );
  }

  async getVoiceSession(principal: ClerkPrincipal, sessionId: string) {
    let row = resource(await this.repository.getVoiceSession(principal, uuid(sessionId)));
    if (row.contractVersion === 3)
      return this.repository.getVoiceBatchResult(principal, uuid(sessionId));
    if (
      Date.parse(String(row.expiresAt)) <= Date.now() &&
      !['confirmed', 'expired', 'failed'].includes(String(row.status))
    ) {
      row = resource((await this.repository.getVoiceRecovery(principal, uuid(sessionId))).session);
    }
    return publicVoiceSession(row);
  }

  async uploadVoiceAudio(principal: ClerkPrincipal, sessionId: string, request: Request) {
    const id = uuid(sessionId);
    const upload = await this.repository.beginVoiceUpload(principal, id);
    const token = typeof upload.uploadToken === 'string' ? upload.uploadToken : null;
    const timer = setTimeout(
      () => request.destroy(),
      Math.min(30_000, this.config.getRequired('MASARIFI_REQUEST_TIMEOUT_MS')),
    );
    try {
      if (
        request.headers['content-type'] !== upload.contentType ||
        Number(request.headers['content-length']) !== Number(upload.sizeBytes)
      )
        throw new HttpException({ code: 'VOICE_MEDIA_INVALID' }, 422);
      const chunks: Buffer[] = [];
      const hash = createHash('sha256');
      let size = 0;
      for await (const part of request) {
        if (!Buffer.isBuffer(part)) throw new HttpException({ code: 'VOICE_MEDIA_INVALID' }, 422);
        size += part.length;
        if (size > Number(upload.sizeBytes) || size > 12_582_912)
          throw new HttpException({ code: 'VOICE_MEDIA_INVALID' }, 413);
        hash.update(part);
        chunks.push(part);
      }
      const digest = hash.digest('hex');
      if (size !== Number(upload.sizeBytes) || digest !== upload.contentHash)
        throw new HttpException({ code: 'VOICE_MEDIA_INVALID' }, 422);
      if (upload.completed === true)
        return { id, version: upload.version, contentHash: digest, sizeBytes: size };
      if (!token) throw new HttpException({ code: 'VOICE_UPLOAD_IN_PROGRESS' }, 409);
      try {
        await this.storage.upload(
          String(upload.storageRef),
          Buffer.concat(chunks, size),
          String(upload.contentType),
        );
      } catch (error) {
        // A lost Storage acknowledgement can leave the immutable object behind.
        const existing = await this.storage
          .download(String(upload.storageRef), size)
          .catch(() => null);
        if (!existing || createHash('sha256').update(existing).digest('hex') !== digest)
          throw error;
      }
      // Unknown SQL acknowledgement must preserve accepted media. Cancellation/expiry purge owns deletion.
      return await this.repository.finishVoiceUpload(principal, id, token, digest);
    } finally {
      clearTimeout(timer);
      if (token)
        await this.repository.releaseVoiceUpload(principal, id, token).catch(() => undefined);
    }
  }

  async cancelVoiceSession(principal: ClerkPrincipal, sessionId: string, key: unknown) {
    return resultResource(
      await this.repository.cancelVoiceSession(principal, uuid(sessionId), idempotencyKey(key)),
    );
  }

  async getVoiceRecovery(principal: ClerkPrincipal, sessionId: string) {
    const row = await this.repository.getVoiceRecovery(principal, uuid(sessionId));
    if (row.contractVersion === 3) {
      return {
        sessionId: row.sessionId,
        batchId: row.batchId,
        status: row.status,
        transactionIds: row.transactionIds,
        addedCount: row.addedCount,
        ledgerVersion: row.ledgerVersion,
        ...(row.analysis ? { analysis: row.analysis } : {}),
      };
    }
    return {
      phase: row.phase,
      session: publicVoiceSession(resource(row.session)),
      proposal: row.proposalId ? await this.getVoiceProposal(principal, sessionId) : null,
      recordedAt: row.recordedAt,
      timezoneOffsetMinutes: row.timezoneOffsetMinutes,
      captureContextLegacy: row.captureContextLegacy,
      transcriptLanguage: row.transcriptLanguage ?? null,
      transcriptConfidence: row.transcriptConfidence ?? null,
      transactionId: row.transactionId ?? null,
    };
  }

  async getVoiceProposal(principal: ClerkPrincipal, sessionId: string) {
    const row = resource(await this.repository.getVoiceProposal(principal, uuid(sessionId)));
    return {
      id: row.id,
      redactedTranscript: row.redactedTranscript,
      schemaVersion: row.schemaVersion,
      type: row.proposalType,
      payload: row.payload,
      fields: Array.isArray(row.fields)
        ? row.fields.map((field) => {
            const item = resource(field);
            return {
              name: item.fieldName,
              value: item.valueJson,
              confidence: item.confidence,
              sourceSpan: item.sourceSpan ?? null,
            };
          })
        : [],
      status: row.status,
      expiresAt: row.expiresAt,
      confirmedAt: row.confirmedAt ?? null,
      executedTransactionId: row.executedTransactionId ?? null,
      version: row.version,
    };
  }

  listVoicePreferences(principal: ClerkPrincipal) {
    return this.repository.listVoicePreferences(principal);
  }
  async upsertVoicePreference(principal: ClerkPrincipal, body: unknown, key: unknown) {
    return resultResource(
      await this.repository.upsertVoicePreference(
        principal,
        voicePreference(body),
        idempotencyKey(key),
      ),
    );
  }
  deleteVoicePreference(principal: ClerkPrincipal, id: string, version: unknown, key: unknown) {
    return this.repository.deleteVoicePreference(
      principal,
      uuid(id),
      positiveVersion(Number(version)),
      idempotencyKey(key),
    );
  }

  async confirmVoice(principal: ClerkPrincipal, proposalId: string, body: unknown, key: unknown) {
    const id = uuid(proposalId);
    const operationId = this.repository.operationId(
      principal,
      `ai.action.confirm:${id}`,
      idempotencyKey(key),
    );
    const decision = voiceDecision(body, operationId);
    const claim = resource(
      await this.repository.claimVoiceAction(principal, id, operationId, decision),
    );
    if (claim.inProgress === true)
      throw new HttpException({ code: 'VOICE_CONFIRMATION_IN_PROGRESS' }, 409);
    if (claim.replayed === true)
      return {
        sourceId: id,
        actionType: 'transaction.create',
        resourceId: claim.resourceId,
        status: 'executed',
        replayed: true,
      };
    let result: unknown;
    try {
      result = await this.ledger.createTransaction({
        principal,
        idempotencyKey: String(claim.ledgerKey),
        requestId: operationId,
        body: claim.command,
      });
    } catch (error) {
      // Only a definitive local validation failure can release an authorization.
      if (
        error instanceof HttpException &&
        error.getStatus() >= 400 &&
        error.getStatus() < 500 &&
        ![408, 409, 429].includes(error.getStatus())
      ) {
        await this.repository.abandonVoiceAction(principal, id, String(claim.decisionToken));
      }
      throw error;
    }
    const idResult = resourceId(result);
    try {
      await this.repository.completeVoiceAction(
        principal,
        id,
        String(claim.decisionToken),
        idResult,
      );
    } catch {
      /* Ledger receipt is authoritative; an identical retry repairs Voice bookkeeping. */
    }
    return {
      sourceId: id,
      actionType: 'transaction.create',
      resourceId: idResult,
      status: 'executed',
      replayed: false,
    };
  }

  async reject(principal: ClerkPrincipal, id: string, body: unknown, key: unknown) {
    const input = actionDecision(body, false);
    return resultResource(
      await this.repository.rejectAction(
        principal,
        uuid(id),
        input.expectedVersion,
        input.reason,
        idempotencyKey(key),
      ),
    );
  }

  getConsent(principal: ClerkPrincipal) {
    return this.repository.getConsent(principal, CONSENT_POLICY);
  }
  async grantConsent(principal: ClerkPrincipal, body: unknown, key: unknown) {
    const input = consent(body);
    if (input.policyVersion !== CONSENT_POLICY)
      throw new HttpException({ code: 'AI_CONSENT_POLICY_STALE' }, 409);
    return resultResource(
      await this.repository.setConsent(
        principal,
        input.policyVersion,
        true,
        input.expectedVersion,
        idempotencyKey(key),
      ),
    );
  }
  async revokeConsent(principal: ClerkPrincipal, version: unknown, key: unknown) {
    return resultResource(
      await this.repository.setConsent(
        principal,
        CONSENT_POLICY,
        false,
        positiveVersion(Number(version)),
        idempotencyKey(key),
      ),
    );
  }

  async createConversation(principal: ClerkPrincipal, body: unknown, key: unknown) {
    const title = conversationCreate(body).title;
    return resultResource(
      await this.repository.createConversation(
        principal,
        title === null ? null : redactAiText(title),
        idempotencyKey(key),
      ),
    );
  }

  async getAssistantAvailability(principal: ClerkPrincipal) {
    const quota = await this.repository.getAssistantAvailability(principal, CONSENT_POLICY);
    const consent = await this.repository.getConsent(principal, CONSENT_POLICY);
    const admitted =
      this.config.getRequired('MASARIFI_AI_PROVIDER_ENABLED') &&
      (await this.repository.workloadAvailable('financial_assistant'));
    return {
      ...quota,
      schemaVersion: 1,
      checkedAt: new Date().toISOString(),
      capabilities: {
        directRead: consent.granted === true ? 'available' : 'disabled',
        provider:
          !admitted || consent.granted !== true
            ? 'disabled'
            : quota.remaining === 0
              ? 'limit_reached'
              : 'unknown',
        actions: 'unknown',
      },
      worker: { status: 'unknown', lastSeenAt: null },
      reasons: admitted
        ? ['assistant_worker_telemetry_missing']
        : ['provider_admission_disabled', 'assistant_worker_telemetry_missing'],
    };
  }
  listInsights(principal: ClerkPrincipal) {
    return this.repository.listInsights(principal, 10).then((items) => ({ items }));
  }
  getConversation(principal: ClerkPrincipal, id: string) {
    return this.repository.getConversation(principal, uuid(id));
  }
  async updateConversation(principal: ClerkPrincipal, id: string, body: unknown, key: unknown) {
    return resultResource(
      await this.repository.updateConversation(
        principal,
        uuid(id),
        conversationUpdate(body),
        idempotencyKey(key),
      ),
    );
  }
  deleteConversation(principal: ClerkPrincipal, id: string, version: unknown, key: unknown) {
    return this.repository.updateConversation(
      principal,
      uuid(id),
      { expectedVersion: positiveVersion(Number(version)), status: 'deleted' },
      idempotencyKey(key),
    );
  }

  async listConversations(principal: ClerkPrincipal, query: unknown) {
    const input = page(query),
      limit = Math.min(input.limit, 99),
      rows = await this.repository.listConversations(principal, cursor(input.cursor), limit + 1);
    return paged(rows, limit, 'lastMessageAt');
  }

  async createMessage(
    principal: ClerkPrincipal,
    conversationId: string,
    body: unknown,
    key: unknown,
  ) {
    const input = assistantMessage(body);
    const conversationIdValue = uuid(conversationId);
    let route = routeAssistantMessage({ content: input.content, intentHint: input.intent });
    let history: Array<{ role: 'user' | 'assistant'; content: string; intent: string | null }> = [];
    const followUp = /^(?:what about|and |how about|وماذا عن|طيب|طب|وماذا|والشهر)/iu.test(
      input.content.trim(),
    );
    if ((route.execution === 'provider' && route.intent !== 'general_finance') || followUp) {
      history = selectConversationHistory(
        await this.repository.recentConversationTurns(principal, conversationIdValue, 4),
      );
      route = routeAssistantMessage({
        content: input.content,
        intentHint: input.intent,
        recentTurns: history,
      });
    }
    const contextScope = input.contextScopeProvided
      ? route.contextScopes.filter((scope) => input.contextScope.includes(scope))
      : [...route.contextScopes];
    const redactedContent = redactAiText(input.content);
    const keyValue = idempotencyKey(key);
    if (route.intent === 'unrelated' || route.intent === 'unsupported') {
      return this.accepted(
        await this.repository.saveDeterministicMessage(
          principal,
          conversationIdValue,
          {
            content: redactedContent,
            intent: route.intent,
            answer: this.redirect(input.content, route.intent),
            context: {},
            contextScope,
            evidence: [],
            responseMode: input.responseMode,
            requestIdentity: input,
          },
          keyValue,
        ),
      );
    }
    const truth = await this.financialTools.resolve(
      principal,
      route.intent,
      input.content,
      keyValue,
      contextScope,
      ...(followUp ? [history.filter((turn) => turn.role === 'user').at(-1)?.content] : []),
    );
    const evidence = truth.evidence.map((item, index) => ({
      ...item,
      alias: `EVIDENCE-${(index + 1).toString()}`,
    }));
    if (route.execution === 'deterministic' || truth.answer !== null) {
      return this.accepted(
        await this.repository.saveDeterministicMessage(
          principal,
          conversationIdValue,
          {
            content: redactedContent,
            intent: route.intent,
            answer: truth.answer,
            context: truth.context,
            contextScope,
            evidence,
            responseMode: input.responseMode,
            requestIdentity: input,
          },
          keyValue,
        ),
      );
    }
    await this.available('financial_assistant');
    const result = resource(
      await this.repository.enqueueMessage(
        principal,
        conversationIdValue,
        {
          content: redactedContent,
          intent: route.intent,
          context: truth.context,
          contextScope,
          evidence,
          history: history.map(({ role, content }) => ({ role, content: redactAiText(content) })),
          responseMode: input.responseMode,
          requestIdentity: input,
        },
        keyValue,
      ),
    );
    return this.accepted(result);
  }

  async listMessages(principal: ClerkPrincipal, conversationId: string, query: unknown) {
    const input = page(query),
      limit = Math.min(input.limit, 99),
      rows = await this.repository.listMessages(
        principal,
        uuid(conversationId),
        cursor(input.cursor),
        limit + 1,
      );
    const normalized = rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      replyToMessageId: row.replyToMessageId ?? null,
      role: row.role,
      content: row.contentRedacted,
      status: row.workStatus ?? null,
      failureCode: row.failureCode ?? null,
      snapshot: row.snapshot ?? null,
      preview: row.preview ?? null,
      createdAt: row.createdAt,
      metadata: resource(row.contextPayload).assistantMetadata ?? null,
      actionTimezone:
        typeof resource(row.contextPayload).timezone === 'string'
          ? resource(row.contextPayload).timezone
          : null,
    }));
    return paged(normalized, limit, 'createdAt');
  }

  async getMessage(principal: ClerkPrincipal, conversationId: string, messageId: string) {
    const row = await this.repository.getMessage(principal, uuid(messageId));
    if (row.conversationId !== uuid(conversationId))
      throw new HttpException({ code: 'AI_MESSAGE_NOT_FOUND' }, 404);
    return this.publicMessage(row);
  }

  getMessageAcceptance(principal: ClerkPrincipal, conversationId: string, key: unknown) {
    return this.repository.messageAcceptance(principal, uuid(conversationId), idempotencyKey(key));
  }

  async getMessageResult(principal: ClerkPrincipal, conversationId: string, messageId: string) {
    const request = await this.repository.getMessage(principal, uuid(messageId));
    if (request.conversationId !== uuid(conversationId) || request.role !== 'user')
      throw new HttpException({ code: 'AI_MESSAGE_NOT_FOUND' }, 404);
    const result = resource(await this.repository.messageResult(principal, messageId));
    let response: Record<string, unknown> | null = null;
    if (result.response) {
      const row = await this.repository.getMessage(principal, String(resource(result.response).id));
      if (
        row.conversationId !== conversationId ||
        row.replyToMessageId !== messageId ||
        row.role !== 'assistant'
      )
        throw new HttpException({ code: 'AI_MESSAGE_NOT_FOUND' }, 404);
      response = this.publicMessage(row);
    }
    return {
      id: messageId,
      conversationId,
      status: result.status,
      failureCode: result.failureCode ?? null,
      request: this.publicMessage(request),
      response,
    };
  }

  private publicMessage(row: Record<string, unknown>) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      replyToMessageId: row.replyToMessageId ?? null,
      role: row.role,
      content: row.contentRedacted,
      status: row.workStatus ?? null,
      failureCode: row.failureCode ?? null,
      snapshot: row.snapshot ?? null,
      preview: row.preview ?? null,
      createdAt: row.createdAt,
      metadata: resource(row.contextPayload).assistantMetadata ?? null,
      actionTimezone:
        typeof resource(row.contextPayload).timezone === 'string'
          ? resource(row.contextPayload).timezone
          : null,
    };
  }

  async *streamMessage(
    principal: ClerkPrincipal,
    messageId: string,
    signal: AbortSignal,
  ): AsyncIterable<{ event: string; data: Record<string, unknown> }> {
    const startedAt = Date.now();
    yield { event: 'meta', data: { messageId } };
    while (!signal.aborted && Date.now() - startedAt < STREAM_TIMEOUT_MS) {
      const result = resource(await this.repository.messageResult(principal, uuid(messageId)));
      if (result.status === 'completed') {
        const response = resource(result.response);
        yield { event: 'delta', data: { content: response.content ?? '' } };
        if (result.preview) yield { event: 'preview', data: resource(result.preview) };
        yield { event: 'done', data: { messageId: response.id ?? messageId } };
        return;
      }
      if (result.status === 'failed' || result.status === 'cancelled') {
        yield { event: 'error', data: { code: result.failureCode ?? 'AI_UNAVAILABLE' } };
        return;
      }
      await abortableDelay(100, signal);
    }
    await this.repository.cancelMessage(principal, uuid(messageId));
    if (!signal.aborted) yield { event: 'error', data: { code: 'AI_STREAM_TIMEOUT' } };
  }

  confirmPreview(principal: ClerkPrincipal, previewId: string, body: unknown, key: unknown) {
    return this.confirm(
      principal,
      uuid(previewId),
      actionDecision(body, false),
      idempotencyKey(key),
    );
  }
  async putFeedback(principal: ClerkPrincipal, messageId: string, body: unknown, key: unknown) {
    const input = feedback(body);
    return resultResource(
      await this.repository.feedback(
        principal,
        uuid(messageId),
        input.rating,
        input.reason,
        idempotencyKey(key),
      ),
    );
  }
  async reportResponse(principal: ClerkPrincipal, messageId: string, body: unknown, key: unknown) {
    const input = responseReport(body);
    return resultResource(
      await this.repository.report(
        principal,
        uuid(messageId),
        input.reportType,
        input.reason,
        idempotencyKey(key),
      ),
    );
  }

  async adminProbe() {
    return {
      status:
        this.config.getRequired('MASARIFI_AI_PROVIDER_ENABLED') &&
        (await this.repository.workloadAvailable('financial_assistant'))
          ? 'available'
          : 'unavailable',
    };
  }
  async adminList(principal: ClerkPrincipal, resourceName: string, query: unknown) {
    const input = page(query),
      rows = await this.repository.adminReadPage(
        principal,
        resourceName,
        adminCursor(input.cursor),
        input.limit + 1,
      );
    const items = rows.slice(0, input.limit),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > input.limit && typeof last?.id === 'string'
          ? Buffer.from(last.id).toString('base64url')
          : null,
    };
  }
  async adminGet(principal: ClerkPrincipal, resourceName: string, id: string) {
    const rows = await this.repository.adminRead(principal, resourceName, uuid(id), 1);
    if (!rows[0]) throw new HttpException({ code: 'NOT_FOUND' }, 404);
    return rows[0];
  }
  async adminMutate(
    principal: ClerkPrincipal,
    resourceName: string,
    id: string | null,
    body: unknown,
    key: unknown,
    requestId: string,
  ) {
    const input =
      id === null
        ? adminCreate(
            body,
            resourceName === 'prompts'
              ? ['workload', 'template', 'schemaVersion']
              : ['key', 'workload', 'ruleType', 'configuration', 'enabled'],
          )
        : adminMutation(body);
    const result = resource(
      await this.repository.adminMutate(
        principal,
        resourceName,
        id === null ? null : uuid(id),
        input,
        idempotencyKey(key),
        requestId,
      ),
    );
    return result.resource;
  }
  async testPrompt(
    principal: ClerkPrincipal,
    id: string,
    body: unknown,
    key: unknown,
    requestId: string,
  ) {
    const input = adminMutation(body),
      result = resource(
        await this.repository.testPrompt(
          principal,
          uuid(id),
          input,
          idempotencyKey(key),
          requestId,
        ),
      );
    const item = resource(result.resource);
    return { id: item.id, status: item.status ?? 'queued' };
  }
  async publishPrompt(
    principal: ClerkPrincipal,
    id: string,
    body: unknown,
    key: unknown,
    requestId: string,
  ) {
    const input = adminMutation(body);
    const result = resource(
      await this.repository.publishPrompt(
        principal,
        uuid(id),
        input,
        idempotencyKey(key),
        requestId,
      ),
    );
    return result.resource;
  }

  private async confirm(
    principal: ClerkPrincipal,
    id: string,
    decision: { expectedVersion: number; editedFields?: Record<string, unknown> },
    _key: string,
  ) {
    const operationId = this.repository.operationId(principal, `ai.action.confirm:${id}`, _key);
    const claim = resource(
      await this.repository.claimAction(
        principal,
        id,
        decision.expectedVersion,
        operationId,
        decision.editedFields,
      ),
    );
    if (claim.replayed === true)
      return {
        sourceId: id,
        actionType: claim.actionType,
        resourceId: claim.resourceId,
        status: 'executed',
        replayed: true,
      };
    const payload = resource(claim.payload),
      actionType = typeof claim.actionType === 'string' ? claim.actionType : '';
    const domainKey = `ai-action:${id}:v${decision.expectedVersion.toString()}`;
    const timezone =
      actionType === 'transaction.create'
        ? await this.repository.getPreviewTimezone(principal, id)
        : undefined;
    const result = await this.execute(
      actionType,
      payload,
      principal,
      domainKey,
      operationId,
      timezone,
    );
    const idResult = resourceId(result);
    await this.repository.completeAction(principal, id, String(claim.decisionToken), idResult);
    return { sourceId: id, actionType, resourceId: idResult, status: 'executed', replayed: false };
  }

  private async execute(
    action: string,
    payload: Record<string, unknown>,
    principal: ClerkPrincipal,
    key: string,
    requestId: string,
    timezone?: string,
  ): Promise<unknown> {
    if (action === 'transaction.create') {
      const amount = Number(payload.amountMinor);
      if (!timezone) throw new HttpException({ code: 'AI_EVIDENCE_INCOMPLETE' }, 409);
      return this.ledger.createTransaction({
        principal,
        idempotencyKey: key,
        requestId,
        body: {
          kind: amount < 0 ? 'income' : 'expense',
          amountMinor: Math.abs(amount),
          currency: payload.currency,
          accountId: payload.accountId,
          categoryId: payload.categoryId ?? null,
          title: payload.merchant ?? 'Assistant transaction',
          merchant: payload.merchant ?? null,
          paymentMethod: null,
          note: payload.note ?? null,
          occurredAt: zonedDateTimeToInstant(String(payload.date), '12:00', timezone).toISOString(),
          source: 'platform_assisted',
          externalRef: `assistant:${requestId}`,
        },
      });
    }
    if (action === 'transaction.update') {
      const { transactionId, ...body } = payload;
      return this.ledger.reviseTransaction({
        principal,
        transactionId: uuid(transactionId),
        body,
        idempotencyKey: key,
        requestId,
      });
    }
    if (action === 'budget.update') {
      const { budgetId, ...body } = payload;
      return this.planning.updateBudget(uuid(budgetId), {
        principal,
        body,
        idempotencyKey: key,
        requestId,
      });
    }
    if (action === 'savings_goal.create')
      return this.planning.createSavingsGoal({
        principal,
        body: payload,
        idempotencyKey: key,
        requestId,
      });
    if (action === 'obligation.payment.record') {
      const { obligationId, ...body } = payload;
      return this.planning.allocateObligationPayment(uuid(obligationId), {
        principal,
        body,
        idempotencyKey: key,
        requestId,
      });
    }
    if (action === 'tracking.review.resolve') {
      const { reviewId, ...body } = payload;
      return this.tracking.decideReview(uuid(reviewId), {
        principal,
        body,
        idempotencyKey: key,
        requestId,
      });
    }
    throw new HttpException({ code: 'AI_ACTION_NOT_ALLOWED' }, 422);
  }

  private async available(workload: string): Promise<void> {
    if (
      !this.config.getRequired('MASARIFI_AI_PROVIDER_ENABLED') ||
      !(await this.repository.workloadAvailable(workload))
    )
      throw new HttpException({ code: 'AI_UNAVAILABLE' }, 503);
  }

  private accepted(value: unknown) {
    const result = resource(value);
    const message = resource(result.resource);
    return {
      id: message.id,
      status: message.workStatus ?? 'queued',
      replayed: result.replayed === true,
    };
  }

  private redirect(content: string, intent: 'unrelated' | 'unsupported'): string {
    const arabic = /[\u0600-\u06ff]/u.test(content);
    if (intent === 'unsupported')
      return arabic
        ? 'ما قدرت أحدد طلبًا ماليًا مدعومًا. اسألني عن مصاريفك أو ميزانيتك أو ادخارك أو التزاماتك.'
        : 'I could not identify a supported financial request. Ask about spending, budgets, savings, or obligations.';
    return arabic
      ? 'أنا متخصص في مساعدتك في مصاريفك وميزانيتك وادخارك والتزاماتك وقراراتك المالية.'
      : "I'm focused on helping with your spending, budgets, savings, obligations, and financial decisions.";
  }
}
