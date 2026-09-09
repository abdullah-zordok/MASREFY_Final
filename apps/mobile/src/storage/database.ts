/**
 * SQLite schema and migration entry for offline financial records.
 *
 * Owns the only direct expo-sqlite access in the foundation. Other modules
 * read/write offline records through LocalRecordsRepository, not the database
 * handle. Constitution Principle V and research Decision 3.
 */

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { resolveClientMode } from '@/config/client-runtime';

const DATABASE_NAME = 'masarifi.db';
const CURRENT_SCHEMA_VERSION = 12;
const LEGACY_OWNER_KEY = 'masarifi.database.legacyOwnerHash';
const DATABASE_KEY_PREFIX = 'masarifi.database.key.';
const LEGACY_MIGRATION_TABLE = '_masarifi_migration_state';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let databaseLifecycleQueue: Promise<void> = Promise.resolve();
let activeDatabase: SQLite.SQLiteDatabase | null = null;
let databaseName = DATABASE_NAME;
let databaseOwnerHash: string | null = null;

export async function configureDatabaseOwner(userId: string): Promise<void> {
  if (!userId || /^(?:mock|demo|fixture|test)(?:[-_]|$)/i.test(userId))
    throw new Error('invalid database owner');
  await enqueueDatabaseLifecycle(async () => {
    const ownerHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      userId
    );
    if (ownerHash === databaseOwnerHash) return;
    await closeActiveDatabase();
    databaseOwnerHash = ownerHash;
    databaseName = `masarifi-${ownerHash.slice(0, 24)}.db`;
  });
}

export async function clearDatabaseOwner(): Promise<void> {
  await enqueueDatabaseLifecycle(async () => {
    await closeActiveDatabase();
    databaseOwnerHash = null;
    databaseName = DATABASE_NAME;
  });
}

export async function openDatabase(
  expectedUserId?: string
): Promise<SQLite.SQLiteDatabase> {
  return enqueueDatabaseLifecycle(async () => {
    if (
      expectedUserId !== undefined &&
      (await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        expectedUserId
      )) !== databaseOwnerHash
    )
      throw new Error('stale database owner');
    if (resolveClientMode() === 'live' && !databaseOwnerHash)
      throw new Error('database owner required');
    if (!databasePromise) {
      const opening = createAndMigrate();
      databasePromise = opening;
      opening.catch(() => {
        if (databasePromise === opening) databasePromise = null;
      });
    }
    activeDatabase = await databasePromise;
    return activeDatabase;
  });
}

/**
 * Reset the cached connection. Test-only seam; production code never calls it.
 */
export function resetDatabaseForTests(): void {
  databasePromise = null;
  databaseLifecycleQueue = Promise.resolve();
  activeDatabase = null;
}

export function runExclusiveDatabaseTransaction(
  database: SQLite.SQLiteDatabase,
  operation: (transaction: SQLite.SQLiteDatabase) => Promise<void>
): Promise<void> {
  return enqueueDatabaseLifecycle(async () => {
    if (resolveClientMode() === 'live' && database !== activeDatabase)
      throw new Error('stale database owner');
    await database.withExclusiveTransactionAsync(operation);
  });
}

async function createAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const ownerHash = databaseOwnerHash;
  const targetExisted = ownerHash ? databaseFile(databaseName).exists : false;
  let removeLegacyAfterMigration = false;
  const db = await SQLite.openDatabaseAsync(databaseName);
  try {
    if (ownerHash) {
      const key = await databaseKey(ownerHash);
      await db.execAsync(`PRAGMA key = "x'${key}'";`);
      const cipher = await db.getFirstAsync<{ cipher_version: string }>(
        'PRAGMA cipher_version'
      );
      if (!cipher?.cipher_version) throw new Error('SQLCipher unavailable');
      removeLegacyAfterMigration = !targetExisted
        ? await migrateLegacyDatabase(db, ownerHash)
        : await verifyLegacyMigration(db, ownerHash);
      await db.getFirstAsync('SELECT count(*) AS count FROM sqlite_master');
    }
    await runMigrations(db);
  } catch (error) {
    await db.closeAsync();
    if (ownerHash && !targetExisted && !removeLegacyAfterMigration)
      removeDatabaseFiles(databaseName);
    throw error;
  }
  if (removeLegacyAfterMigration) {
    try {
      removeDatabaseFiles(DATABASE_NAME);
    } catch (error) {
      await db.closeAsync();
      throw error;
    }
  }
  return db;
}

