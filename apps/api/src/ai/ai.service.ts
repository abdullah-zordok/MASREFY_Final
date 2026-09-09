import { HttpException, Injectable } from '@nestjs/common';

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
  createVoice,
  feedback,
  idempotencyKey,
  page,
  positiveVersion,
  processVoice,
  responseReport,
  uuid,
  voicePreference,
} from './ai.dto';
import { recordAiResult } from './ai.observability';
import { AiRepository } from './ai.repository';
import { redactAiText } from './ai.schemas';
import { AiStorage } from './ai.storage';

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
    private readonly config: PlatformConfigService,
  ) {}

  async createVoiceSession(principal: ClerkPrincipal, body: unknown, key: unknown) {
    const started = performance.now();
    const input = createVoice(body);
    await this.available('voice_transcription');
    const result = resource(
      await this.repository.createVoiceSession(principal, input, idempotencyKey(key)),
    );
    const session = resource(result.resource);
    if (typeof session.storageRef !== 'string')
      throw new HttpException({ code: 'AI_UNAVAILABLE' }, 503);
    const storageRef = session.storageRef;
    const upload = await this.storage.signedUpload(
      storageRef,
      this.config.getRequired('MASARIFI_AI_SIGNED_UPLOAD_SECONDS'),
      input.contentType,
    );
    Reflect.deleteProperty(session, 'storageRef');
    Reflect.deleteProperty(session, 'contentType');
    Reflect.deleteProperty(session, 'sizeBytes');
    recordAiResult('voice_session_create', 'success', performance.now() - started);
    return { session, upload };
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

  getVoiceSession(principal: ClerkPrincipal, sessionId: string) {
    return this.repository.getVoiceSession(principal, uuid(sessionId));
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

  confirmVoice(principal: ClerkPrincipal, proposalId: string, body: unknown, key: unknown) {
    return this.confirm(
      principal,
      uuid(proposalId),
      actionDecision(body, true),
      idempotencyKey(key),
    );
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

  getAssistantAvailability(principal: ClerkPrincipal) {
    return this.repository.getAssistantAvailability(principal, CONSENT_POLICY);
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
      rows = await this.repository.listConversations(
        principal,
        cursor(input.cursor),
        input.limit + 1,
      );
    return paged(rows, input.limit, 'lastMessageAt');
  }

  async createMessage(
    principal: ClerkPrincipal,
    conversationId: string,
    body: unknown,
    key: unknown,
  ) {
    await this.available('financial_assistant');
    const input = assistantMessage(body);
    const result = resource(
      await this.repository.enqueueMessage(
        principal,
        uuid(conversationId),
        { ...input, content: redactAiText(input.content) },
        idempotencyKey(key),
      ),
    );
    const message = resource(result.resource);
    return {
      id: message.id,
      status: message.workStatus ?? 'queued',
      replayed: result.replayed === true,
    };
  }

  async listMessages(principal: ClerkPrincipal, conversationId: string, query: unknown) {
    const input = page(query),
      rows = await this.repository.listMessages(
        principal,
        uuid(conversationId),
        cursor(input.cursor),
        input.limit + 1,
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
    }));
    return paged(normalized, input.limit, 'createdAt');
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
    const result = await this.execute(actionType, payload, principal, domainKey, operationId);
    const idResult = resourceId(result);
    await this.repository.completeAction(principal, id, String(claim.decisionToken), idResult);
    return { sourceId: id, actionType, resourceId: idResult, status: 'executed', replayed: false };
  }

  private execute(
    action: string,
    payload: Record<string, unknown>,
    principal: ClerkPrincipal,
    key: string,
    requestId: string,
  ): Promise<unknown> {
    if (action === 'transaction.create') {
      const amount = Number(payload.amountMinor);
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
          title: payload.merchant ?? 'Voice transaction',
          merchant: payload.merchant ?? null,
          paymentMethod: null,
          note: payload.note ?? null,
          occurredAt: `${String(payload.date)}T12:00:00.000Z`,
          source: 'voice',
          externalRef: `voice:${requestId}`,
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
}
