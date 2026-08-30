import type { SQLiteDatabase } from 'expo-sqlite';
import type { Locale } from '@/domain/foundation';
import { createClientDemoData } from '@/domain/demo-data';
import { normalizeSearch } from '@/domain/core-finance';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';

const MARKER = 'demo-seed-v2';
type Runner = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;
type Bind = string | number | null;

export async function seedClientDemoData({
  database,
  now = Date.now(),
  timeZone = 'Asia/Riyadh',
  locale = 'en'
}: {
  database?: SQLiteDatabase;
  now?: number;
  timeZone?: string;
  locale?: Locale;
} = {}): Promise<boolean> {
  const target = database ?? (await openDatabase());
  let inserted = false;
  await runExclusiveDatabaseTransaction(target, async (transaction) => {
    const localeMarker = `${MARKER}:${locale}`;
    if (
      await transaction.getFirstAsync(
        'SELECT id FROM demo_seed_markers WHERE id = ?',
        localeMarker
      )
    )
      return;
    const relocalizing = Boolean(
      await transaction.getFirstAsync(
        'SELECT id FROM demo_seed_markers WHERE id = ? OR id LIKE ?',
        'demo-seed-v1',
        `${MARKER}:%`
      )
    );
    const data = createClientDemoData(now, timeZone, locale);

    if (relocalizing) {
      await relocalizeDemoRows(transaction, data);
    } else {
      for (const account of data.finance.accounts) {
        await insert(transaction, 'finance_accounts', account, {
          status: account.status,
          is_default: account.isDefault ? 1 : 0,
          updated_at: account.updatedAt
        });
      }
      for (const category of data.finance.categories) {
        await insert(transaction, 'finance_categories', category, {
          parent_id: category.parentId,
          status: category.status,
          merged_into_id: category.mergedIntoId,
          updated_at: category.updatedAt
        });
      }
      for (const item of data.finance.transactions) {
        await insert(transaction, 'finance_transactions', item, {
          account_id: item.accountId,
          destination_account_id: item.destinationAccountId,
          category_id: item.categoryId,
          occurred_at: item.occurredAt,
          type: item.type,
          source: item.source,
          status: item.status,
          sync_status: item.syncStatus,
          review_status: item.reviewStatus,
          normalized_title: normalizeSearch(
            `${item.title} ${item.merchant ?? ''}`
          ),
          amount_minor: item.amountMinor,
          updated_at: item.updatedAt
        });
      }

      await insertPlanning(transaction, data.planning);
      for (const item of data.tracking.events) {
        await insert(transaction, 'tracking_events', item, {
          source_fingerprint: item.sourceFingerprint,
          decision_status: item.decisionStatus,
          occurred_at: item.occurredAt,
          source_text_expires_at: item.sourceTextExpiresAt,
          updated_at: item.updatedAt
        });
      }
      for (const item of data.tracking.reviews) {
        await insert(transaction, 'tracking_reviews', item, {
          detected_event_id: item.detectedEventId,
          status: item.status,
          updated_at: item.updatedAt
        });
      }
      for (const item of data.tracking.history) {
        await insert(transaction, 'tracking_history', item, {
          detected_event_id: item.detectedEventId,
          occurred_at: item.occurredAt
        });
      }
      for (const item of data.tracking.feedback) {
        await insert(transaction, 'tracking_feedback', item, {
          detected_event_id: item.detectedEventId,
          transaction_id: item.transactionId,
          status: item.status,
          undo_expires_at: item.undoExpiresAt
        });
      }
      for (const item of data.tracking.senders) {
        await insert(transaction, 'tracking_senders', item, {
          normalized_sender: item.normalizedSender,
          enabled: item.enabled ? 1 : 0,
          updated_at: item.updatedAt
        });
      }
      for (const item of data.notifications) {
        await insert(transaction, 'notifications', item, {
          event_key: item.eventKey,
          category: item.category,
          read_at: item.readAt,
          deleted_at: item.deletedAt,
          sync_status: item.syncStatus,
          occurred_at: item.occurredAt
        });
      }
      await transaction.runAsync(
        'INSERT OR IGNORE INTO notification_preferences (id, payload, updated_at) VALUES (?, ?, ?)',
        'singleton',
        JSON.stringify(data.notificationPreferences),
        data.notificationPreferences.updatedAt
      );
    }

    await transaction.runAsync(
      'DELETE FROM demo_seed_markers WHERE id = ? OR id LIKE ?',
      'demo-seed-v1',
      `${MARKER}:%`
    );
    await transaction.runAsync(
      'INSERT INTO demo_seed_markers (id, applied_at) VALUES (?, ?)',
      localeMarker,
      now
    );
    inserted = true;
  });
  return inserted;
}

