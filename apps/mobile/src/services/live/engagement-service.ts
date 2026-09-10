import {
  createNotificationPreferences,
  notificationCategorySchema,
  notificationEventSchema,
  notificationPreferencesSchema,
  type NotificationCategory,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/domain/notifications';
import { supportDraftSchema, supportOperationSchema, supportTicketSchema, type SupportArticle, type SupportDraft, type SupportDraftInput, type SupportOperation, type SupportReplyInput, type SupportTicket } from '@/domain/support';
import { currentLocale } from '@/localization/i18n';
import { notificationServiceCapability, supportServiceCapability, type NotificationService, type PhoneNotificationService, type SupportService } from '@/services/contracts/assistant-notifications-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import {
  getPushDeviceRegistration,
  phoneNotificationService,
  type PushDeviceRegistration,
} from '@/services/platform/phone-notification-service';
import { AssistantNotificationsRepository } from '@/storage/assistant-notifications-repository';
import { SupportRepository } from '@/storage/support-repository';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';

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
    getTicket: (id: string, cursor?: string) => send('GET', `/api/v1/support/tickets/${encodeURIComponent(id)}?${cursor ? `cursor=${encodeURIComponent(cursor)}&` : ''}limit=100`),
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
    createAbuseReport: (input: Json, key: string) => send('POST', '/api/v1/abuse-reports', input, key),
    registerDevice: (input: PushDeviceRegistration, key: string) => send('POST', '/api/v1/me/devices/register', input, key)
  };
}

type DraftStore = Pick<SupportRepository, 'saveDraft' | 'loadDraft' | 'discardDraft'>;
type PreferenceStore = Pick<
  AssistantNotificationsRepository,
  'getNotificationPreferences' | 'saveNotificationPreferences'
>;

const isoDateSchema = z.string().datetime({ offset: true });
const nullableIsoDateSchema = isoDateSchema.nullable();
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const notificationActionApiSchema = z
  .object({ key: z.enum(['view', 'edit', 'undo']), expiresAt: nullableIsoDateSchema })
  .strict();
const notificationApiSchema = z
  .object({
    id: z.string().uuid(),
    type: z.string().min(1).max(96),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(240),
    dataSafe: z.record(z.string(), scalarSchema),
    readAt: nullableIsoDateSchema,
    actedAt: nullableIsoDateSchema,
    expiresAt: nullableIsoDateSchema,
    actions: z.array(notificationActionApiSchema).max(3),
    version: z.number().int().positive(),
    createdAt: isoDateSchema,
  })
  .strict();
const notificationPageApiSchema = z
  .object({
    items: z.array(notificationApiSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
    hasMore: z.boolean(),
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();
const quietHoursApiSchema = z
  .object({
    enabled: z.boolean(),
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
    timeZone: z.string().min(1).max(64),
  })
  .strict();
const preferenceApiSchema = z
  .object({
    channel: z.enum(['in_app', 'push', 'email']),
    eventType: z.string().min(1).max(96),
    enabled: z.boolean(),
    quietHours: quietHoursApiSchema,
    version: z.number().int().positive(),
  })
  .strict();
const preferenceMatrixApiSchema = z
  .object({ items: z.array(preferenceApiSchema).max(300), version: z.number().int().positive() })
  .strict();
const supportCategoryPageApiSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string().uuid(),
          key: z.string().min(1).max(64),
          name: z.string().min(1).max(120),
          sortOrder: z.number().int().nonnegative(),
          active: z.boolean(),
          version: z.number().int().positive(),
        })
        .strict(),
    ),
    nextCursor: z.string().max(512).nullable(),
    hasMore: z.boolean(),
  })
  .strict();
const attachmentApiSchema = z
  .object({
    id: z.string().uuid(),
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(100),
    sizeBytes: z.number().int().positive(),
    status: z.enum(['pending', 'clean', 'rejected', 'failed']),
  })
  .strict();
const supportMessageApiSchema = z
  .object({
    id: z.string().uuid(),
    senderType: z.enum(['customer', 'admin', 'system']),
    body: z.string().min(1).max(8192),
    attachments: z.array(attachmentApiSchema).max(6),
    createdAt: isoDateSchema,
  })
  .strict();
