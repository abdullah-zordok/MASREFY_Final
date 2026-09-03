import type { AssistantActionInput, AssistantActionPreview, AssistantConsent, AssistantConversation, AssistantResponse } from '@/domain/assistant';
import { createImmutableSnapshot } from '@/domain/assistant';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { assistantServiceCapability, type AssistantService } from '@/services/contracts/assistant-notifications-service';

type Json = Record<string, unknown>;
type TokenProvider = () => Promise<string>;
let tokenProvider: TokenProvider = () => Promise.reject(new Error('assistant_unavailable'));
let tokenProviderConfigured = false;

export function configureAssistantApiTokenProvider(provider: TokenProvider): void { tokenProvider = provider; tokenProviderConfigured = true; }

class AssistantApiError extends Error { constructor(readonly code: string) { super(code); } }
function object(value: unknown): Json { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssistantApiError('representative_failure'); return value as Json; }
function epoch(value: unknown): number { const result = typeof value === 'string' ? Date.parse(value) : Number.NaN; return Number.isFinite(result) ? result : Date.now(); }
function mutation<T>(value: T, affectedScopes: readonly string[]) { return { value, affectedScopes }; }

function conversation(value: unknown): AssistantConversation {
  const row = object(value);
  return { id: String(row.id), title: typeof row.title === 'string' ? row.title : 'Assistant conversation', status: row.status === 'active' ? 'active' : 'deleted', createdAt: epoch(row.createdAt), updatedAt: epoch(row.updatedAt ?? row.lastMessageAt), lastResponseId: null, version: Number(row.version ?? 1) };
}

function preview(value: unknown, responseId: string): AssistantActionPreview {
  const row = object(value), payload = object(row.payload), action = String(row.actionType);
  const amountMinor = Number(payload.amountMinor ?? payload.targetMinor ?? 0), currency = String(payload.currency ?? payload.currencyCode ?? 'SAR');
  const kind: AssistantActionPreview['kind'] = action === 'savings_goal.create' ? 'create_goal' : action === 'budget.update' ? 'adjust_budget' : action === 'transaction.update' ? 'link_transaction' : 'create_plan';
  const input = kind === 'link_transaction' ? { transactionId: String(payload.transactionId) } : { amountMinor, currency };
  const affectedDestination = kind === 'adjust_budget' ? { kind: 'budget' as const, budgetId: String(payload.budgetId) } : kind === 'create_goal' ? { kind: 'goal' as const, goalId: String(row.id) } : { kind: 'transactions' as const };
  const status = row.status === 'executed' ? 'succeeded' : row.status === 'rejected' ? 'cancelled' : row.status === 'expired' ? 'expired' : 'ready';
  return { id: String(row.id), responseId, kind, input: input as AssistantActionInput, affectedDestination, sourceVersions: [], status, operationId: null, expiresAt: epoch(row.expiresAt), resultReference: typeof row.executedResourceId === 'string' ? row.executedResourceId : null, safeFailure: null, version: Number(row.version ?? 1) } as AssistantActionPreview;
}

