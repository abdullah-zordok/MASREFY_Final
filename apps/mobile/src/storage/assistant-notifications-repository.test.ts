import type { AssistantActionPreview, AssistantConsent, AssistantConversation, AssistantResponse } from '@/domain/assistant';
import { createNotificationPreferences, type NotificationEvent } from '@/domain/notifications';

type Row = Record<string, unknown>;

class StatefulSqliteFake {
  private readonly rows = new Map<string, Row[]>();

  constructor() {
    for (const table of ['notifications', 'notification_preferences', 'assistant_consent', 'assistant_conversations', 'assistant_responses', 'assistant_action_previews', 'finance_transactions']) this.rows.set(table, []);
  }

  seed(table: string, rows: Row[]): void {
    this.rows.set(table, rows.map((row) => ({ ...row })));
  }

  read(table: string): Row[] {
    return (this.rows.get(table) ?? []).map((row) => ({ ...row }));
  }

  async withExclusiveTransactionAsync(operation: (database: this) => Promise<void>): Promise<void> {
    const snapshot = new Map([...this.rows].map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]));
    try {
      await operation(this);
    } catch (error) {
      this.rows.clear();
      snapshot.forEach((rows, table) => this.rows.set(table, rows));
      throw error;
    }
  }

  async runAsync(sql: string, ...values: unknown[]): Promise<{ changes: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const insert = normalized.match(/^INSERT INTO (\w+) \(([^)]+)\)/);
    if (insert) {
      const [, table, rawColumns] = insert;
      const columns = rawColumns.split(',').map((column) => column.trim());
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      const rows = this.rows.get(table) ?? [];
      const existingIndex = rows.findIndex((item) => item.id === row.id);
      const uniqueColumn = table === 'notifications' ? 'event_key' : table === 'assistant_action_previews' && row.operation_id !== null ? 'operation_id' : null;
      if (uniqueColumn && rows.some((item, index) => index !== existingIndex && item[uniqueColumn] === row[uniqueColumn])) throw new Error(`UNIQUE constraint failed: ${table}.${uniqueColumn}`);
      if (normalized.includes('ON CONFLICT(id) DO UPDATE') && existingIndex >= 0) rows[existingIndex] = row;
      else if (existingIndex >= 0) throw new Error(`UNIQUE constraint failed: ${table}.id`);
      else rows.push(row);
      this.rows.set(table, rows);
      return { changes: 1 };
    }

    if (normalized.startsWith('UPDATE notifications SET')) {
      const [payload, readAt, syncStatus, id] = values;
      return { changes: this.update('notifications', (row) => row.id === id, { payload, read_at: readAt, sync_status: syncStatus }) };
    }
    if (normalized.startsWith('UPDATE assistant_conversations SET')) {
      const [payload, status, updatedAt, id] = values;
      return { changes: this.update('assistant_conversations', (row) => row.id === id, { payload, status, updated_at: updatedAt }) };
    }
    if (normalized.startsWith('DELETE FROM assistant_action_previews')) {
      const responseIds = new Set(this.read('assistant_responses').filter((row) => row.conversation_id === values[0]).map((row) => row.id));
      const unused = new Set(['draft', 'ready', 'cancelled', 'expired']);
      return { changes: this.remove('assistant_action_previews', (row) => responseIds.has(row.response_id) && (!normalized.includes('status IN') || unused.has(row.status as string))) };
    }
    if (normalized.startsWith('DELETE FROM assistant_responses')) return { changes: this.remove('assistant_responses', (row) => row.conversation_id === values[0]) };
    throw new Error(`unsupported SQL: ${normalized}`);
  }

  async getFirstAsync<T extends Row>(sql: string, ...values: unknown[]): Promise<T | null> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT COUNT(*) AS total FROM notifications')) {
      return { total: this.filterNotifications(normalized, values).length } as unknown as T;
    }
    const table = normalized.match(/FROM (\w+)/)?.[1];
    if (!table) throw new Error(`unsupported SQL: ${normalized}`);
    let rows = this.read(table);
    if (normalized.includes('WHERE id = ?')) rows = rows.filter((row) => row.id === values[0]);
    else if (normalized.includes('WHERE event_key = ?')) rows = rows.filter((row) => row.event_key === values[0]);
    else if (normalized.includes('WHERE operation_id = ?')) rows = rows.filter((row) => row.operation_id === values[0]);
    return (rows[0] as T | undefined) ?? null;
  }

  async getAllAsync<T extends Row>(sql: string, ...values: unknown[]): Promise<T[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const table = normalized.match(/FROM (\w+)/)?.[1];
    if (!table) throw new Error(`unsupported SQL: ${normalized}`);
    let rows = table === 'notifications' ? this.filterNotifications(normalized, values) : this.read(table);
    if (table === 'assistant_conversations') {
      let index = 0;
      if (normalized.includes('status = ?')) rows = rows.filter((row) => row.status === values[index++]);
      if (normalized.includes('updated_at < ?')) {
        const updatedAt = values[index++] as number;
        const id = values[index++] as string;
        rows = rows.filter((row) => (row.updated_at as number) < updatedAt || (row.updated_at === updatedAt && (row.id as string) < id));
      }
      rows.sort((a, b) => (b.updated_at as number) - (a.updated_at as number) || (b.id as string).localeCompare(a.id as string));
    }
    if (table === 'assistant_responses') {
      let index = 0;
      if (normalized.includes('conversation_id = ?')) rows = rows.filter((row) => row.conversation_id === values[index++]);
      if (normalized.includes('created_at < ?')) {
        const createdAt = values[index++] as number;
        const id = values[index++] as string;
        rows = rows.filter((row) => (row.created_at as number) < createdAt || (row.created_at === createdAt && (row.id as string) < id));
      }
      rows.sort((a, b) => (b.created_at as number) - (a.created_at as number) || (b.id as string).localeCompare(a.id as string));
    }
    const limit = normalized.includes('LIMIT ?') ? (values[values.length - 1] as number) : undefined;
    return (limit === undefined ? rows : rows.slice(0, limit)) as T[];
  }

  private filterNotifications(sql: string, values: unknown[]): Row[] {
    let index = 0;
    let rows = this.read('notifications').filter((row) => row.deleted_at === null);
    if (sql.includes('category = ?')) rows = rows.filter((row) => row.category === values[index++]);
    if (sql.includes('read_at IS NULL')) rows = rows.filter((row) => row.read_at === null);
    if (sql.includes('occurred_at < ?')) {
      const occurredAt = values[index++] as number;
      const id = values[index++] as string;
      rows = rows.filter((row) => (row.occurred_at as number) < occurredAt || (row.occurred_at === occurredAt && (row.id as string) < id));
    }
    rows.sort((a, b) => (b.occurred_at as number) - (a.occurred_at as number) || (b.id as string).localeCompare(a.id as string));
    return rows;
  }

  private update(table: string, predicate: (row: Row) => boolean, patch: Row): number {
    let changes = 0;
    this.rows.set(table, this.read(table).map((row) => predicate(row) ? (changes++, { ...row, ...patch }) : row));
    return changes;
  }

  private remove(table: string, predicate: (row: Row) => boolean): number {
    const rows = this.read(table);
    const kept = rows.filter((row) => !predicate(row));
    this.rows.set(table, kept);
    return rows.length - kept.length;
  }
}