async function relocalizeDemoRows(
  database: Runner,
  data: ReturnType<typeof createClientDemoData>
) {
  for (const account of data.finance.accounts)
    await updateLocalizedPayload(database, 'finance_accounts', account, [
      'name',
      'institution',
      'notes'
    ]);
  for (const transaction of data.finance.transactions)
    await updateLocalizedPayload(
      database,
      'finance_transactions',
      transaction,
      ['title', 'merchant', 'notes'],
      (payload) => ({
        normalized_title: normalizeSearch(
          `${payload.title} ${payload.merchant ?? ''}`
        )
      })
    );
  for (const profile of data.planning.salaryProfiles ?? [])
    await updateLocalizedPayload(
      database,
      'planning_salary_profiles',
      profile,
      ['sourceName']
    );
  for (const budget of data.planning.budgets ?? [])
    await updateLocalizedPayload(database, 'planning_budgets', budget, [
      'name'
    ]);
  for (const obligation of data.planning.obligations ?? [])
    await updateLocalizedPayload(
      database,
      'planning_obligations',
      obligation,
      ['title', 'provider', 'providerKeywords']
    );
  for (const goal of data.planning.savingsGoals ?? [])
    await updateLocalizedPayload(database, 'planning_savings_goals', goal, [
      'title'
    ]);
  for (const event of data.tracking.events)
    await updateLocalizedPayload(database, 'tracking_events', event, [
      'merchant'
    ]);
  for (const review of data.tracking.reviews)
    await updateReviewMerchant(database, review);
  for (const sender of data.tracking.senders)
    await updateLocalizedPayload(database, 'tracking_senders', sender, [
      'displayLabel'
    ]);
  for (const notification of data.notifications)
    await updateLocalizedPayload(database, 'notifications', notification, [
      'messageValues'
    ]);
}

async function updateLocalizedPayload(
  database: Runner,
  table: string,
  value: { id: string },
  fields: readonly string[],
  indexedValues: (
    payload: Record<string, unknown>
  ) => Record<string, Bind> = () => ({})
) {
  const row = await database.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM ${table} WHERE id = ?`,
    value.id
  );
  if (!row) return;
  const payload = JSON.parse(row.payload) as Record<string, unknown>;
  const localized = value as Record<string, unknown>;
  for (const field of fields) payload[field] = localized[field];
  const indexed = indexedValues(payload);
  const columns = ['payload', ...Object.keys(indexed)];
  await database.runAsync(
    `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    JSON.stringify(payload),
    ...Object.values(indexed),
    value.id
  );
}

async function updateReviewMerchant(
  database: Runner,
  review: ReturnType<typeof createClientDemoData>['tracking']['reviews'][number]
) {
  const row = await database.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM tracking_reviews WHERE id = ?',
    review.id
  );
  if (!row) return;
  const payload = JSON.parse(row.payload) as typeof review;
  payload.proposedValues = {
    ...payload.proposedValues,
    merchant: review.proposedValues.merchant
  };
  await database.runAsync(
    'UPDATE tracking_reviews SET payload = ? WHERE id = ?',
    JSON.stringify(payload),
    review.id
  );
}

async function insertPlanning(
  database: Runner,
  data: ReturnType<typeof createClientDemoData>['planning']
) {
  for (const item of data.salaryProfiles ?? [])
    await insert(database, 'planning_salary_profiles', item, {
      status: item.status,
      updated_at: item.updatedAt
    });
  for (const item of data.salaryReceipts ?? [])
    await insert(database, 'planning_salary_receipts', item, {
      salary_profile_id: item.salaryProfileId,
      transaction_id: item.transactionId,
      operation_id: item.operationId,
      status: item.status,
      updated_at: item.updatedAt
    });
  for (const item of data.budgets ?? [])
    await insert(database, 'planning_budgets', item, {
      period_key: item.periodKey,
      status: item.status,
      updated_at: item.updatedAt
    });
  for (const item of data.categoryBudgets ?? [])
    await insert(database, 'planning_category_budgets', item, {
      budget_id: item.budgetId,
      category_id: item.categoryId,
      status: item.status,
      updated_at: item.updatedAt
    });
  for (const item of data.obligations ?? [])
    await insert(database, 'planning_obligations', item, {
      direction: item.direction,
      status: item.status,
      next_due_date: null,
      updated_at: item.updatedAt
    });
  for (const item of data.scheduleItems ?? [])
    await insert(database, 'planning_obligation_schedule_items', item, {
      obligation_id: item.obligationId,
      due_date: item.dueDate,
      updated_at: nowOf(item)
    });
  for (const item of data.savingsGoals ?? [])
    await insert(database, 'planning_savings_goals', item, {
      status: item.status,
      target_date: item.targetDate,
      updated_at: item.updatedAt
    });
  for (const item of data.goalMovements ?? [])
    await insert(database, 'planning_goal_movements', item, {
      goal_id: item.goalId,
      linked_transaction_id: item.linkedTransactionId,
      operation_id: item.operationId,
      updated_at: item.updatedAt
    });
}

function nowOf(value: object): number {
  return 'updatedAt' in value ? Number(value.updatedAt) : Date.now();
}

async function insert(
  database: Runner,
  table: string,
  value: { id: string },
  indexed: Record<string, Bind>
) {
  const columns = ['id', 'payload', ...Object.keys(indexed)];
  await database.runAsync(
    `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    value.id,
    JSON.stringify(value),
    ...Object.values(indexed)
  );
}