async function verifyLegacyMigration(
  db: SQLite.SQLiteDatabase,
  ownerHash: string
): Promise<boolean> {
  if (
    databaseFilesExist(DATABASE_NAME) &&
    (await SecureStore.getItemAsync(LEGACY_OWNER_KEY)) === ownerHash
  ) {
    let marker: { value: string } | null;
    try {
      marker = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM ${LEGACY_MIGRATION_TABLE} WHERE key = 'legacy-export-owner'`
      );
    } catch {
      throw new Error('legacy database migration incomplete');
    }
    if (marker?.value !== ownerHash)
      throw new Error('legacy database migration incomplete');
    return true;
  }
  return false;
}

async function closeActiveDatabase(): Promise<void> {
  const active = databasePromise;
  databasePromise = null;
  activeDatabase = null;
  if (active) await (await active).closeAsync();
}

function enqueueDatabaseLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = databaseLifecycleQueue.then(operation);
  databaseLifecycleQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function databaseKey(ownerHash: string): Promise<string> {
  const storageKey = `${DATABASE_KEY_PREFIX}${ownerHash}`;
  const stored = await SecureStore.getItemAsync(storageKey);
  if (stored && /^[0-9a-f]{64}$/i.test(stored)) return stored.toLowerCase();
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  await SecureStore.setItemAsync(storageKey, key);
  return key;
}

async function migrateLegacyDatabase(
  db: SQLite.SQLiteDatabase,
  ownerHash: string
): Promise<boolean> {
  const legacy = databaseFile(DATABASE_NAME);
  if (!legacy.exists) return false;
  const claimedOwner = await SecureStore.getItemAsync(LEGACY_OWNER_KEY);
  if (claimedOwner !== ownerHash) return false;
  const legacyPath = legacy.uri.replace(/'/g, "''");
  await db.execAsync(`ATTACH DATABASE '${legacyPath}' AS legacy KEY '';`);
  try {
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM legacy.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    const before = await tableCounts(db, 'legacy', tables);
    await db.execAsync("SELECT sqlcipher_export('main', 'legacy');");
    const after = await tableCounts(db, 'main', tables);
    if (tables.some(({ name }) => before.get(name) !== after.get(name)))
      throw new Error('legacy database row-count mismatch');
  } finally {
    await db.execAsync('DETACH DATABASE legacy;');
  }
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS ${LEGACY_MIGRATION_TABLE} (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      INSERT OR REPLACE INTO ${LEGACY_MIGRATION_TABLE} (key, value)
      VALUES ('legacy-export-owner', '${ownerHash}');
    `);
  });
  await SecureStore.setItemAsync(LEGACY_OWNER_KEY, ownerHash);
  return true;
}