let mockDatabase: StatefulSqliteFake;

jest.mock('./database', () => ({
  openDatabase: jest.fn(async () => mockDatabase),
  runExclusiveDatabaseTransaction: jest.fn(async (db: StatefulSqliteFake, operation: (transaction: StatefulSqliteFake) => Promise<void>) => db.withExclusiveTransactionAsync(operation))
}));

const { AssistantNotificationsRepository } = require('./assistant-notifications-repository') as typeof import('./assistant-notifications-repository');

const notification = (id: string, eventKey: string, category: NotificationEvent['category'], occurredAt: number): NotificationEvent => ({
  id, eventKey, category, eventType: 'created', titleKey: 'notification.title', bodyKey: 'notification.body', messageValues: {}, sensitivity: 'protected', target: null, availableActions: [], occurredAt, readAt: null, deletedAt: null, phoneStatus: 'not_requested', syncStatus: 'synced', safeFailure: null
});

const conversation = (id: string, updatedAt: number): AssistantConversation => ({ id, title: id, status: 'active', createdAt: 1, updatedAt, lastResponseId: null, version: 1 });

const response = (id: string, conversationId: string, createdAt: number): AssistantResponse => ({
  id, conversationId, question: `question-${id}`, responseType: 'direct', blocks: [{ label: 'fact', key: 'assistant.fact', values: {} }], period: null, dataAsOf: createdAt,
  snapshot: { sources: [{ kind: 'transaction', id: 'tx-source', version: 1 }], values: [], completeness: { confirmed: 1, reviewRequired: 0, conflicts: 0, reasons: [] }, reportReference: null },
  limitations: [], proposedActionIds: [], feedback: null, createdAt
});

const preview = (id: string, responseId: string, operationId: string | null, version = 1): AssistantActionPreview => ({
  id, responseId, kind: 'open_transactions', input: {}, affectedDestination: { kind: 'transactions' }, sourceVersions: [], status: operationId ? 'confirming' : 'ready', operationId, expiresAt: null, resultReference: null, safeFailure: null, version
});

const succeededPreview = (id: string, responseId: string, operationId: string, resultReference: string, version: number): AssistantActionPreview => ({
  ...preview(id, responseId, operationId, version), status: 'succeeded', resultReference
});

