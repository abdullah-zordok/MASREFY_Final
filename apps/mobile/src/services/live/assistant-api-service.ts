import { z } from 'zod';
import type {
  AssistantActionPreview,
  AssistantConsent,
  AssistantConversation,
  AssistantResponse
} from '@/domain/assistant';
import { createImmutableSnapshot } from '@/domain/assistant';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import {
  assistantServiceCapability,
  type AssistantService
} from '@/services/contracts/assistant-notifications-service';

type TokenProvider = () => Promise<string>;
let tokenProvider: TokenProvider = () =>
  Promise.reject(new Error('assistant_unavailable'));
let tokenProviderConfigured = false;

export function configureAssistantApiTokenProvider(
  provider: TokenProvider
): void {
  tokenProvider = provider;
  tokenProviderConfigured = true;
}

class AssistantApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const dateTime = z.string().datetime({ offset: true });
const conversationSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120),
    status: z.literal('active'),
    lastMessageAt: dateTime,
    version: z.number().int().positive(),
    createdAt: dateTime
  })
  .strict();
const evidenceSchema = z
  .object({
    kind: z.enum(['transaction', 'budget', 'obligation', 'goal', 'report']),
    alias: z.string().min(1),
    version: z.number().int().nonnegative()
  })
  .strict();
const snapshotSchema = z
  .object({
    id: z.string().uuid(),
    schemaVersion: z.literal(1),
    evidenceRefs: z.array(evidenceSchema),
    model: z.string().min(1),
    provider: z.string().min(1),
    createdAt: dateTime
  })
  .strict();
const previewSchema = z
  .object({
    id: z.string().uuid(),
    messageId: z.string().uuid(),
    schemaVersion: z.literal(1),
    actionType: z.string().min(1),
    payload: z.record(z.unknown()),
    status: z.enum([
      'draft',
      'validated',
      'confirmed',
      'executed',
      'rejected',
      'expired'
    ]),
    expiresAt: dateTime.nullable(),
    confirmedAt: dateTime.nullable(),
    executedResourceId: z.string().uuid().nullable(),
    confirmationOperationId: z.string().min(1).nullable(),
    createdAt: dateTime,
    updatedAt: dateTime,
    version: z.number().int().positive()
  })
  .strict();
const messageSchema = z
  .object({
    id: z.string().uuid(),
    conversationId: z.string().uuid(),
    replyToMessageId: z.string().uuid().nullable(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    status: z.string().nullable(),
    failureCode: z.string().nullable(),
    snapshot: snapshotSchema.nullable(),
    preview: previewSchema.nullable(),
    createdAt: dateTime
  })
  .strict();
const consentSchema = z
  .object({
    policyVersion: z.string(),
    granted: z.boolean(),
    grantedAt: dateTime.nullable(),
    revokedAt: dateTime.nullable(),
    version: z.number().int().positive()
  })
  .strict();
const page = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({ items: z.array(item), nextCursor: z.string().nullable() })
    .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AssistantApiError('representative_failure');
  return result.data;
}

function epoch(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result))
    throw new AssistantApiError('representative_failure');
  return result;
}

function mutation<T>(value: T, affectedScopes: readonly string[]) {
  return { value, affectedScopes };
}

function mapConversation(value: unknown): AssistantConversation {
  const row = parse(conversationSchema, value);
  return {
    id: row.id,
    title: row.title,
    status: 'active',
    createdAt: epoch(row.createdAt),
    updatedAt: epoch(row.lastMessageAt),
    lastResponseId: null,
    version: row.version
  };
}

function mapConsent(value: unknown): AssistantConsent {
  const row = parse(consentSchema, value);
  return {
    status: row.granted
      ? 'enabled'
      : row.revokedAt
        ? 'disabled'
        : 'not_requested',
    disclosedDataCategories: ['transactions', 'planning', 'reports'],
    consentedAt: row.grantedAt ? epoch(row.grantedAt) : null,
    disabledAt: row.revokedAt ? epoch(row.revokedAt) : null,
    version: row.version
  };
}

function amount(value: unknown): number {
  const result =
    typeof value === 'string' && /^-?\d+$/u.test(value) ? Number(value) : value;
  if (typeof result !== 'number' || !Number.isSafeInteger(result))
    throw new AssistantApiError('representative_failure');
  return result;
}

