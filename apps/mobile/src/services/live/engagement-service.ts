import { createNotificationPreferences, type NotificationCategory, type NotificationEvent } from '@/domain/notifications';
import { supportDraftSchema, supportOperationSchema, supportTicketSchema, type SupportArticle, type SupportDraft, type SupportDraftInput, type SupportOperation, type SupportReplyInput, type SupportTicket } from '@/domain/support';
import { currentLocale } from '@/localization/i18n';
import { notificationServiceCapability, supportServiceCapability, type NotificationService, type SupportService } from '@/services/contracts/assistant-notifications-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { SupportRepository } from '@/storage/support-repository';

type Json = Record<string, unknown>;
type TokenProvider = () => Promise<string>;

let engagementTokenProvider: TokenProvider = () => Promise.reject(new EngagementApiError('unavailable'));
let engagementTokenConfigured = false;

export function configureEngagementApiTokenProvider(provider: TokenProvider): void {
  engagementTokenProvider = provider;
  engagementTokenConfigured = true;
}

export class EngagementApiError extends Error {
  constructor(readonly code: 'offline' | 'forbidden' | 'not_found' | 'conflict' | 'expired' | 'unavailable') {
    super(code);
  }
}

function record(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new EngagementApiError('unavailable');
  return value as Json;
}