beforeEach(() => {
  mockDatabase = new StatefulSqliteFake();
});

test('fills reminder categories when loading an older preference document', async () => {
  mockDatabase.seed('notification_preferences', [{
    id: 'singleton',
    payload: JSON.stringify({
      ...createNotificationPreferences(1),
      categoryEnabled: {
        transaction: true,
        income: true,
        obligation: true,
        budget: true,
        salary: true,
        savings: true,
        report: true,
        assistant: true,
        security: true,
        system: true,
      },
    }),
  }]);

  await expect(new AssistantNotificationsRepository().getNotificationPreferences())
    .resolves.toMatchObject({
      categoryEnabled: { app_inactivity: true, financial_activity: true },
    });
});

test('persists notification pages in stable occurred-at and id order', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveNotification(notification('n-old', 'event-old', 'system', 1));
  await repository.saveNotification(notification('n-a', 'event-a', 'system', 2));
  await repository.saveNotification(notification('n-b', 'event-b', 'system', 2));

  const first = await new AssistantNotificationsRepository().listNotifications({ pageSize: 2 });
  const second = await repository.listNotifications({ pageSize: 2, cursor: first.nextCursor ?? undefined });

  expect(first).toMatchObject({ total: 3, items: [{ id: 'n-b' }, { id: 'n-a' }] });
  expect(first.nextCursor).not.toBeNull();
  expect(second).toMatchObject({ total: 3, items: [{ id: 'n-old' }], nextCursor: null });
});

test('deduplicates event keys, marks only the visible filter, and tombstones without touching source rows', async () => {
  mockDatabase.seed('finance_transactions', [{ id: 'tx-source', payload: '{"amountMinor":500}' }]);
  const repository = new AssistantNotificationsRepository();
  const original = await repository.saveNotification(notification('n-1', 'same-source-event', 'budget', 1));
  expect(await repository.saveNotification(notification('n-duplicate', 'same-source-event', 'budget', 2))).toEqual(original);
  await repository.saveNotification(notification('n-2', 'event-2', 'budget', 3));
  await repository.saveNotification(notification('n-3', 'event-3', 'security', 4));

  expect(await repository.markAllNotificationsRead({ category: 'budget', unreadOnly: true }, 10)).toBe(2);
  expect((await repository.listNotifications({ unreadOnly: true })).items.map((item) => item.id)).toEqual(['n-3']);
  expect(await repository.tombstoneNotification('n-1', 11)).toMatchObject({ id: 'n-1', deletedAt: 11, syncStatus: 'pending' });
  expect((await repository.listNotifications({ category: 'budget' })).items.map((item) => item.id)).toEqual(['n-2']);
  expect(mockDatabase.read('finance_transactions')).toEqual([{ id: 'tx-source', payload: '{"amountMinor":500}' }]);
});

test('marks one notification read without changing its target', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveNotification({ ...notification('n-1', 'event-1', 'transaction', 1), target: { kind: 'transaction', transactionId: 'tx-1' } });

  expect(await repository.markNotificationRead('n-1', 10)).toMatchObject({ id: 'n-1', readAt: 10, target: { kind: 'transaction', transactionId: 'tx-1' } });
});

test('persists immutable response snapshots and rejects replacement by id', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveConversation(conversation('c-1', 1));
  await repository.saveResponse(response('r-1', 'c-1', 2));

  await expect(repository.saveResponse({ ...response('r-1', 'c-1', 2), question: 'changed' })).rejects.toThrow('immutable');
  const stored = await new AssistantNotificationsRepository().getResponse('r-1');
  expect(stored.question).toBe('question-r-1');
  expect(Object.isFrozen(stored.snapshot)).toBe(true);
  expect(Reflect.set(stored.snapshot.completeness, 'confirmed', 9)).toBe(false);
});

test('conversation deletion removes responses and unused previews but preserves successful operation evidence', async () => {
  mockDatabase.seed('finance_transactions', [{ id: 'tx-source', payload: '{"amountMinor":500}' }]);
  const repository = new AssistantNotificationsRepository();
  await repository.saveConversation(conversation('c-1', 2));
  await repository.saveConversation(conversation('c-2', 1));
  await repository.saveResponse(response('r-1', 'c-1', 3));
  await repository.saveResponse(response('r-2', 'c-2', 4));
  await repository.saveActionPreview(preview('p-unused', 'r-1', null), null);
  await repository.saveActionPreview(succeededPreview('p-succeeded', 'r-1', 'operation-succeeded', 'budget-1', 1), null);

  await repository.deleteConversation('c-1', 1, 5);

  expect((await repository.listConversations({ status: 'active' })).items.map((item) => item.id)).toEqual(['c-2']);
  await expect(repository.getResponse('r-1')).rejects.toThrow('not_found');
  expect((await repository.listResponses('c-2')).items.map((item) => item.id)).toEqual(['r-2']);
  await expect(repository.getActionPreview('p-unused')).rejects.toThrow('not_found');
  expect(await repository.getActionPreview('p-succeeded')).toMatchObject({ operationId: 'operation-succeeded', resultReference: 'budget-1', status: 'succeeded' });
  expect(mockDatabase.read('finance_transactions')).toEqual([{ id: 'tx-source', payload: '{"amountMinor":500}' }]);
});

