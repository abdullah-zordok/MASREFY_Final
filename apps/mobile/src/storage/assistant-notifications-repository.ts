import {
  assistantActionPreviewSchema,
  assistantConsentSchema,
  assistantConversationSchema,
  assistantResponseSchema,
  type AssistantActionPreview,
  type AssistantConsent,
  type AssistantConversation,
  type AssistantResponse
} from '@/domain/assistant';
import {
  notificationEventSchema,
  notificationPreferencesSchema,
  type NotificationEvent,
  type NotificationListQuery,
  type NotificationPreferences,
  type Page
} from '@/domain/notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';

type PayloadRow = { id?: string; payload: string };
type ConversationQuery = { cursor?: string; pageSize?: number; status?: AssistantConversation['status'] };

export class AssistantNotificationsRepository {
  async saveNotification(input: NotificationEvent): Promise<NotificationEvent> {
    const notification = notificationEventSchema.parse(input);
    const database = await openDatabase();
    let result = notification;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const existing = await transaction.getFirstAsync<PayloadRow>('SELECT payload FROM notifications WHERE event_key = ?', notification.eventKey);
      if (existing) {
        result = parse(existing, notificationEventSchema);
        return;
      }
      await insertNotification(transaction, notification, false);
    });
    return result;
  }

  async updateNotificationPhoneStatus(
    id: string,
    fields: Pick<NotificationEvent, 'phoneStatus' | 'syncStatus' | 'safeFailure'>
  ): Promise<NotificationEvent> {
    const database = await openDatabase();
    let result: NotificationEvent | null = null;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const current = await requirePayload(transaction, 'notifications', id, notificationEventSchema);
      result = notificationEventSchema.parse({ ...current, ...fields });
      await insertNotification(transaction, result, true);
    });
    return result as unknown as NotificationEvent;
  }

  async upsertNotification(input: NotificationEvent): Promise<NotificationEvent> {
    const notification = notificationEventSchema.parse(input);
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      await insertNotification(transaction, notification, true);
    });
    return notification;
  }

  async getNotification(id: string): Promise<NotificationEvent> {
    return requirePayload(await openDatabase(), 'notifications', id, notificationEventSchema);
  }

  async listNotifications(input: NotificationListQuery = {}): Promise<Page<NotificationEvent>> {
    const database = await openDatabase();
    const pageSize = normalizedPageSize(input.pageSize);
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const values = (await database.getAllAsync<PayloadRow>('SELECT payload FROM notifications'))
      .map((row) => parse(row, notificationEventSchema))
      .filter((item) => item.deletedAt === null)
      .filter((item) => !input.category || item.category === input.category)
      .filter((item) => !input.unreadOnly || item.readAt === null)
      .sort((a, b) => b.occurredAt - a.occurredAt || b.id.localeCompare(a.id));
    return pageValues(values, pageSize, cursor, (item) => [item.occurredAt, item.id]);
  }

  async markNotificationRead(id: string, readAt: number | null): Promise<NotificationEvent> {
    const database = await openDatabase();
    let result: NotificationEvent | null = null;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const current = await requirePayload(transaction, 'notifications', id, notificationEventSchema);
      result = notificationEventSchema.parse({ ...current, readAt, syncStatus: 'pending' });
      await insertNotification(transaction, result, true);
    });
    return result as unknown as NotificationEvent;
  }

  async markAllNotificationsRead(filter: NotificationListQuery, readAt: number): Promise<number> {
    const database = await openDatabase();
    let changed = 0;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const rows = await transaction.getAllAsync<PayloadRow>('SELECT payload FROM notifications');
      for (const row of rows) {
        const current = parse(row, notificationEventSchema);
        if (current.deletedAt !== null || current.readAt !== null || (filter.category && current.category !== filter.category) || (filter.unreadOnly && current.readAt !== null)) continue;
        await insertNotification(transaction, { ...current, readAt, syncStatus: 'pending' }, true);
        changed += 1;
      }
    });
    return changed;
  }

  async tombstoneNotification(id: string, deletedAt: number): Promise<NotificationEvent> {
    const database = await openDatabase();
    let result: NotificationEvent | null = null;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const current = await requirePayload(transaction, 'notifications', id, notificationEventSchema);
      result = notificationEventSchema.parse({ ...current, deletedAt, syncStatus: 'pending' });
      await insertNotification(transaction, result, true);
    });
    return result as unknown as NotificationEvent;
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    const row = await (await openDatabase()).getFirstAsync<PayloadRow>(
      'SELECT payload FROM notification_preferences WHERE id = ?',
      'singleton'
    );
    if (!row) throw new Error('not_found');
    const value = JSON.parse(row.payload) as Record<string, unknown>;
    const categories = value.categoryEnabled;
    return notificationPreferencesSchema.parse({
      ...value,
      categoryEnabled: {
        app_inactivity: true,
        financial_activity: true,
        ...(categories && typeof categories === 'object' ? categories : {})
      }
    });
  }

  async saveNotificationPreferences(input: NotificationPreferences, expectedVersion: number | null): Promise<NotificationPreferences> {
    const value = notificationPreferencesSchema.parse(input);
    await saveVersionedSingleton('notification_preferences', value, expectedVersion, value.updatedAt);
    return value;
  }

  async getAssistantConsent(): Promise<AssistantConsent> {
    return requirePayload(await openDatabase(), 'assistant_consent', 'singleton', assistantConsentSchema);
  }

  async saveAssistantConsent(input: AssistantConsent, expectedVersion: number | null): Promise<AssistantConsent> {
    const value = assistantConsentSchema.parse(input);
    await saveVersionedSingleton('assistant_consent', value, expectedVersion, Date.now(), value.status);
    return value;
  }

  async saveConversation(input: AssistantConversation, expectedVersion: number | null = null): Promise<AssistantConversation> {
    const value = assistantConversationSchema.parse(input);
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const row = await transaction.getFirstAsync<PayloadRow>('SELECT payload FROM assistant_conversations WHERE id = ?', value.id);
      checkVersion(row ? parse(row, assistantConversationSchema).version : null, expectedVersion, value.version);
      await transaction.runAsync(
        'INSERT INTO assistant_conversations (id, payload, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, updated_at = excluded.updated_at',
        value.id, JSON.stringify(value), value.status, value.updatedAt
      );
    });
    return value;
  }

  async listConversations(input: ConversationQuery = {}): Promise<Page<AssistantConversation>> {
    const database = await openDatabase();
    const pageSize = normalizedPageSize(input.pageSize);
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const values = (await database.getAllAsync<PayloadRow>('SELECT payload FROM assistant_conversations'))
      .map((row) => parse(row, assistantConversationSchema))
      .filter((item) => !input.status || item.status === input.status)
      .sort((a, b) => b.updatedAt - a.updatedAt || b.id.localeCompare(a.id));
    return pageValues(values, pageSize, cursor, (item) => [item.updatedAt, item.id]);
  }

  async saveResponse(input: AssistantResponse): Promise<AssistantResponse> {
    const value = assistantResponseSchema.parse(input);
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      if (await transaction.getFirstAsync<PayloadRow>('SELECT payload FROM assistant_responses WHERE id = ?', value.id)) throw new Error('immutable');
      await requirePayload(transaction, 'assistant_conversations', value.conversationId, assistantConversationSchema);
      await transaction.runAsync('INSERT INTO assistant_responses (id, payload, conversation_id, created_at) VALUES (?, ?, ?, ?)', value.id, JSON.stringify(value), value.conversationId, value.createdAt);
    });
    return value;
  }

  async getResponse(id: string): Promise<AssistantResponse> {
    return requirePayload(await openDatabase(), 'assistant_responses', id, assistantResponseSchema);
  }

  async listResponses(conversationId: string, cursor?: string, pageSizeInput?: number): Promise<Page<AssistantResponse>> {
    const database = await openDatabase();
    const pageSize = normalizedPageSize(pageSizeInput);
    const decoded = cursor ? decodeCursor(cursor) : null;
    const values = (await database.getAllAsync<PayloadRow>('SELECT payload FROM assistant_responses'))
      .map((row) => parse(row, assistantResponseSchema))
      .filter((item) => item.conversationId === conversationId)
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    return pageValues(values, pageSize, decoded, (item) => [item.createdAt, item.id]);
  }

  async deleteConversation(id: string, expectedVersion: number, deletedAt: number): Promise<AssistantConversation> {
    const database = await openDatabase();
    let result: AssistantConversation | null = null;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const current = await requirePayload(transaction, 'assistant_conversations', id, assistantConversationSchema);
      if (current.version !== expectedVersion) throw new Error('conflict');
      result = assistantConversationSchema.parse({ ...current, status: 'deleted', updatedAt: deletedAt, version: current.version + 1, lastResponseId: null });
      await transaction.runAsync(
        'INSERT INTO assistant_conversations (id, payload, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, updated_at = excluded.updated_at',
        result.id, JSON.stringify(result), result.status, result.updatedAt
      );
      await transaction.runAsync("DELETE FROM assistant_action_previews WHERE response_id IN (SELECT id FROM assistant_responses WHERE conversation_id = ?) AND status IN ('draft', 'ready', 'cancelled', 'expired')", id);
      await transaction.runAsync('DELETE FROM assistant_responses WHERE conversation_id = ?', id);
    });
    return result as unknown as AssistantConversation;
  }

  async getActionPreview(id: string): Promise<AssistantActionPreview> {
    return requirePayload(await openDatabase(), 'assistant_action_previews', id, assistantActionPreviewSchema);
  }

  async getActionPreviewByOperationId(operationId: string): Promise<AssistantActionPreview | null> {
    const row = await (await openDatabase()).getFirstAsync<PayloadRow>('SELECT payload FROM assistant_action_previews WHERE operation_id = ?', operationId);
    return row ? parse(row, assistantActionPreviewSchema) : null;
  }

  async saveActionPreview(input: AssistantActionPreview, expectedVersion: number | null): Promise<AssistantActionPreview> {
    const value = assistantActionPreviewSchema.parse(input);
    const database = await openDatabase();
    let result = value;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      if (value.operationId) {
        const replay = await transaction.getFirstAsync<PayloadRow>('SELECT id, payload FROM assistant_action_previews WHERE operation_id = ?', value.operationId);
        if (replay) {
          result = parse(replay, assistantActionPreviewSchema);
          return;
        }
      }
      const row = await transaction.getFirstAsync<PayloadRow>('SELECT payload FROM assistant_action_previews WHERE id = ?', value.id);
      const current = row ? parse(row, assistantActionPreviewSchema) : null;
      if (current?.operationId) throw new Error('operation_immutable');
      checkVersion(current?.version ?? null, expectedVersion, value.version);
      await requirePayload(transaction, 'assistant_responses', value.responseId, assistantResponseSchema);
      await persistActionPreview(transaction, value);
    });
    return result;
  }

  async completeActionPreview(id: string, operationId: string, resultReference: string, expectedVersion: number): Promise<AssistantActionPreview> {
    const database = await openDatabase();
    let completed!: AssistantActionPreview;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      const current = await requirePayload(transaction, 'assistant_action_previews', id, assistantActionPreviewSchema);
      if (current.status === 'succeeded') {
        if (current.operationId === operationId && current.resultReference === resultReference) { completed = current; return; }
        throw new Error('result_immutable');
      }
      if (current.operationId !== operationId || current.status !== 'confirming') throw new Error('operation_immutable');
      if (current.version !== expectedVersion) throw new Error('conflict');
      completed = assistantActionPreviewSchema.parse({ ...current, status: 'succeeded', resultReference, version: current.version + 1 });
      await persistActionPreview(transaction, completed);
    });
    return completed;
  }
}