const ticketApiFields = {
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  subject: z.string().min(1).max(180),
  status: z.enum(['open', 'waiting_customer', 'waiting_support', 'resolved', 'closed']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  lastMessageAt: isoDateSchema,
  closedAt: nullableIsoDateSchema,
  version: z.number().int().positive(),
  createdAt: isoDateSchema,
};
const ticketSummaryApiSchema = z.object(ticketApiFields).strict();
const ticketDetailApiSchema = z
  .object({
    ...ticketApiFields,
    messages: z.array(supportMessageApiSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
    hasMore: z.boolean(),
  })
  .strict();
const ticketPageApiSchema = z
  .object({
    items: z.array(ticketSummaryApiSchema).max(100),
    nextCursor: z.string().max(512).nullable(),
    hasMore: z.boolean(),
  })
  .strict();
const contentPageApiSchema = z
  .object({
    items: z.array(
      z
        .object({
          key: z.string().min(1).max(96),
          type: z.enum(['article', 'faq', 'policy', 'announcement']),
          locale: z.enum(['ar', 'en']),
          title: z.string().min(1).max(180),
          body: z.string().min(1).max(65536),
          version: z.number().int().positive(),
          publishedAt: isoDateSchema,
        })
        .strict(),
    ),
    nextCursor: z.string().max(512).nullable(),
    hasMore: z.boolean(),
  })
  .strict();
const actionResultApiSchema = z
  .object({
    resourceId: z.string().min(1).max(128),
    outcome: z.enum(['success', 'conflict', 'forbidden', 'not_found', 'validation_error', 'accepted']),
    currentState: z.string().max(40).nullable(),
    version: z.number().int().positive().nullable(),
    requestId: z.string().max(128),
  })
  .strict();
const deviceRegistrationResultApiSchema = z
  .object({
    deviceId: z.string().uuid(),
    registeredAt: isoDateSchema,
    version: z.number().int().positive(),
  })
  .strict();

function dateValue(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) throw new EngagementApiError('unavailable');
  return parsed;
}

function notificationCategory(type: string): NotificationCategory {
  const parts = type.split('.');
  const direct = notificationCategorySchema.safeParse(parts[0]);
  if (direct.success) return direct.data;
  if (parts[0] === 'planning') {
    const planning = notificationCategorySchema.safeParse(parts[1]);
    if (planning.success && ['obligation', 'budget', 'savings'].includes(planning.data))
      return planning.data;
  }
  if (type === 'account.credit_card_payment_due') return 'obligation';
  throw new EngagementApiError('unavailable');
}

function notificationTarget(item: z.infer<typeof notificationApiSchema>): NotificationEvent['target'] {
  const kind = item.dataSafe.targetKind;
  const id = item.dataSafe.targetId;
  if (kind === undefined) return null;
  if (typeof kind !== 'string' || (id !== undefined && typeof id !== 'string'))
    throw new EngagementApiError('unavailable');
  if (kind === 'settings') return { kind: 'settings', key: 'notifications' };
  if (!id) return null;
  if (kind === 'account') return { kind, accountId: id };
  if (kind === 'transaction') return { kind, transactionId: id };
  if (kind === 'obligation') return { kind, obligationId: id };
  if (kind === 'goal') return { kind, goalId: id };
  if (kind === 'review') return { kind, reviewId: id };
  if (kind === 'security') return { kind, securityEventId: id };
  throw new EngagementApiError('unavailable');
}

function notificationFromApi(input: unknown): NotificationEvent {
  const item = notificationApiSchema.parse(input);
  return notificationEventSchema.parse({
    id: item.id,
    eventKey: `server:${item.id}:${item.version}`,
    category: notificationCategory(item.type),
    eventType: item.type,
    titleKey: item.title,
    bodyKey: item.body,
    messageValues: {},
    sensitivity: 'protected',
    target: notificationTarget(item),
    availableActions: item.actions.map((action) => ({
      kind: action.key,
      expiresAt: action.expiresAt === null ? null : dateValue(action.expiresAt),
      sourceVersion: action.key === 'undo' ? item.version : null,
    })),
    occurredAt: dateValue(item.createdAt),
    readAt: item.readAt === null ? null : dateValue(item.readAt),
    deletedAt: null,
    phoneStatus: 'not_requested',
    syncStatus: 'synced',
    safeFailure: null,
  });
}

function notificationScopes(id: string): readonly string[] {
  return [`notifications.detail.${id}`, 'notifications.list', 'notifications.unread'];
}

export function createLiveNotificationService(
  options: Parameters<typeof createEngagementApi>[0] & {
    preferences?: PreferenceStore;
    phone?: Pick<PhoneNotificationService, 'getPermission' | 'requestPermission' | 'registerCategories'>;
    pushRegistration?: () => Promise<PushDeviceRegistration | null>;
  } = {},
): CapabilityProviderHandle<NotificationService> {
  const {
    preferences = new AssistantNotificationsRepository(),
    phone = phoneNotificationService,
    pushRegistration = getPushDeviceRegistration,
    ...apiOptions
  } = options;
  const api = createEngagementApi(apiOptions);
  const available =
    Boolean(apiOptions.baseUrl ?? process.env.EXPO_PUBLIC_API_URL) &&
    (Boolean(apiOptions.token) || engagementTokenConfigured);
  let rawPreferences: z.infer<typeof preferenceMatrixApiSchema> | null = null;
  let localPreferenceVersion: number | null = null;
  const loadPreferences = async () =>
    (rawPreferences = preferenceMatrixApiSchema.parse(await api.getPreferences()));
  const loadLocalPreferences = async (): Promise<NotificationPreferences> => {
    try {
      const local = await preferences.getNotificationPreferences();
      localPreferenceVersion = local.version;
      return local;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'not_found') throw error;
      localPreferenceVersion = null;
      return createNotificationPreferences(Date.now());
    }
  };
  const performServerAction: NotificationService['executeAction'] = async (id, action, operationId) => {
    const raw = notificationApiSchema.parse(await api.getNotification(id));
    await api.actOnNotification(id, action, raw.version, operationId);
    return { value: { id, target: notificationFromApi(raw).target }, affectedScopes: notificationScopes(id) };
  };
  return {
    metadata: { id: 'phase11-notifications-http', capability: notificationServiceCapability.capability, majorVersion: notificationServiceCapability.majorVersion, kind: 'live', availability: available ? 'available' : 'unavailable' },
    async list(input) {
      const raw = notificationPageApiSchema.parse(
        await api.listNotifications({
          cursor: input.cursor,
          type: input.category,
          unread: input.unreadOnly,
          limit: input.pageSize,
        }),
      );
      const items = raw.items
        .map(notificationFromApi)
        .filter((item) => !input.category || item.category === input.category)
        .filter((item) => !input.unreadOnly || item.readAt === null);
      return {
        items,
        nextCursor: raw.nextCursor,
        total: input.unreadOnly ? raw.unreadCount : items.length,
      };
    },
    async get(id) { return notificationFromApi(await api.getNotification(id)); },
    async createFromSource() { throw new EngagementApiError('unavailable'); },
    async markRead(id, read) {
      const current = notificationApiSchema.parse(await api.getNotification(id));
      actionResultApiSchema.parse(
        await api.markNotificationRead(
          id,
          current.version,
          `notification:${id}:${current.version}:read:${read}`,
          read,
        ),
      );
      return {
        value: notificationFromApi(await api.getNotification(id)),
        affectedScopes: notificationScopes(id),
      };
    },
    async markAllRead(filter, operationId) {
      let cursor: string | undefined;
      let changed = 0;
      const seen = new Set<string>();
      do {
        const raw = notificationPageApiSchema.parse(
          await api.listNotifications({ ...filter, cursor, unread: true, limit: 100 }),
        );
        await Promise.all(
          raw.items.map((item) =>
            api.markNotificationRead(item.id, item.version, `${operationId}:${item.id}`),
          ),
        );
        changed += raw.items.length;
        if (!raw.hasMore || raw.nextCursor === null) break;
        if (seen.has(raw.nextCursor)) throw new EngagementApiError('unavailable');
        seen.add(raw.nextCursor);
        cursor = raw.nextCursor;
      } while (cursor);
      return { value: changed, affectedScopes: ['notifications.list', 'notifications.unread'] };
    },
    async delete() { throw new EngagementApiError('unavailable'); },
    async getPreferences() {
      const raw = await loadPreferences();
      const local = await loadLocalPreferences();
      const pushItems = raw.items.filter((item) => item.channel === 'push');
      const firstQuiet = raw.items[0]?.quietHours ?? local.quietHours;
      const categoryEnabled = { ...local.categoryEnabled };
      for (const category of notificationCategorySchema.options) {
        const matching = pushItems.filter((item) => notificationCategory(item.eventType) === category);
        if (matching.length > 0) categoryEnabled[category] = matching.every((item) => item.enabled);
      }
      return notificationPreferencesSchema.parse({
        ...local,
        version: raw.version,
        phoneEnabled: pushItems.some((item) => item.enabled),
        categoryEnabled,
        quietHours: firstQuiet,
      });
    },
    async savePreferences(input, expectedVersion, operationId) {
      const raw = rawPreferences ?? await loadPreferences();
      const items = raw.items.map((item) => ({
        ...item,
        enabled:
          item.channel === 'push'
            ? input.phoneEnabled && input.categoryEnabled[notificationCategory(item.eventType)]
            : item.enabled,
        quietHours: input.quietHours,
      }));
      const savedRemote = preferenceMatrixApiSchema.parse(
        await api.savePreferences(items, expectedVersion, operationId),
      );
      rawPreferences = savedRemote;
      const value = notificationPreferencesSchema.parse({
        ...input,
        version: savedRemote.version,
        updatedAt: Date.now(),
      });
      await preferences.saveNotificationPreferences(value, localPreferenceVersion);
      localPreferenceVersion = value.version;
      return { value, affectedScopes: ['notifications.preferences'] };
    },
    async refreshPermission() { return phone.getPermission(); },
    async requestPermissionAfterEducation() {
      const permission = await phone.requestPermission();
      if (permission !== 'granted') return permission;
      await phone.registerCategories();
      const registration = await pushRegistration();
      if (!registration) return 'unavailable';
      const tokenDigest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        registration.pushToken,
      );
      const key = `notification-device:${registration.deviceFingerprint}:${tokenDigest}`;
      deviceRegistrationResultApiSchema.parse(await api.registerDevice(registration, key));
      return 'granted';
    },
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
  if (
    value === 'waiting_support' ||
    value === 'resolved' ||
    value === 'closed' ||
    value === 'open'
  )
    return value;
  throw new EngagementApiError('unavailable');
}