test('checks preview versions and replays a unique operation result', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveConversation(conversation('c-1', 1));
  await repository.saveResponse(response('r-1', 'c-1', 2));
  await repository.saveActionPreview(preview('p-1', 'r-1', null), null);

  await expect(repository.saveActionPreview(preview('p-1', 'r-1', 'operation-1', 2), 9)).rejects.toThrow('conflict');
  const confirming = await repository.saveActionPreview(preview('p-1', 'r-1', 'operation-1', 2), 1);
  const replay = await repository.saveActionPreview(preview('p-replay', 'r-1', 'operation-1', 1), null);
  const restartReplay = await new AssistantNotificationsRepository().saveActionPreview(preview('p-restart', 'r-1', 'operation-1', 1), null);

  expect(confirming.version).toBe(2);
  expect(replay).toEqual(confirming);
  expect(restartReplay).toEqual(confirming);
  expect(mockDatabase.read('assistant_action_previews')).toHaveLength(1);
});

test('locks an assigned operation id, replays the same preview before version checks, and preserves successful result evidence', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveConversation(conversation('c-1', 1));
  await repository.saveResponse(response('r-1', 'c-1', 2));
  await repository.saveActionPreview(preview('p-1', 'r-1', null), null);
  const confirming = await repository.saveActionPreview(preview('p-1', 'r-1', 'operation-1', 2), 1);

  expect(await repository.saveActionPreview(preview('p-1', 'r-1', 'operation-1', 99), 98)).toEqual(confirming);
  await expect(repository.saveActionPreview(preview('p-1', 'r-1', 'operation-2', 3), 2)).rejects.toThrow('operation_immutable');

  const succeeded = await repository.completeActionPreview('p-1', 'operation-1', 'budget-1', 2);
  expect(await repository.saveActionPreview(succeededPreview('p-1', 'r-1', 'operation-1', 'budget-changed', 99), 98)).toEqual(succeeded);
  await expect(repository.completeActionPreview('p-1', 'operation-1', 'budget-changed', 3)).rejects.toThrow('result_immutable');
});

test('pages conversations with timestamp ties using stable id cursors without duplicates', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveConversation(conversation('c-old', 9));
  await repository.saveConversation(conversation('c-a', 10));
  await repository.saveConversation(conversation('c-b', 10));

  const first = await repository.listConversations({ pageSize: 2 });
  const second = await repository.listConversations({ pageSize: 2, cursor: first.nextCursor ?? undefined });

  expect(first.items.map((item) => item.id)).toEqual(['c-b', 'c-a']);
  expect(second.items.map((item) => item.id)).toEqual(['c-old']);
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
  expect(second.nextCursor).toBeNull();
});

test('pages responses with timestamp ties using stable id cursors without duplicates', async () => {
  const repository = new AssistantNotificationsRepository();
  await repository.saveConversation(conversation('c-1', 1));
  await repository.saveResponse(response('r-old', 'c-1', 9));
  await repository.saveResponse(response('r-a', 'c-1', 10));
  await repository.saveResponse(response('r-b', 'c-1', 10));

  const first = await repository.listResponses('c-1', undefined, 2);
  const second = await repository.listResponses('c-1', first.nextCursor ?? undefined, 2);

  expect(first.items.map((item) => item.id)).toEqual(['r-b', 'r-a']);
  expect(second.items.map((item) => item.id)).toEqual(['r-old']);
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
  expect(second.nextCursor).toBeNull();
});

test('persists version-checked notification preferences and assistant consent singletons', async () => {
  const repository = new AssistantNotificationsRepository();
  const preferences = createNotificationPreferences(1);
  const consent: AssistantConsent = { status: 'not_requested', disclosedDataCategories: [], consentedAt: null, disabledAt: null, version: 1 };
  await repository.saveNotificationPreferences(preferences, null);
  await repository.saveAssistantConsent(consent, null);

  await expect(repository.saveNotificationPreferences({ ...preferences, version: 2 }, 9)).rejects.toThrow('conflict');
  expect(await new AssistantNotificationsRepository().getNotificationPreferences()).toEqual(preferences);
  expect(await new AssistantNotificationsRepository().getAssistantConsent()).toEqual(consent);
});
