import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type NativeSqlite = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    all(...values: unknown[]): unknown[];
    run(...values: unknown[]): unknown;
  };
};

const { DatabaseSync } = jest.requireActual('node:sqlite') as {
  DatabaseSync: new (filename: string) => NativeSqlite;
};

function migrations(): Map<number, string> {
  const source = readFileSync(join(__dirname, 'database.ts'), 'utf8');
  const start = source.indexOf('const migrations = parseMigrations(`');
  const end = source.indexOf('`);', start);
  const parts = source
    .slice(start + 'const migrations = parseMigrations(`'.length, end)
    .split(/-- migration:(\d+)\s*/);
  const result = new Map<number, string>();
  for (let index = 1; index < parts.length; index += 2)
    result.set(Number(parts[index]), parts[index + 1]!.trim());
  return result;
}

it('preserves currency precision when upgrading legacy REAL amounts', () => {
  const database = new DatabaseSync(':memory:');
  try {
    const migration = migrations();
    database.exec(migration.get(1)!);
    database.exec(`
      INSERT INTO offline_entries
        (local_id, amount, currency_code, category_key, sync_status, created_at, updated_at)
      VALUES
        ('sar', 4.25, 'SAR', 'food', 'pending', 0, 0),
        ('sar-floating', 0.29, 'SAR', 'food', 'pending', 0, 0),
        ('sar-extra-decimal', 0.291, 'SAR', 'food', 'pending', 0, 0),
        ('sar-valid-sync-error', 1.25, 'SAR', 'food', 'pending', 0, 0),
        ('sar-invalid-sync-error', 1.251, 'SAR', 'food', 'pending', 0, 0),
        ('kwd', 4.250, 'KWD', 'food', 'pending', 0, 0),
        ('kwd-floating', 1.001, 'KWD', 'food', 'pending', 0, 0),
        ('kwd-extra-decimal', 1.0001, 'KWD', 'food', 'pending', 0, 0),
        ('kwd-out-of-range', 9007199254741.00, 'KWD', 'food', 'pending', 0, 0),
        ('bhd', 4.250, 'BHD', 'food', 'pending', 0, 0),
        ('omr', 4.250, 'OMR', 'food', 'pending', 0, 0),
        ('jod', 4.250, 'JOD', 'food', 'pending', 0, 0),
        ('jpy', 4, 'JPY', 'food', 'pending', 0, 0),
        ('jpy-fractional', 4.5, 'JPY', 'food', 'pending', 0, 0);
    `);
    for (let version = 2; version <= 10; version += 1)
      database.exec(migration.get(version)!);
    database.exec(`
      UPDATE offline_entries
      SET last_error_key = 'sync_conflict'
      WHERE local_id IN ('sar-valid-sync-error', 'sar-invalid-sync-error');
    `);
    database.exec(migration.get(11)!);

    expect(
      database
        .prepare(
          "SELECT local_id, amount_minor, coalesce(last_error_key, '') last_error_key FROM offline_entries ORDER BY local_id"
        )
        .all()
    ).toEqual([
      { local_id: 'bhd', amount_minor: 4_250, last_error_key: '' },
      { local_id: 'jod', amount_minor: 4_250, last_error_key: '' },
      { local_id: 'jpy', amount_minor: 4, last_error_key: '' },
      {
        local_id: 'jpy-fractional',
        amount_minor: null,
        last_error_key: 'legacy_amount_review_required'
      },
      { local_id: 'kwd', amount_minor: 4_250, last_error_key: '' },
      {
        local_id: 'kwd-extra-decimal',
        amount_minor: null,
        last_error_key: 'legacy_amount_review_required'
      },
      { local_id: 'kwd-floating', amount_minor: 1_001, last_error_key: '' },
      {
        local_id: 'kwd-out-of-range',
        amount_minor: null,
        last_error_key: 'legacy_amount_review_required'
      },
      { local_id: 'omr', amount_minor: 4_250, last_error_key: '' },
      { local_id: 'sar', amount_minor: 425, last_error_key: '' },
      {
        local_id: 'sar-extra-decimal',
        amount_minor: null,
        last_error_key: 'legacy_amount_review_required'
      },
      { local_id: 'sar-floating', amount_minor: 29, last_error_key: '' },
      {
        local_id: 'sar-invalid-sync-error',
        amount_minor: null,
        last_error_key: 'sync_conflict'
      },
      {
        local_id: 'sar-valid-sync-error',
        amount_minor: 125,
        last_error_key: 'sync_conflict'
      }
    ]);
  } finally {
    database.close();
  }
});

it('repairs transfer category shadow and JSON values idempotently in SQLite', () => {
  const database = new DatabaseSync(':memory:');
  try {
    const migration = migrations();
    for (let version = 1; version <= 10; version += 1)
      database.exec(migration.get(version)!);
    database.exec(`
      INSERT INTO finance_accounts(id,payload,status,is_default,updated_at)
      VALUES ('account','{}','active',1,1),('destination','{}','active',0,1);
      INSERT INTO finance_categories(id,payload,status,updated_at)
      VALUES ('transfers','{}','active',1),('food','{}','active',1);
    `);
    const insert = database.prepare(`
      INSERT INTO finance_transactions
        (id,payload,account_id,destination_account_id,category_id,occurred_at,type,source,
         status,sync_status,review_status,normalized_title,amount_minor,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const legacyTransfer = {
      id: 'legacy-transfer',
      type: 'transfer',
      categoryId: 'transfers',
      title: 'Move funds'
    };
    const cleanTransfer = {
      id: 'clean-transfer',
      type: 'transfer',
      categoryId: null,
      title: 'Clean move'
    };
    const expense = {
      id: 'expense',
      type: 'expense',
      categoryId: 'food',
      title: 'Groceries'
    };
    for (const item of [legacyTransfer, cleanTransfer, expense])
      insert.run(
        item.id,
        JSON.stringify(item),
        'account',
        item.type === 'transfer' ? 'destination' : null,
        item.categoryId,
        1,
        item.type,
        'manual',
        'posted',
        'synced',
        'none',
        item.title.toLowerCase(),
        100,
        1
      );

    database.exec(migration.get(11)!);
    const once = database
      .prepare(
        'SELECT id, payload, category_id FROM finance_transactions ORDER BY id'
      )
      .all();
    database.exec(migration.get(11)!);
    expect(
      database
        .prepare(
          'SELECT id, payload, category_id FROM finance_transactions ORDER BY id'
        )
        .all()
    ).toEqual(once);
    expect(once).toEqual([
      {
        id: cleanTransfer.id,
        payload: JSON.stringify(cleanTransfer),
        category_id: null
      },
      {
        id: expense.id,
        payload: JSON.stringify(expense),
        category_id: expense.categoryId
      },
      {
        id: legacyTransfer.id,
        payload: JSON.stringify({ ...legacyTransfer, categoryId: null }),
        category_id: null
      }
    ]);
  } finally {
    database.close();
  }
});