function supportTicketFromApi(input: unknown): SupportTicket {
  const item = z.union([ticketDetailApiSchema, ticketSummaryApiSchema]).parse(input);
  const messages = 'messages' in item ? item.messages : [];
  const first = messages[0];
  return supportTicketSchema.parse({
    id: item.id,
    reference: item.id,
    category: item.categoryId,
    subject: item.subject,
    description: first?.body ?? item.subject,
    context: null,
    status: supportStatus(item.status),
    messages: messages.map((message) => ({
      id: message.id,
      author: message.senderType === 'customer' ? 'user' : 'support',
      body: message.body,
      attachments: message.attachments,
      createdAt: dateValue(message.createdAt),
    })),
    createdAt: dateValue(item.createdAt),
    updatedAt: dateValue(item.lastMessageAt),
    rating: null,
    version: item.version,
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
      const raw = contentPageApiSchema.parse(await api.listContent(currentLocale(), type, query));
      return raw.items.map((item): SupportArticle => ({ id: item.key, kind: item.type === 'faq' ? 'faq' : item.type === 'announcement' ? 'whats_new' : 'help', titleKey: item.title, bodyKey: item.body, searchTerms: [item.title, item.body], category: item.type, version: String(item.version), publishedAt: dateValue(item.publishedAt) }));
    },
    async listTickets(cursor) {
      const raw = ticketPageApiSchema.parse(await api.listTickets(cursor));
      const items = raw.items.map(supportTicketFromApi);
      return { items, nextCursor: raw.nextCursor, total: items.length };
    },
    async getTicket(id) {
      let cursor: string | undefined;
      let first: z.infer<typeof ticketDetailApiSchema> | null = null;
      const messages: z.infer<typeof supportMessageApiSchema>[] = [];
      const seenCursors = new Set<string>();
      const seenMessages = new Set<string>();
      do {
        const page = ticketDetailApiSchema.parse(await api.getTicket(id, cursor));
        first ??= page;
        if (page.id !== first.id || page.version !== first.version)
          throw new EngagementApiError('conflict');
        for (const message of page.messages) {
          if (seenMessages.has(message.id)) throw new EngagementApiError('unavailable');
          seenMessages.add(message.id);
          messages.push(message);
        }
        if (!page.hasMore || page.nextCursor === null) break;
        if (seenCursors.has(page.nextCursor)) throw new EngagementApiError('unavailable');
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      } while (cursor);
      if (!first) throw new EngagementApiError('unavailable');
      return supportTicketFromApi({ ...first, messages, nextCursor: null, hasMore: false });
    },
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
        const categories = supportCategoryPageApiSchema.parse(await api.listSupportCategories());
        const category = categories.items.find((item) => item.key === draft.category);
        if (!category) throw new EngagementApiError('unavailable');
        const created = actionResultApiSchema.parse(
          await api.createTicket(
            { categoryId: category.id, subject: draft.subject, message: draft.description },
            operationId,
          ),
        );
        ticketId = created.resourceId;
      }
      await drafts.discardDraft(id);
      const value = supportOperation(operationId, kind, ticketId, id);
      return { value, affectedScopes: ['support.tickets', `support.draft.${id}`] };
    },
    async reply(ticketId, input: SupportReplyInput, expectedVersion, operationId) {
      await api.addMessage(ticketId, { body: input.description, attachmentUploadIds: input.attachmentUploadIds ?? [], expectedVersion }, operationId);
      return { value: supportOperation(operationId, 'reply', ticketId, null), affectedScopes: ['support.tickets', `support.ticket.${ticketId}`] };
    },
    async rate() { throw new EngagementApiError('unavailable'); }
  };
}