async function saveVersionedSingleton<T extends { version: number }>(table: 'notification_preferences' | 'assistant_consent', value: T, expectedVersion: number | null, updatedAt: number, status?: string): Promise<void> {
  const database = await openDatabase();
  await runExclusiveDatabaseTransaction(database, async (transaction) => {
    const row = await transaction.getFirstAsync<PayloadRow>(`SELECT payload FROM ${table} WHERE id = ?`, 'singleton');
    checkVersion(row ? (JSON.parse(row.payload) as T).version : null, expectedVersion, value.version);
    const columns = status === undefined ? 'id, payload, updated_at' : 'id, payload, status, updated_at';
    const update = status === undefined ? 'payload = excluded.payload, updated_at = excluded.updated_at' : 'payload = excluded.payload, status = excluded.status, updated_at = excluded.updated_at';
    const values = status === undefined ? ['singleton', JSON.stringify(value), updatedAt] : ['singleton', JSON.stringify(value), status, updatedAt];
    await transaction.runAsync(`INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${update}`, ...values);
  });
}

function checkVersion(current: number | null, expected: number | null, next: number): void {
  if (current !== expected || next !== (current ?? 0) + 1) throw new Error('conflict');
}

async function requirePayload<T>(database: Pick<SQLiteDatabase, 'getFirstAsync'>, table: string, id: string, schema: Parser<T>): Promise<T> {
  const row = await database.getFirstAsync<PayloadRow>(`SELECT payload FROM ${table} WHERE id = ?`, id);
  if (!row) throw new Error('not_found');
  return parse(row, schema);
}