function removeDatabaseFiles(name: string): void {
  let failure: unknown;
  for (const candidate of [`${name}-wal`, `${name}-shm`, name]) {
    const file = databaseFile(candidate);
    if (!file.exists) continue;
    try {
      file.delete();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== undefined) throw failure;
}

function databaseFilesExist(name: string): boolean {
  return [name, `${name}-wal`, `${name}-shm`].some(
    (candidate) => databaseFile(candidate).exists
  );
}

async function tableCounts(
  db: SQLite.SQLiteDatabase,
  schema: 'main' | 'legacy',
  tables: readonly { name: string }[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const { name } of tables) {
    const identifier = name.replace(/"/g, '""');
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT count(*) AS count FROM ${schema}."${identifier}"`
    );
    if (!row || !Number.isSafeInteger(row.count) || row.count < 0)
      throw new Error('invalid legacy database row count');
    counts.set(name, row.count);
  }
  return counts;
}

function databaseFile(name: string): File {
  return new File(SQLite.defaultDatabaseDirectory, name);
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);

    const migrations = parseMigrations(`
    -- migration:10
    CREATE TABLE IF NOT EXISTS sync_state (
      domain TEXT PRIMARY KEY,
      cursor TEXT NOT NULL,
      last_mutation_id TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_mutation_queue (
      operation_id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1),
      depends_on TEXT NOT NULL DEFAULT '[]',
      operation TEXT NOT NULL,
      resource_id TEXT,
      base_version INTEGER,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER,
      last_error_code TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_mutation_queue_ready
      ON sync_mutation_queue(status, next_attempt_at, created_at, operation_id);

    CREATE TABLE IF NOT EXISTS sync_id_mappings (
      domain TEXT NOT NULL,
      local_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(domain, local_id),
      UNIQUE(domain, server_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_id_mappings_server
      ON sync_id_mappings(domain, server_id);

    CREATE TABLE IF NOT EXISTS sync_resource_state (
      domain TEXT NOT NULL,
      server_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version >= 0),
      deleted_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(domain, server_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sync_resource_state_version
      ON sync_resource_state(domain, version, server_id);

    ALTER TABLE offline_entries ADD COLUMN amount_minor INTEGER;

    UPDATE offline_entries
      SET amount_minor=CAST(round(amount * 100) AS INTEGER)
      WHERE abs(amount) <= 90071992547409.91 AND amount * 100 = round(amount * 100);

    UPDATE offline_entries
      SET last_error_key='legacy_amount_review_required'
      WHERE amount_minor IS NULL;

    -- migration:9
    CREATE TABLE IF NOT EXISTS settings_profile (
      id TEXT PRIMARY KEY CHECK (id = 'singleton'),
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- migration:8
    CREATE TABLE IF NOT EXISTS demo_seed_markers (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );

    -- migration:1
    CREATE TABLE IF NOT EXISTS offline_entries (
      local_id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      currency_code TEXT NOT NULL,
      category_key TEXT NOT NULL,
      note TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_error_key TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_offline_entries_sync_status
      ON offline_entries(sync_status);

    -- migration:2
    CREATE TABLE IF NOT EXISTS finance_accounts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_categories (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      parent_id TEXT,
      status TEXT NOT NULL,
      merged_into_id TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(parent_id) REFERENCES finance_categories(id),
      FOREIGN KEY(merged_into_id) REFERENCES finance_categories(id)
    );

    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      account_id TEXT NOT NULL,
      destination_account_id TEXT,
      category_id TEXT,
      occurred_at INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      sync_status TEXT NOT NULL,
      review_status TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(account_id) REFERENCES finance_accounts(id),
      FOREIGN KEY(destination_account_id) REFERENCES finance_accounts(id),
      FOREIGN KEY(category_id) REFERENCES finance_categories(id)
    );

    CREATE TABLE IF NOT EXISTS finance_drafts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_corrections (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS finance_operations (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL UNIQUE,
      transaction_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS finance_exchange_rates (
      pair TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      as_of INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_sync_conflicts (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_account ON finance_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_filters ON finance_transactions(type, source, status, sync_status, review_status);
    CREATE INDEX IF NOT EXISTS idx_finance_transactions_search ON finance_transactions(normalized_title);

    -- migration:3
    CREATE TABLE IF NOT EXISTS tracking_events (
      id TEXT PRIMARY KEY,
      source_fingerprint TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      decision_status TEXT NOT NULL,
      occurred_at INTEGER,
      source_text_expires_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracking_reviews (
      id TEXT PRIMARY KEY,
      detected_event_id TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(detected_event_id) REFERENCES tracking_events(id)
    );

    CREATE TABLE IF NOT EXISTS tracking_duplicates (
      id TEXT PRIMARY KEY,
      detected_event_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY(detected_event_id) REFERENCES tracking_events(id)
    );

    CREATE TABLE IF NOT EXISTS tracking_senders (
      id TEXT PRIMARY KEY,
      normalized_sender TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracking_history (
      id TEXT PRIMARY KEY,
      detected_event_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      FOREIGN KEY(detected_event_id) REFERENCES tracking_events(id)
    );

    CREATE TABLE IF NOT EXISTS tracking_feedback (
      id TEXT PRIMARY KEY,
      detected_event_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      undo_expires_at INTEGER NOT NULL,
      FOREIGN KEY(detected_event_id) REFERENCES tracking_events(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tracking_events_status ON tracking_events(decision_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tracking_events_expiry ON tracking_events(source_text_expires_at);
    CREATE INDEX IF NOT EXISTS idx_tracking_reviews_status ON tracking_reviews(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tracking_history_date ON tracking_history(occurred_at DESC, id DESC);

    -- migration:4
    CREATE TABLE IF NOT EXISTS voice_category_preferences (
      id TEXT PRIMARY KEY,
      merchant_key TEXT NOT NULL UNIQUE,
      merchant_label TEXT NOT NULL,
      category_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(category_id) REFERENCES finance_categories(id)
    );

    -- migration:5
    CREATE TABLE IF NOT EXISTS planning_salary_profiles (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS planning_salary_receipts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      salary_profile_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL UNIQUE,
      operation_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'linked',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(salary_profile_id) REFERENCES planning_salary_profiles(id),
      FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS planning_budgets (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      period_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_budgets_active_period
      ON planning_budgets(period_key)
      WHERE status != 'deleted';

    CREATE TABLE IF NOT EXISTS planning_category_budgets (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      budget_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(budget_id) REFERENCES planning_budgets(id),
      FOREIGN KEY(category_id) REFERENCES finance_categories(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_category_budgets_active
      ON planning_category_budgets(budget_id, category_id)
      WHERE status = 'active';

    CREATE TABLE IF NOT EXISTS planning_obligations (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      next_due_date TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_planning_obligations_status
      ON planning_obligations(direction, status, next_due_date);

    CREATE TABLE IF NOT EXISTS planning_obligation_schedule_items (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      obligation_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(obligation_id) REFERENCES planning_obligations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_planning_schedule_due
      ON planning_obligation_schedule_items(obligation_id, due_date);

    CREATE TABLE IF NOT EXISTS planning_obligation_payments (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      obligation_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL UNIQUE,
      operation_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'posted',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(obligation_id) REFERENCES planning_obligations(id),
      FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE TABLE IF NOT EXISTS planning_savings_goals (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      target_date TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_planning_goals_status
      ON planning_savings_goals(status, target_date);

    CREATE TABLE IF NOT EXISTS planning_goal_movements (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      linked_transaction_id TEXT,
      operation_id TEXT NOT NULL UNIQUE,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(goal_id) REFERENCES planning_savings_goals(id),
      FOREIGN KEY(linked_transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_planning_goal_movements_goal
      ON planning_goal_movements(goal_id, linked_transaction_id);

    CREATE TABLE IF NOT EXISTS planning_drafts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_planning_drafts_kind
      ON planning_drafts(kind, updated_at DESC);

    CREATE TABLE IF NOT EXISTS planning_sync_conflicts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      entity_kind TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_planning_conflicts_status
      ON planning_sync_conflicts(status, entity_kind, entity_id);

    -- migration:6
    CREATE TABLE IF NOT EXISTS report_schedules (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      next_delivery_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_report_schedules_status
      ON report_schedules(status, next_delivery_at);

    CREATE TABLE IF NOT EXISTS report_output_attempts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,
      schedule_id TEXT,
      retry_of_attempt_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_report_attempts_status
      ON report_output_attempts(status, requested_at DESC);

    CREATE INDEX IF NOT EXISTS idx_report_attempts_schedule
      ON report_output_attempts(schedule_id, requested_at DESC);

    -- migration:7
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      event_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      read_at INTEGER,
      deleted_at INTEGER,
      sync_status TEXT NOT NULL,
      occurred_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_lifecycle
      ON notifications(category, read_at, deleted_at, sync_status, occurred_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY CHECK (id = 'singleton'),
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notification_preferences_updated_at
      ON notification_preferences(updated_at DESC);

    CREATE TABLE IF NOT EXISTS assistant_consent (
      id TEXT PRIMARY KEY CHECK (id = 'singleton'),
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assistant_consent_status
      ON assistant_consent(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assistant_conversations_lifecycle
      ON assistant_conversations(status, updated_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS assistant_responses (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assistant_responses_conversation
      ON assistant_responses(conversation_id, created_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS assistant_action_previews (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      response_id TEXT NOT NULL,
      operation_id TEXT UNIQUE,
      status TEXT NOT NULL,
      expires_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_assistant_previews_lifecycle
      ON assistant_action_previews(response_id, status, expires_at);

    CREATE TABLE IF NOT EXISTS subscription_state (
      id TEXT PRIMARY KEY CHECK (id = 'singleton'),
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscription_state_lifecycle
      ON subscription_state(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS subscription_operations (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscription_operations_lifecycle
      ON subscription_operations(kind, status, requested_at DESC);

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_support_tickets_lifecycle
      ON support_tickets(status, updated_at DESC, id DESC);

    CREATE TABLE IF NOT EXISTS support_drafts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_support_drafts_lifecycle
      ON support_drafts(mode, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS support_operations (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_support_operations_lifecycle
      ON support_operations(kind, status, requested_at DESC);

    -- migration:11
    UPDATE finance_transactions
    SET category_id = NULL
    WHERE type = 'transfer' AND category_id IS NOT NULL;

    UPDATE finance_transactions
    SET payload = json_set(payload, '$.categoryId', NULL)
    WHERE type = 'transfer'
      AND json_extract(payload, '$.categoryId') IS NOT NULL;

    UPDATE offline_entries
    SET amount_minor = CAST(round(amount * 100) AS INTEGER),
        last_error_key = CASE
          WHEN last_error_key = 'legacy_amount_review_required' THEN NULL
          ELSE last_error_key
        END
    WHERE currency_code IN ('SAR', 'AED', 'QAR', 'EGP', 'USD', 'EUR', 'GBP')
      AND abs(amount) <= 90071992547409.91
      AND abs(amount * 100 - round(amount * 100)) < 0.000001;

    UPDATE offline_entries
    SET amount_minor = NULL,
        last_error_key = CASE
          WHEN last_error_key IS NULL OR last_error_key = 'legacy_amount_review_required'
            THEN 'legacy_amount_review_required'
          ELSE last_error_key
        END
    WHERE currency_code IN ('SAR', 'AED', 'QAR', 'EGP', 'USD', 'EUR', 'GBP')
      AND (
        abs(amount) > 90071992547409.91
        OR abs(amount * 100 - round(amount * 100)) >= 0.000001
      );

    UPDATE offline_entries
    SET amount_minor = CAST(round(amount * 1000) AS INTEGER),
        last_error_key = CASE
          WHEN last_error_key = 'legacy_amount_review_required' THEN NULL
          ELSE last_error_key
        END
    WHERE currency_code IN ('KWD', 'BHD', 'OMR', 'JOD')
      AND abs(amount) <= 9007199254740.991
      AND abs(amount * 1000 - round(amount * 1000)) < 0.000001;

    UPDATE offline_entries
    SET amount_minor = NULL,
        last_error_key = CASE
          WHEN last_error_key IS NULL OR last_error_key = 'legacy_amount_review_required'
            THEN 'legacy_amount_review_required'
          ELSE last_error_key
        END
    WHERE currency_code IN ('KWD', 'BHD', 'OMR', 'JOD')
      AND (
        abs(amount) > 9007199254740.991
        OR abs(amount * 1000 - round(amount * 1000)) >= 0.000001
      );

    UPDATE offline_entries
    SET amount_minor = CAST(round(amount) AS INTEGER),
        last_error_key = CASE
          WHEN last_error_key = 'legacy_amount_review_required' THEN NULL
          ELSE last_error_key
        END
    WHERE currency_code = 'JPY'
      AND abs(amount) <= 9007199254740991
      AND abs(amount - round(amount)) < 0.000001;

    UPDATE offline_entries
    SET amount_minor = NULL,
        last_error_key = CASE
          WHEN last_error_key IS NULL OR last_error_key = 'legacy_amount_review_required'
            THEN 'legacy_amount_review_required'
          ELSE last_error_key
        END
    WHERE currency_code = 'JPY'
      AND (
        abs(amount) > 9007199254740991
        OR abs(amount - round(amount)) >= 0.000001
      );

    -- migration:12
    CREATE TABLE IF NOT EXISTS planning_payment_matches (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      transaction_id TEXT,
      status TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_planning_payment_matches_status
      ON planning_payment_matches(status, updated_at DESC, id DESC);

  `);

    const applied = await transaction.getAllAsync<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedVersions = new Set(applied.map((row) => row.version));

    for (let version = 1; version <= CURRENT_SCHEMA_VERSION; version += 1) {
      if (appliedVersions.has(version)) continue;
      const sql = migrations.get(version);
      if (!sql) throw new Error(`missing schema migration ${version}`);
      await transaction.execAsync(sql);
      await transaction.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        version,
        Date.now()
      );
    }
  });
}

function parseMigrations(source: string): Map<number, string> {
  const migrations = new Map<number, string>();
  const parts = source.split(/-- migration:(\d+)/);
  for (let index = 1; index < parts.length; index += 2)
    migrations.set(Number(parts[index]), parts[index + 1].trim());
  return migrations;
}