function mapPreview(
  value: unknown,
  responseId: string,
  evidence: readonly z.infer<typeof evidenceSchema>[]
): AssistantActionPreview {
  const row = parse(previewSchema, value);
  if (row.messageId !== responseId)
    throw new AssistantApiError('representative_failure');
  if (row.actionType !== 'savings_goal.create')
    throw new AssistantApiError('assistant_disabled');
  const currency = row.payload.currencyCode ?? row.payload.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/u.test(currency))
    throw new AssistantApiError('representative_failure');
  const states: Record<typeof row.status, AssistantActionPreview['status']> = {
    draft: 'draft',
    validated: 'ready',
    confirmed: 'confirming',
    executed: 'succeeded',
    rejected: 'cancelled',
    expired: 'expired'
  };
  const status = states[row.status];
  if (status === 'confirming' && !row.confirmationOperationId)
    throw new AssistantApiError('representative_failure');
  if (
    status === 'succeeded' &&
    (!row.confirmationOperationId || !row.executedResourceId)
  )
    throw new AssistantApiError('representative_failure');
  return {
    id: row.id,
    responseId,
    kind: 'create_goal',
    input: {
      amountMinor: amount(row.payload.targetMinor ?? row.payload.amountMinor),
      currency
    },
    affectedDestination: { kind: 'goal', goalId: row.id },
    sourceVersions: evidence.map(({ alias: id, version }) => ({ id, version })),
    status,
    operationId: row.confirmationOperationId,
    expiresAt: row.expiresAt === null ? null : epoch(row.expiresAt),
    resultReference: row.executedResourceId,
    safeFailure: null,
    version: row.version
  };
}