function insertNotification(database: Pick<SQLiteDatabase, 'runAsync'>, value: NotificationEvent, upsert: boolean): Promise<unknown> {
  return database.runAsync(
    `INSERT INTO notifications (id, payload, event_key, category, read_at, deleted_at, sync_status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)${upsert ? ' ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, event_key = excluded.event_key, category = excluded.category, read_at = excluded.read_at, deleted_at = excluded.deleted_at, sync_status = excluded.sync_status, occurred_at = excluded.occurred_at' : ''}`,
    value.id, JSON.stringify(value), value.eventKey, value.category, value.readAt, value.deletedAt, value.syncStatus, value.occurredAt
  );
}

function persistActionPreview(database: Pick<SQLiteDatabase, 'runAsync'>, preview: AssistantActionPreview): Promise<unknown> {
  return database.runAsync(
    'INSERT INTO assistant_action_previews (id, payload, response_id, operation_id, status, expires_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, response_id = excluded.response_id, operation_id = excluded.operation_id, status = excluded.status, expires_at = excluded.expires_at',
    preview.id, JSON.stringify(preview), preview.responseId, preview.operationId, preview.status, preview.expiresAt
  );
}

type Parser<T> = { parse(value: unknown): T };

function parse<T>(row: PayloadRow, schema: Parser<T>): T {
  return schema.parse(JSON.parse(row.payload));
}

function pageValues<T>(values: T[], pageSize: number, cursor: [number, string] | null, cursorOf: (item: T) => [number, string]): Page<T> {
  // ponytail: histories are capped at the 1,000-row validation scale; push cursor filtering into SQL if retention becomes unbounded.
  const start = cursor ? values.findIndex((item) => { const value = cursorOf(item); return value[0] < cursor[0] || (value[0] === cursor[0] && value[1] < cursor[1]); }) : 0;
  const items = (start < 0 ? [] : values.slice(start, start + pageSize));
  return { items, total: values.length, nextCursor: start >= 0 && start + pageSize < values.length && items.length ? encodeCursor(cursorOf(items[items.length - 1])) : null };
}

function normalizedPageSize(value?: number): number {
  if (value === undefined) return 25;
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('invalid_page_size');
  return value;
}

function encodeCursor(cursor: [number, string]): string {
  return encodeURIComponent(JSON.stringify(cursor));
}

function decodeCursor(value: string): [number, string] {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value));
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isInteger(parsed[0]) || typeof parsed[1] !== 'string') throw new Error();
    return [parsed[0], parsed[1]];
  } catch {
    throw new Error('invalid_cursor');
  }
}