export function createLiveAssistantApiService(options: { baseUrl?: string; token?: TokenProvider; request?: typeof fetch; sleep?: (milliseconds: number) => Promise<void> } = {}): CapabilityProviderHandle<AssistantService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '', token = options.token ?? (() => tokenProvider()), request = options.request ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const responseCache = new Map<string, AssistantResponse>(), previewCache = new Map<string, AssistantActionPreview>();
  const send = async (method: string, path: string, body?: unknown, key?: string): Promise<unknown> => {
    if (!baseUrl) throw new AssistantApiError('assistant_disabled');
    let response: Response;
    try { response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, { method, headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new AssistantApiError('offline'); }
    const value: unknown = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new AssistantApiError(response.status === 403 ? 'consent_required' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status === 429 ? 'limit_reached' : response.status === 503 ? 'assistant_disabled' : 'representative_failure');
    return value;
  };
  const listMessages = async (id: string, cursor?: string) => object(await send('GET', `/api/v1/assistant/conversations/${encodeURIComponent(id)}/messages?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
  const mapResponse = (row: Json, question: Json): AssistantResponse => {
    const snapshot = object(row.snapshot ?? {}), refs = Array.isArray(snapshot.evidenceRefs) ? snapshot.evidenceRefs.map(object) : [];
    const mapped = { id: String(row.id), conversationId: String(row.conversationId), question: String(question.content ?? ''), responseType: 'direct' as const, blocks: [{ label: 'fact' as const, key: String(row.content ?? ''), values: {} }], period: null, dataAsOf: epoch(row.createdAt), snapshot: createImmutableSnapshot({ sources: refs.map((item) => ({ kind: 'report' as const, id: String(item.alias ?? 'evidence'), version: Number(item.version ?? 0) })), values: [], completeness: { confirmed: refs.length, reviewRequired: 0, conflicts: 0, reasons: [] }, reportReference: null }), limitations: [], proposedActionIds: [] as string[], feedback: null, createdAt: epoch(row.createdAt) };
    if (row.preview) { const item = preview(row.preview, mapped.id); previewCache.set(item.id, item); mapped.proposedActionIds.push(item.id); }
    responseCache.set(mapped.id, mapped);
    return mapped;
  };
  const responses = (value: unknown): AssistantResponse[] => {
    const rows = Array.isArray(object(value).items) ? (object(value).items as unknown[]).map(object) : [];
    const users = new Map(rows.filter((row) => row.role === 'user').map((row) => [String(row.id), row]));
    return rows.filter((row) => row.role === 'assistant').map((row) => mapResponse(row, users.get(String(row.replyToMessageId)) ?? {}));
  };
  const ask = async (conversationId: string, question: string, operationId: string): Promise<AssistantResponse> => {
    const accepted = object(await send('POST', `/api/v1/assistant/conversations/${encodeURIComponent(conversationId)}/messages`, { content: question, contextScope: ['accounts_summary', 'recent_transactions', 'budgets', 'obligations', 'tracking_reviews'], responseMode: 'async' }, operationId));
    for (let attempt = 0; attempt < 650; attempt += 1) {
      const page = await listMessages(conversationId);
      const rows = Array.isArray(page.items) ? page.items.map(object) : [];
      const answer = rows.find((row) => row.role === 'assistant' && row.replyToMessageId === accepted.id);
      if (answer) return mapResponse(answer, rows.find((row) => row.id === accepted.id) ?? { content: question });
      await sleep(100);
    }
    throw new AssistantApiError('offline');
  };
  return {
    metadata: { id: 'phase09-assistant-http', capability: assistantServiceCapability.capability, majorVersion: assistantServiceCapability.majorVersion, kind: 'live', availability: baseUrl && (Boolean(options.token) || tokenProviderConfigured) ? 'available' : 'unavailable' },
    async getConsent() { const row = object(await send('GET', '/api/v1/assistant/consent')); return { status: row.granted === true ? 'enabled' : row.revokedAt ? 'disabled' : 'not_requested', disclosedDataCategories: ['transactions', 'planning', 'reports'], consentedAt: row.grantedAt ? epoch(row.grantedAt) : null, disabledAt: row.revokedAt ? epoch(row.revokedAt) : null, version: 1 } satisfies AssistantConsent; },
    async getAvailability() { const consent = await this.getConsent(); return { status: consent.status === 'enabled' ? 'available' : 'disabled', remainingQuestions: consent.status === 'enabled' ? 5 : 0 }; },
    async setConsent(enabled, _expectedVersion, operationId) { const value = enabled ? await send('PUT', '/api/v1/assistant/consent', { policyVersion: 'assistant-privacy-v1', accepted: true }, operationId) : (await send('DELETE', '/api/v1/assistant/consent', undefined, operationId), await this.getConsent()); const row = object(value); return mutation({ status: row.granted === true ? 'enabled' : 'disabled', disclosedDataCategories: ['transactions', 'planning', 'reports'], consentedAt: row.grantedAt ? epoch(row.grantedAt) : null, disabledAt: row.revokedAt ? epoch(row.revokedAt) : Date.now(), version: 1 } satisfies AssistantConsent, ['assistant.consent', 'assistant.availability', 'assistant.context']); },
    async listConversations(input) { const page = object(await send('GET', `/api/v1/assistant/conversations?limit=${String(input.pageSize ?? 20)}${input.cursor ? `&cursor=${encodeURIComponent(input.cursor)}` : ''}`)); const items = Array.isArray(page.items) ? page.items.map(conversation).filter((item) => !input.status || item.status === input.status) : []; return { items, nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null, total: items.length }; },
    async createConversation(input, operationId) { const item = conversation(await send('POST', '/api/v1/assistant/conversations', { title: null }, operationId)); const first = await ask(item.id, input.question, `${operationId}-message`); return mutation({ ...item, lastResponseId: first.id }, ['assistant.conversations', `assistant.conversation.${item.id}`, 'assistant.availability', 'assistant.context']); },
    async getConversation(id, cursor) { const item = conversation(await send('GET', `/api/v1/assistant/conversations/${encodeURIComponent(id)}`)); const page = await listMessages(id, cursor); const items = responses(page); return { conversation: { ...item, lastResponseId: items[0]?.id ?? null }, responses: { items, nextCursor: typeof page.nextCursor === 'string' ? page.nextCursor : null, total: items.length } }; },
    async getResponse(id) { const item = responseCache.get(id); if (!item) throw new AssistantApiError('not_found'); return item; },
    async ask(conversationId, question, operationId) { const value = await ask(conversationId, question, operationId); return mutation(value, [`assistant.conversation.${conversationId}`, 'assistant.availability', 'assistant.context']); },
    async renameConversation(id, title, expectedVersion, operationId) { return mutation(conversation(await send('PATCH', `/api/v1/assistant/conversations/${encodeURIComponent(id)}`, { title, expectedVersion }, operationId)), ['assistant.conversations', `assistant.conversation.${id}`]); },
    async deleteConversation(id, expectedVersion, operationId) { await send('DELETE', `/api/v1/assistant/conversations/${encodeURIComponent(id)}?expectedVersion=${String(expectedVersion)}`, undefined, operationId); return mutation({ id }, ['assistant.conversations', `assistant.conversation.${id}`]); },
    async setResponseFeedback(responseId, feedback, operationId) { const current = responseCache.get(responseId); if (!current) throw new AssistantApiError('not_found'); await send('PUT', `/api/v1/assistant/messages/${encodeURIComponent(responseId)}/feedback`, { rating: feedback === 'helpful' ? 1 : -1, reason: null }, operationId); if (feedback === 'reported') await send('POST', `/api/v1/assistant/messages/${encodeURIComponent(responseId)}/report`, { reportType: 'other', reason: 'Reported from the mobile assistant.' }, `${operationId}-report`); const next = { ...current, feedback }; responseCache.set(responseId, next); return mutation(next, [`assistant.conversation.${current.conversationId}`]); },
    async getActionPreview(id) { const item = previewCache.get(id); if (!item) throw new AssistantApiError('not_found'); return item; },
    async updateActionPreview() { throw new AssistantApiError('conflict'); },
    async confirmAction(id, expectedVersion, operationId) { const item = previewCache.get(id); if (!item) throw new AssistantApiError('not_found'); const result = object(await send('POST', `/api/v1/assistant/previews/${encodeURIComponent(id)}/confirm`, { expectedVersion }, operationId)); const next = { ...item, status: 'succeeded' as const, operationId, resultReference: String(result.resourceId), version: item.version + 1 } as AssistantActionPreview; previewCache.set(id, next); return mutation(next, [`assistant.actionPreview.${id}`, 'assistant.context']); },
    async cancelAction(id, expectedVersion, operationId) { const item = previewCache.get(id); if (!item) throw new AssistantApiError('not_found'); await send('POST', `/api/v1/assistant/previews/${encodeURIComponent(id)}/reject`, { expectedVersion, reason: 'Cancelled by user' }, operationId); const next = { ...item, status: 'cancelled' as const, version: item.version + 1 } as AssistantActionPreview; previewCache.set(id, next); return mutation(next, [`assistant.actionPreview.${id}`]); }
  };
}