export function createLiveAssistantApiService(
  options: {
    baseUrl?: string;
    token?: TokenProvider;
    request?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {}
): CapabilityProviderHandle<AssistantService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '';
  const token = options.token ?? (() => tokenProvider());
  const request = options.request ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const responseCache = new Map<string, AssistantResponse>();
  const previewCache = new Map<string, AssistantActionPreview>();

  const send = async (
    method: string,
    path: string,
    body?: unknown,
    key?: string
  ): Promise<unknown> => {
    if (!baseUrl) throw new AssistantApiError('assistant_disabled');
    let response: Response;
    try {
      response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(key ? { 'Idempotency-Key': key } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new AssistantApiError('offline');
    }
    let value: unknown = null;
    if (response.status !== 204) {
      try {
        value = await response.json();
      } catch {
        throw new AssistantApiError('representative_failure');
      }
    }
    if (!response.ok) {
      const ownerCode =
        value && typeof value === 'object' && 'code' in value
          ? Reflect.get(value, 'code')
          : null;
      const mapped =
        ownerCode === 'AI_CONSENT_REQUIRED' ||
        ownerCode === 'AI_CONSENT_POLICY_STALE'
          ? 'consent_required'
          : ownerCode === 'AI_QUOTA_EXCEEDED' ||
              ownerCode === 'AI_BUDGET_EXHAUSTED'
            ? 'limit_reached'
            : ownerCode === 'AI_ACTION_CONFLICT' ||
                ownerCode === 'AI_CONVERSATION_CONFLICT' ||
                response.status === 409
              ? 'conflict'
              : ownerCode === 'AI_UNAVAILABLE' ||
                  ownerCode === 'AI_TEMPORARILY_UNAVAILABLE' ||
                  response.status === 503
                ? 'assistant_disabled'
                : response.status === 404
                  ? 'not_found'
                  : 'representative_failure';
      throw new AssistantApiError(mapped);
    }
    return value;
  };

  const listMessages = async (id: string, cursor?: string) =>
    parse(
      page(messageSchema),
      await send(
        'GET',
        `/api/v1/assistant/conversations/${encodeURIComponent(id)}/messages?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      )
    );
  const listAllConversations = async () => {
    const items: AssistantConversation[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = parse(
        page(conversationSchema),
        await send(
          'GET',
          `/api/v1/assistant/conversations?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        )
      );
      items.push(...result.items.map(mapConversation));
      if (result.nextCursor === null) break;
      if (seen.has(result.nextCursor))
        throw new AssistantApiError('representative_failure');
      seen.add(result.nextCursor);
      cursor = result.nextCursor;
    } while (true);
    return items;
  };
  const listAllMessages = async (conversationId: string) => {
    const items: z.infer<typeof messageSchema>[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = await listMessages(conversationId, cursor);
      items.push(...result.items);
      if (result.nextCursor === null) break;
      if (seen.has(result.nextCursor))
        throw new AssistantApiError('representative_failure');
      seen.add(result.nextCursor);
      cursor = result.nextCursor;
    } while (true);
    return items;
  };
  const mapResponse = (
    row: z.infer<typeof messageSchema>,
    rows: readonly z.infer<typeof messageSchema>[]
  ): AssistantResponse => {
    if (
      row.role !== 'assistant' ||
      row.status !== 'completed' ||
      !row.replyToMessageId ||
      !row.snapshot ||
      !row.content
    )
      throw new AssistantApiError('representative_failure');
    const question = rows.find(
      (item) => item.id === row.replyToMessageId && item.role === 'user'
    );
    if (!question?.content)
      throw new AssistantApiError('representative_failure');
    const mapped: AssistantResponse = {
      id: row.id,
      conversationId: row.conversationId,
      question: question.content,
      responseType: 'direct',
      blocks: [{ label: 'fact', key: row.content, values: {} }],
      period: null,
      dataAsOf: epoch(row.snapshot.createdAt),
      snapshot: createImmutableSnapshot({
        sources: row.snapshot.evidenceRefs.map(
          ({ kind, alias: id, version }) => ({ kind, id, version })
        ),
        values: [],
        completeness: {
          confirmed: row.snapshot.evidenceRefs.length,
          reviewRequired: 0,
          conflicts: 0,
          reasons: []
        },
        reportReference: null
      }),
      limitations: ['server_snapshot_limited'],
      proposedActionIds: row.preview ? [row.preview.id] : [],
      feedback: null,
      createdAt: epoch(row.createdAt)
    };
    responseCache.set(mapped.id, mapped);
    if (row.preview)
      previewCache.set(
        row.preview.id,
        mapPreview(row.preview, row.id, row.snapshot.evidenceRefs)
      );
    return mapped;
  };
  const mappedResponses = (rows: readonly z.infer<typeof messageSchema>[]) =>
    rows
      .filter((row) => row.role === 'assistant' && row.status === 'completed')
      .map((row) => mapResponse(row, rows));
  const findCold = async (kind: 'response' | 'preview', id: string) => {
    responseCache.clear();
    previewCache.clear();
    for (const item of await listAllConversations()) {
      mappedResponses(await listAllMessages(item.id));
      const found =
        kind === 'response' ? responseCache.get(id) : previewCache.get(id);
      if (found) return found;
    }
    throw new AssistantApiError('not_found');
  };
  const ask = async (
    conversationId: string,
    question: string,
    operationId: string
  ): Promise<AssistantResponse> => {
    const accepted = parse(
      z.object({ id: z.string().uuid(), status: z.string() }).strict(),
      await send(
        'POST',
        `/api/v1/assistant/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          content: question,
          contextScope: [
            'accounts_summary',
            'recent_transactions',
            'budgets',
            'obligations',
            'tracking_reviews'
          ],
          responseMode: 'async'
        },
        operationId
      )
    );
    for (let attempt = 0; attempt < 650; attempt += 1) {
      const rows = await listAllMessages(conversationId);
      const answer = rows.find(
        (row) =>
          row.role === 'assistant' && row.replyToMessageId === accepted.id
      );
      if (answer?.status === 'failed' || answer?.status === 'cancelled')
        throw new AssistantApiError(
          answer.failureCode === 'AI_QUOTA_EXCEEDED'
            ? 'limit_reached'
            : 'assistant_disabled'
        );
      if (answer?.status === 'completed') return mapResponse(answer, rows);
      await sleep(100);
    }
    throw new AssistantApiError('offline');
  };

  return {
    metadata: {
      id: 'phase09-assistant-http',
      capability: assistantServiceCapability.capability,
      majorVersion: assistantServiceCapability.majorVersion,
      kind: 'live',
      availability:
        baseUrl && (Boolean(options.token) || tokenProviderConfigured)
          ? 'available'
          : 'unavailable'
    },
    async getConsent() {
      return mapConsent(await send('GET', '/api/v1/assistant/consent'));
    },
    async getAvailability() {
      const row = parse(
        z
          .object({
            status: z.enum(['available', 'disabled', 'limit_reached']),
            limit: z.number().int().nonnegative(),
            used: z.number().int().nonnegative(),
            remaining: z.number().int().nonnegative(),
            resetsAt: dateTime
          })
          .strict(),
        await send('GET', '/api/v1/assistant/availability')
      );
      return {
        status: row.status,
        remainingQuestions: row.remaining,
        limit: row.limit,
        used: row.used,
        resetsAt: row.resetsAt
      };
    },
    async setConsent(enabled, expectedVersion, operationId) {
      const row = await send(
        enabled ? 'PUT' : 'DELETE',
        enabled
          ? '/api/v1/assistant/consent'
          : `/api/v1/assistant/consent?expectedVersion=${String(expectedVersion)}`,
        enabled
          ? {
              policyVersion: 'assistant-privacy-v1',
              accepted: true,
              expectedVersion
            }
          : undefined,
        operationId
      );
      return mutation(mapConsent(row), [
        'assistant.consent',
        'assistant.availability',
        'assistant.context'
      ]);
    },
    async listConversations(input) {
      const result = parse(
        page(conversationSchema),
        await send(
          'GET',
          `/api/v1/assistant/conversations?limit=${String(input.pageSize ?? 20)}${input.cursor ? `&cursor=${encodeURIComponent(input.cursor)}` : ''}`
        )
      );
      const items = result.items
        .map(mapConversation)
        .filter((item) => !input.status || item.status === input.status);
      return { items, nextCursor: result.nextCursor, total: items.length };
    },
    async createConversation(input, operationId) {
      const item = mapConversation(
        await send(
          'POST',
          '/api/v1/assistant/conversations',
          { title: input.question.slice(0, 120) },
          operationId
        )
      );
      const first = await ask(
        item.id,
        input.question,
        `${operationId}-message`
      );
      return mutation({ ...item, lastResponseId: first.id }, [
        'assistant.conversations',
        `assistant.conversation.${item.id}`,
        'assistant.availability',
        'assistant.context'
      ]);
    },
    async getConversation(id, cursor) {
      const item = mapConversation(
        await send(
          'GET',
          `/api/v1/assistant/conversations/${encodeURIComponent(id)}`
        )
      );
      const result = await listMessages(id, cursor);
      const responses = mappedResponses(result.items);
      return {
        conversation: { ...item, lastResponseId: responses[0]?.id ?? null },
        responses: {
          items: responses,
          nextCursor: result.nextCursor,
          total: responses.length
        }
      };
    },
    async getResponse(id) {
      return (await findCold('response', id)) as AssistantResponse;
    },
    async ask(conversationId, question, operationId) {
      return mutation(await ask(conversationId, question, operationId), [
        `assistant.conversation.${conversationId}`,
        'assistant.availability',
        'assistant.context'
      ]);
    },
    async renameConversation(id, title, expectedVersion, operationId) {
      return mutation(
        mapConversation(
          await send(
            'PATCH',
            `/api/v1/assistant/conversations/${encodeURIComponent(id)}`,
            { title, expectedVersion },
            operationId
          )
        ),
        ['assistant.conversations', `assistant.conversation.${id}`]
      );
    },
    async deleteConversation(id, expectedVersion, operationId) {
      await send(
        'DELETE',
        `/api/v1/assistant/conversations/${encodeURIComponent(id)}?expectedVersion=${String(expectedVersion)}`,
        undefined,
        operationId
      );
      return mutation({ id }, [
        'assistant.conversations',
        `assistant.conversation.${id}`
      ]);
    },
    async setResponseFeedback(responseId, feedback, operationId) {
      const current = await this.getResponse(responseId);
      await send(
        'PUT',
        `/api/v1/assistant/messages/${encodeURIComponent(responseId)}/feedback`,
        { rating: feedback === 'helpful' ? 1 : -1, reason: null },
        operationId
      );
      if (feedback === 'reported')
        await send(
          'POST',
          `/api/v1/assistant/messages/${encodeURIComponent(responseId)}/report`,
          {
            reportType: 'other',
            reason: 'Reported from the mobile assistant.'
          },
          `${operationId}-report`
        );
      const next = { ...current, feedback };
      responseCache.set(responseId, next);
      return mutation(next, [
        `assistant.conversation.${current.conversationId}`
      ]);
    },
    async getActionPreview(id) {
      return (await findCold('preview', id)) as AssistantActionPreview;
    },
    async updateActionPreview() {
      throw new AssistantApiError('assistant_disabled');
    },
    async confirmAction(id, expectedVersion, operationId) {
      await send(
        'POST',
        `/api/v1/assistant/previews/${encodeURIComponent(id)}/confirm`,
        { expectedVersion },
        operationId
      );
      previewCache.delete(id);
      const next = (await findCold('preview', id)) as AssistantActionPreview;
      return mutation(next, [
        `assistant.actionPreview.${id}`,
        'assistant.context'
      ]);
    },
    async cancelAction(id, expectedVersion, operationId) {
      const current = await this.getActionPreview(id);
      const row = await send(
        'POST',
        `/api/v1/assistant/previews/${encodeURIComponent(id)}/reject`,
        { expectedVersion, reason: 'Cancelled by user' },
        operationId
      );
      const next = mapPreview(
        row,
        current.responseId,
        current.sourceVersions.map(({ id: alias, version }) => ({
          kind: 'report' as const,
          alias,
          version
        }))
      );
      previewCache.set(id, next);
      return mutation(next, [`assistant.actionPreview.${id}`]);
    }
  };
}