export function createEngagementApi({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token = () => engagementTokenProvider(),
  request = fetch
}: {
  baseUrl?: string;
  token?: TokenProvider;
  request?: typeof fetch;
} = {}) {
  const send = async (method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<Json> => {
    if (!baseUrl || !path.startsWith('/api/v1/')) throw new EngagementApiError('unavailable');
    let response: Response;
    try {
      response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await token()}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new EngagementApiError('offline');
    }
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new EngagementApiError(
        response.status === 403 ? 'forbidden' :
          response.status === 404 ? 'not_found' :
            response.status === 409 ? 'conflict' :
              response.status === 410 ? 'expired' : 'unavailable'
      );
    }
    return record(payload);
  };

  return {
    listNotifications: ({ cursor, type, unread, limit = 50 }: { cursor?: string; type?: string; unread?: boolean; limit?: number } = {}) => send('GET', `/api/v1/notifications?limit=${Math.min(100, Math.max(1, Math.trunc(limit)))}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${type ? `&type=${encodeURIComponent(type)}` : ''}${unread === undefined ? '' : `&unread=${String(unread)}`}`),
    getNotification: (id: string) => send('GET', `/api/v1/notifications/${encodeURIComponent(id)}`),
    markNotificationRead: (id: string, expectedVersion: number, key: string, read = true) => send('POST', `/api/v1/notifications/${encodeURIComponent(id)}/read`, { read, expectedVersion }, key),
    actOnNotification: (id: string, actionKey: string, expectedVersion: number, key: string) => send('POST', `/api/v1/notifications/${encodeURIComponent(id)}/actions`, { actionKey, expectedVersion }, key),
    getPreferences: () => send('GET', '/api/v1/notifications/preferences'),
    savePreferences: (items: unknown[], version: number, key: string) => send('PUT', '/api/v1/notifications/preferences', { items, version, expectedVersion: version }, key),
    listSupportCategories: () => send('GET', '/api/v1/support/categories?limit=100'),
    listTickets: (cursor?: string) => send('GET', `/api/v1/support/tickets?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
    getTicket: (id: string) => send('GET', `/api/v1/support/tickets/${encodeURIComponent(id)}`),
    createTicket: (input: Json, key: string) => send('POST', '/api/v1/support/tickets', input, key),
    addMessage: (ticketId: string, input: Json, key: string) => send('POST', `/api/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`, input, key),
    closeTicket: (ticketId: string, expectedVersion: number, key: string) => send('POST', `/api/v1/support/tickets/${encodeURIComponent(ticketId)}/close`, { expectedVersion }, key),
    reopenTicket: (ticketId: string, expectedVersion: number, reason: string, key: string) => send('POST', `/api/v1/support/tickets/${encodeURIComponent(ticketId)}/reopen`, { expectedVersion, reason }, key),
    initializeUpload: (ticketId: string, input: Json, key: string) => send('POST', `/api/v1/support/tickets/${encodeURIComponent(ticketId)}/attachments/uploads`, input, key),
    finalizeUpload: (ticketId: string, input: Json, key: string) => send('POST', `/api/v1/support/tickets/${encodeURIComponent(ticketId)}/attachments/finalize`, input, key),
    downloadAttachment: (id: string) => send('GET', `/api/v1/support/attachments/${encodeURIComponent(id)}/download`),
    listContent: (locale: 'ar' | 'en', type: 'article' | 'faq' | 'policy' | 'announcement', query = '') => send('GET', `/api/v1/content?locale=${locale}&type=${type}&query=${encodeURIComponent(query)}&limit=100`),
    getContent: (key: string, locale: 'ar' | 'en') => send('GET', `/api/v1/content/${encodeURIComponent(key)}?locale=${locale}`),
    createFeedback: (input: Json, key: string) => send('POST', '/api/v1/feedback', input, key),
    createAbuseReport: (input: Json, key: string) => send('POST', '/api/v1/abuse-reports', input, key)
  };
}

type DraftStore = Pick<SupportRepository, 'saveDraft' | 'loadDraft' | 'discardDraft'>;

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dateValue(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function notificationCategory(type: string): NotificationCategory {
  const category = type.split('.')[0];
  return ['transaction', 'income', 'obligation', 'budget', 'salary', 'savings', 'report', 'assistant', 'security'].includes(category)
    ? category as NotificationCategory
    : 'system';
}

function notificationTarget(item: Json): NotificationEvent['target'] {
  const data = record(item.dataSafe);
  const kind = stringValue(data.targetKind);
  const id = stringValue(data.targetId);
  if (kind === 'settings') return { kind: 'settings', key: 'notifications' };
  if (!id) return null;
  if (kind === 'account') return { kind, accountId: id };
  if (kind === 'transaction') return { kind, transactionId: id };
  if (kind === 'obligation') return { kind, obligationId: id };
  if (kind === 'goal') return { kind, goalId: id };
  if (kind === 'review') return { kind, reviewId: id };
  if (kind === 'security') return { kind, securityEventId: id };
  return null;
}

function notificationFromApi(input: unknown): NotificationEvent {
  const item = record(input);
  const type = stringValue(item.type, 'system.notice');
  const actions = values(item.actions).map(record).flatMap((action) => {
    const kind = stringValue(action.key);
    if (!['view', 'edit', 'undo'].includes(kind)) return [];
    return [{ kind: kind as 'view' | 'edit' | 'undo', expiresAt: item.expiresAt ? dateValue(item.expiresAt) : null, sourceVersion: kind === 'undo' ? numberValue(item.version, 1) : null }];
  });
  return {
    id: stringValue(item.id),
    eventKey: `server:${stringValue(item.id)}:${numberValue(item.version, 1)}`,
    category: notificationCategory(type),
    eventType: type,
    titleKey: stringValue(item.title, 'Masarifi'),
    bodyKey: stringValue(item.body, 'Notification available'),
    messageValues: {},
    sensitivity: 'protected',
    target: notificationTarget(item),
    availableActions: actions,
    occurredAt: dateValue(item.createdAt),
    readAt: item.readAt ? dateValue(item.readAt) : null,
    deletedAt: null,
    phoneStatus: 'not_requested',
    syncStatus: 'synced',
    safeFailure: null
  };
}

function notificationScopes(id: string): readonly string[] {
  return [`notifications.detail.${id}`, 'notifications.list', 'notifications.unread'];
}

export function createLiveNotificationService(options: Parameters<typeof createEngagementApi>[0] = {}): CapabilityProviderHandle<NotificationService> {
  const api = createEngagementApi(options);
  const available = Boolean(options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL) && (Boolean(options.token) || engagementTokenConfigured);
  let rawPreferences: Json | null = null;
  const loadPreferences = async () => rawPreferences = await api.getPreferences();
  const performServerAction: NotificationService['executeAction'] = async (id, action, operationId) => {
    const raw = await api.getNotification(id);
    await api.actOnNotification(id, action, numberValue(raw.version, 1), operationId);
    return { value: { id, target: notificationFromApi(raw).target }, affectedScopes: notificationScopes(id) };
  };
  return {
    metadata: { id: 'phase11-notifications-http', capability: notificationServiceCapability.capability, majorVersion: notificationServiceCapability.majorVersion, kind: 'live', availability: available ? 'available' : 'unavailable' },
    async list(input) {
      const raw = await api.listNotifications({ cursor: input.cursor, type: input.category, unread: input.unreadOnly, limit: input.pageSize });
      const items = values(raw.items).map(notificationFromApi).filter((item) => !input.category || item.category === input.category).filter((item) => !input.unreadOnly || item.readAt === null);
      return { items, nextCursor: typeof raw.nextCursor === 'string' ? raw.nextCursor : null, total: input.unreadOnly ? numberValue(raw.unreadCount, items.length) : items.length + (raw.hasMore ? 1 : 0) };
    },
    async get(id) { return notificationFromApi(await api.getNotification(id)); },
    async createFromSource() { throw new EngagementApiError('unavailable'); },
    async markRead(id, read) {
      const current = await api.getNotification(id);
      await api.markNotificationRead(id, numberValue(current.version, 1), `notification:${id}:${numberValue(current.version, 1)}:read:${read}`, read);
      return { value: notificationFromApi({ ...current, readAt: read ? new Date().toISOString() : null, version: numberValue(current.version, 1) + 1 }), affectedScopes: notificationScopes(id) };
    },
    async markAllRead(filter, operationId) {
      const page = await this.list({ ...filter, unreadOnly: true, pageSize: 100 });
      await Promise.all(page.items.map((item) => api.markNotificationRead(item.id, Number(item.eventKey.split(':').at(-1)) || 1, `${operationId}:${item.id}`)));
      return { value: page.items.length, affectedScopes: ['notifications.list', 'notifications.unread'] };
    },
    async delete() { throw new EngagementApiError('unavailable'); },
    async getPreferences() {
      const raw = await loadPreferences();
      const items = values(raw.items).map(record);
      const firstQuiet = record(items[0]?.quietHours);
      const result = createNotificationPreferences(Date.now());
      return {
        ...result,
        version: numberValue(raw.version, 1),
        phoneEnabled: items.some((item) => item.channel === 'push' && item.enabled === true),
        quietHours: {
          enabled: firstQuiet.enabled === true,
          start: stringValue(firstQuiet.start, result.quietHours.start),
          end: stringValue(firstQuiet.end, result.quietHours.end),
          weekdays: values(firstQuiet.weekdays).filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6),
          timeZone: stringValue(firstQuiet.timeZone, result.quietHours.timeZone)
        },
        permissionState: 'unavailable'
      };
    },
    async savePreferences(input, expectedVersion, operationId) {
      const raw = rawPreferences ?? await loadPreferences();
      const items = values(raw.items).map(record).map((item) => ({
        channel: item.channel,
        eventType: item.eventType,
        enabled: item.channel === 'push' ? input.phoneEnabled && item.enabled !== false : item.enabled !== false,
        quietHours: input.quietHours
      }));
      await api.savePreferences(items, expectedVersion, operationId);
      rawPreferences = null;
      return { value: { ...input, version: expectedVersion + 1, updatedAt: Date.now() }, affectedScopes: ['notifications.preferences'] };
    },
    async refreshPermission() { return 'unavailable'; },
    async requestPermissionAfterEducation() { return 'unavailable'; },
    async resolveTarget(id) {
      const target = (await this.get(id)).target;
      return target ? { status: 'exact', target } : { status: 'unavailable', target: null };
    },
    async revalidateAction(id, action) {
      const item = await this.get(id);
      const declared = item.availableActions.find((candidate) => candidate.kind === action);
      return { status: declared && (!declared.expiresAt || declared.expiresAt > Date.now()) ? 'available' : declared ? 'expired' : 'unavailable', target: item.target, action };
    },
    executeAction: performServerAction
  };
}

function supportStatus(value: unknown): SupportTicket['status'] {
  if (value === 'waiting_customer') return 'waiting_user';
  if (value === 'resolved' || value === 'closed' || value === 'open') return value;
  return 'open';
}

function supportTicketFromApi(input: unknown): SupportTicket {
  const item = record(input);
  const messages = values(item.messages).map(record);
  const first = messages[0];
  return supportTicketSchema.parse({
    id: stringValue(item.id), reference: stringValue(item.id), category: stringValue(item.categoryId, 'support'), subject: stringValue(item.subject),
    description: stringValue(first?.body, stringValue(item.subject)), context: null, status: supportStatus(item.status),
    messages: messages.map((message) => ({ id: stringValue(message.id), author: message.senderType === 'customer' ? 'user' : 'support', body: stringValue(message.body), createdAt: dateValue(message.createdAt) })),
    createdAt: dateValue(item.createdAt), updatedAt: dateValue(item.lastMessageAt ?? item.createdAt), rating: null, version: numberValue(item.version, 1)
  });
}

function supportOperation(operationId: string, kind: SupportOperation['kind'], ticketId: string | null, draftId: string | null): SupportOperation {
  const now = Date.now();
  return supportOperationSchema.parse({ id: `support-operation-${operationId}`, operationId, kind, draftId, ticketId, status: 'submitted', safeFailure: null, requestedAt: now, completedAt: now });
}

export function createLiveSupportService(options: Parameters<typeof createEngagementApi>[0] & { drafts?: DraftStore } = {}): CapabilityProviderHandle<SupportService> {
  const { drafts = new SupportRepository(), ...apiOptions } = options;
  const api = createEngagementApi(apiOptions);
  const available = Boolean(apiOptions.baseUrl ?? process.env.EXPO_PUBLIC_API_URL) && (Boolean(apiOptions.token) || engagementTokenConfigured);
  return {
    metadata: { id: 'phase11-support-http', capability: supportServiceCapability.capability, majorVersion: supportServiceCapability.majorVersion, kind: 'live', availability: available ? 'available' : 'unavailable' },
    async searchArticles({ query, category }) {
      const type = category === 'faq' ? 'faq' : category === 'whats_new' ? 'announcement' : 'article';
      const raw = await api.listContent(currentLocale(), type, query);
      return values(raw.items).map(record).map((item): SupportArticle => ({ id: stringValue(item.key), kind: item.type === 'faq' ? 'faq' : item.type === 'announcement' ? 'whats_new' : 'help', titleKey: stringValue(item.title), bodyKey: stringValue(item.body), searchTerms: [stringValue(item.title), stringValue(item.body)], category: stringValue(item.type, 'article'), version: String(numberValue(item.version, 1)), publishedAt: dateValue(item.publishedAt) }));
    },
    async listTickets(cursor) {
      const raw = await api.listTickets(cursor);
      const items = values(raw.items).map(supportTicketFromApi);
      return { items, nextCursor: typeof raw.nextCursor === 'string' ? raw.nextCursor : null, total: items.length + (raw.hasMore ? 1 : 0) };
    },
    async getTicket(id) { return supportTicketFromApi(await api.getTicket(id)); },
    async saveDraft(input: SupportDraftInput): Promise<SupportDraft> { return drafts.saveDraft(supportDraftSchema.parse({ ...input, status: 'draft', updatedAt: Date.now() })); },
    loadDraft: (id) => drafts.loadDraft(id),
    discardDraft: (id) => drafts.discardDraft(id),
    async submitDraft(id, operationId) {
      const draft = await drafts.loadDraft(id);
      if (!draft) throw new EngagementApiError('not_found');
      let ticketId: string | null = null;
      let kind: SupportOperation['kind'] = 'submit_ticket';
      if (draft.mode === 'feedback') {
        kind = 'feedback';
        await api.createFeedback({ type: 'other', subject: draft.subject, body: draft.description }, operationId);
      } else if (draft.mode === 'transaction_report' || draft.mode === 'assistant_report') {
        kind = draft.mode === 'transaction_report' ? 'report_transaction' : 'report_assistant';
        await api.createAbuseReport({ resourceType: draft.mode === 'transaction_report' ? 'other' : 'assistant_response', resourceId: draft.context?.itemId, reason: draft.description }, operationId);
      } else {
        const categories = await api.listSupportCategories();
        const category = values(categories.items).map(record).find((item) => item.key === draft.category) ?? record(values(categories.items)[0]);
        const created = await api.createTicket({ categoryId: category.id, subject: draft.subject, message: draft.description }, operationId);
        ticketId = stringValue(created.resourceId ?? created.id);
      }
      await drafts.discardDraft(id);
      const value = supportOperation(operationId, kind, ticketId, id);
      return { value, affectedScopes: ['support.tickets', `support.draft.${id}`] };
    },
    async reply(ticketId, input: SupportReplyInput, expectedVersion, operationId) {
      await api.addMessage(ticketId, { body: input.description, attachmentUploadIds: [], expectedVersion }, operationId);
      return { value: supportOperation(operationId, 'reply', ticketId, null), affectedScopes: ['support.tickets', `support.ticket.${ticketId}`] };
    },
    async rate() { throw new EngagementApiError('unavailable'); }
  };
}
