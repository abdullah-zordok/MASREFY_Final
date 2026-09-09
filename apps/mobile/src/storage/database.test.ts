type Row = Record<string, unknown>;

class StatefulSqliteFake {
  readonly events: string[] = [];
  private readonly tables = new Map<
    string,
    { singleton: boolean; unique: string[] }
  >();
  private readonly indexes = new Map<string, string[]>();
  private readonly rows = new Map<string, Row[]>();
  private inTransaction = false;
  private failDdl = false;

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, { singleton: false, unique: [] });
    this.rows.set(
      table,
      rows.map((row) => ({ ...row }))
    );
  }

  failNextDdl(): void {
    this.failDdl = true;
  }

  async closeAsync(): Promise<void> {}

  async withExclusiveTransactionAsync(
    operation: (database: this) => Promise<void>
  ): Promise<void> {
    const tables = new Map(
      [...this.tables].map(([name, schema]) => [
        name,
        { ...schema, unique: [...schema.unique] }
      ])
    );
    const indexes = new Map(
      [...this.indexes].map(([name, values]) => [name, [...values]])
    );
    const rows = new Map(
      [...this.rows].map(([name, values]) => [
        name,
        values.map((row) => ({ ...row }))
      ])
    );
    this.events.push('begin');
    this.inTransaction = true;
    try {
      await operation(this);
      this.events.push('end');
    } catch (error) {
      this.tables.clear();
      tables.forEach((schema, name) => this.tables.set(name, schema));
      this.indexes.clear();
      indexes.forEach((values, name) => this.indexes.set(name, values));
      this.rows.clear();
      rows.forEach((values, name) => this.rows.set(name, values));
      this.events.push('rollback');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async execAsync(sql: string): Promise<void> {
    if (sql.includes('PRAGMA journal_mode')) {
      if (this.inTransaction)
        throw new Error('journal mode cannot change inside a transaction');
      this.events.push('pragma');
      return;
    }
    if (this.failDdl) {
      this.failDdl = false;
      throw new Error('injected DDL failure');
    }
    this.events.push('ddl');
    if (sql.includes('UPDATE finance_transactions')) {
      const transactions = this.rows.get('finance_transactions') ?? [];
      this.rows.set(
        'finance_transactions',
        transactions.map((row) => {
          if (row.type !== 'transfer') return row;
          const payload = JSON.parse(String(row.payload)) as {
            categoryId?: string | null;
          };
          return {
            ...row,
            category_id: null,
            payload:
              payload.categoryId == null
                ? row.payload
                : JSON.stringify({ ...payload, categoryId: null })
          };
        })
      );
    }
    for (const match of sql.matchAll(
      /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n    \);/g
    )) {
      const [, name, definition] = match;
      const unique = [
        ...definition.matchAll(/\b(\w+)\s+\w+(?:\s+NOT NULL)?\s+UNIQUE/g)
      ].map((item) => item[1]);
      this.tables.set(name, {
        singleton: definition.includes("CHECK (id = 'singleton')"),
        unique
      });
      this.rows.set(name, this.rows.get(name) ?? []);
    }
    for (const match of sql.matchAll(
      /CREATE(?: UNIQUE)? INDEX IF NOT EXISTS (\w+)\s+ON (\w+)/g
    )) {
      const [, index, table] = match;
      this.indexes.set(table, [...(this.indexes.get(table) ?? []), index]);
    }
  }

  async runAsync(sql: string, ...values: unknown[]): Promise<void> {
    const match = sql.match(/INSERT INTO (\w+) \(([^)]+)\)/);
    if (!match) throw new Error(`unsupported SQL: ${sql}`);
    const [, table, rawColumns] = match;
    const columns = rawColumns.split(',').map((column) => column.trim());
    const row = Object.fromEntries(
      columns.map((column, index) => [column, values[index]])
    );
    if (table === 'schema_migrations') this.events.push('migration');
    const schema = this.tables.get(table) ?? {
      singleton: false,
      unique: ['version']
    };
    if (schema.singleton && row.id !== 'singleton')
      throw new Error('CHECK constraint failed');
    const existing = this.rows.get(table) ?? [];
    for (const column of ['id', ...schema.unique]) {
      if (
        row[column] != null &&
        existing.some((item) => item[column] === row[column])
      )
        throw new Error(`UNIQUE constraint failed: ${table}.${column}`);
    }
    this.rows.set(table, [...existing, row]);
  }

  async getAllAsync<T extends Row>(sql: string): Promise<T[]> {
    if (sql.includes('schema_migrations'))
      return this.read('schema_migrations') as T[];
    if (sql.includes('sqlite_master'))
      return [...this.tables.keys()]
        .sort()
        .map((name) => ({ name })) as unknown as T[];
    const pragma = sql.match(/PRAGMA index_list\(['"]?(\w+)/);
    if (pragma)
      return (this.indexes.get(pragma[1]) ?? []).map((name) => ({
        name
      })) as unknown as T[];
    const table = sql.match(/FROM (\w+)/)?.[1];
    return table ? (this.read(table) as T[]) : [];
  }

  private read(table: string): Row[] {
    return (this.rows.get(table) ?? []).map((row) => ({ ...row }));
  }
}

let mockDatabase: StatefulSqliteFake;
const mockOpenDatabaseAsync = jest.fn(async () => mockDatabase);

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: mockOpenDatabaseAsync }));

const { openDatabase, resetDatabaseForTests, runExclusiveDatabaseTransaction } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./database') as typeof import('./database');

const v7Tables = [
  'notifications',
  'notification_preferences',
  'assistant_consent',
  'assistant_conversations',
  'assistant_responses',
  'assistant_action_previews',
  'subscription_state',
  'subscription_operations',
  'support_tickets',
  'support_drafts',
  'support_operations'
];

beforeEach(() => {
  mockDatabase = new StatefulSqliteFake();
  mockDatabase.seed(
    'schema_migrations',
    [1, 2, 3, 4, 5, 6].map((version) => ({ version, applied_at: version }))
  );
  mockDatabase.seed('offline_entries', [
    { local_id: 'v1-entry', amount: 4, currency_code: 'SAR' }
  ]);
  mockDatabase.seed('finance_accounts', [
    { id: 'v2-account', payload: '{}', status: 'active' }
  ]);
  mockDatabase.seed('tracking_events', [
    { id: 'v3-event', payload: '{}', decision_status: 'accepted' }
  ]);
  mockDatabase.seed('voice_category_preferences', [
    { id: 'v4-voice', merchant_key: 'store' }
  ]);
  mockDatabase.seed('planning_budgets', [
    { id: 'v5-budget', payload: '{}', period_key: '2026-08' }
  ]);
  mockDatabase.seed('report_schedules', [
    { id: 'v6-report', payload: '{}', status: 'active' }
  ]);
  mockOpenDatabaseAsync.mockClear();
  resetDatabaseForTests();
});

it('migrates retained v1-v6 data through each pending schema in order', async () => {
  const database = await openDatabase();

  expect(
    await database.getAllAsync('SELECT local_id FROM offline_entries')
  ).toEqual([{ local_id: 'v1-entry', amount: 4, currency_code: 'SAR' }]);
  for (const [table, id] of [
    ['finance_accounts', 'v2-account'],
    ['tracking_events', 'v3-event'],
    ['voice_category_preferences', 'v4-voice'],
    ['planning_budgets', 'v5-budget'],
    ['report_schedules', 'v6-report']
  ] as const) {
    expect(await database.getAllAsync(`SELECT id FROM ${table}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })])
    );
  }
  expect(
    await database.getAllAsync(
      'SELECT version FROM schema_migrations ORDER BY version'
    )
  ).toEqual([
    { version: 1, applied_at: 1 },
    { version: 2, applied_at: 2 },
    { version: 3, applied_at: 3 },
    { version: 4, applied_at: 4 },
    { version: 5, applied_at: 5 },
    { version: 6, applied_at: 6 },
    { version: 7, applied_at: expect.any(Number) },
    { version: 8, applied_at: expect.any(Number) },
    { version: 9, applied_at: expect.any(Number) },
    { version: 10, applied_at: expect.any(Number) },
    { version: 11, applied_at: expect.any(Number) },
    { version: 12, applied_at: expect.any(Number) }
  ]);
  expect(mockDatabase.events).toEqual([
    'pragma',
    'begin',
    'ddl',
    'ddl',
    'migration',
    'ddl',
    'migration',
    'ddl',
    'migration',
    'ddl',
    'migration',
    'ddl',
    'migration',
    'ddl',
    'migration',
    'end'
  ]);

  resetDatabaseForTests();
  await openDatabase();
  expect(
    await database.getAllAsync(
      'SELECT version FROM schema_migrations ORDER BY version'
    )
  ).toHaveLength(12);
  expect(mockDatabase.events.slice(-4)).toEqual([
    'pragma',
    'begin',
    'ddl',
    'end'
  ]);
});

it('applies every migration to a fresh database', async () => {
  mockDatabase = new StatefulSqliteFake();
  resetDatabaseForTests();

  const database = await openDatabase();

  expect(
    (
      await database.getAllAsync<{ version: number }>(
        'SELECT version FROM schema_migrations ORDER BY version'
      )
    ).map((row) => row.version)
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(
    (
      await database.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
    ).map((row) => row.name)
  ).toEqual(
    expect.arrayContaining([
      'offline_entries',
      'finance_accounts',
      'tracking_events',
      'voice_category_preferences',
      'planning_budgets',
      'report_schedules',
      ...v7Tables,
      'demo_seed_markers',
      'settings_profile',
      'sync_state',
      'sync_mutation_queue',
      'sync_id_mappings',
      'planning_payment_matches'
    ])
  );
  for (const table of [
    'finance_accounts',
    'finance_categories',
    'finance_transactions',
    'planning_salary_profiles',
    'planning_budgets',
    'planning_obligations',
    'planning_savings_goals',
    'planning_payment_matches'
  ]) {
    expect(await database.getAllAsync(`SELECT id FROM ${table}`)).toEqual([]);
  }
});

it('rolls back the schema and version record when DDL fails', async () => {
  mockDatabase.failNextDdl();

  await expect(openDatabase()).rejects.toThrow('injected DDL failure');
  expect(
    await mockDatabase.getAllAsync(
      'SELECT version FROM schema_migrations ORDER BY version'
    )
  ).toHaveLength(6);
  expect(
    await mockDatabase.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
  ).not.toEqual(expect.arrayContaining(v7Tables.map((name) => ({ name }))));
  expect(mockDatabase.events).toEqual(['pragma', 'begin', 'rollback']);
});

it('creates all current tables including the idempotent demo marker', async () => {
  const database = await openDatabase();

  expect(
    (
      await database.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
    ).map((row) => row.name)
  ).toEqual(
    expect.arrayContaining([
      ...v7Tables,
      'demo_seed_markers',
      'settings_profile'
    ])
  );
  for (const [table, index] of [
    ['notifications', 'idx_notifications_lifecycle'],
    ['notification_preferences', 'idx_notification_preferences_updated_at'],
    ['assistant_consent', 'idx_assistant_consent_status'],
    ['assistant_conversations', 'idx_assistant_conversations_lifecycle'],
    ['assistant_responses', 'idx_assistant_responses_conversation'],
    ['assistant_action_previews', 'idx_assistant_previews_lifecycle'],
    ['subscription_state', 'idx_subscription_state_lifecycle'],
    ['subscription_operations', 'idx_subscription_operations_lifecycle'],
    ['support_tickets', 'idx_support_tickets_lifecycle'],
    ['support_drafts', 'idx_support_drafts_lifecycle'],
    ['support_operations', 'idx_support_operations_lifecycle']
  ])
    expect(await database.getAllAsync(`PRAGMA index_list('${table}')`)).toEqual(
      expect.arrayContaining([{ name: index }])
    );

  for (const [table, columns, values] of [
    [
      'notification_preferences',
      'id, payload, updated_at',
      ['not-singleton', '{}', 1]
    ],
    [
      'assistant_consent',
      'id, payload, status, updated_at',
      ['not-singleton', '{}', 'enabled', 1]
    ],
    [
      'subscription_state',
      'id, payload, status, updated_at',
      ['not-singleton', '{}', 'free', 1]
    ]
  ] as const) {
    await expect(
      database.runAsync(
        `INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(', ')})`,
        ...values
      )
    ).rejects.toThrow('CHECK constraint failed');
  }
  await database.runAsync(
    'INSERT INTO notifications (id, payload, event_key, category, read_at, deleted_at, sync_status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    'one',
    '{}',
    'event-1',
    'transaction',
    null,
    null,
    'synced',
    1
  );
  await expect(
    database.runAsync(
      'INSERT INTO notifications (id, payload, event_key, category, read_at, deleted_at, sync_status, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'two',
      '{}',
      'event-1',
      'transaction',
      null,
      null,
      'synced',
      2
    )
  ).rejects.toThrow('UNIQUE constraint failed: notifications.event_key');
  for (const table of [
    'assistant_action_previews',
    'subscription_operations',
    'support_operations'
  ]) {
    const columns =
      table === 'assistant_action_previews'
        ? 'id, payload, response_id, operation_id, status, expires_at'
        : 'id, payload, operation_id, kind, status, requested_at';
    const values =
      table === 'assistant_action_previews'
        ? ['one', '{}', 'response', 'operation-1', 'ready', null]
        : ['one', '{}', 'operation-1', 'test', 'pending', 1];
    await database.runAsync(
      `INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(', ')})`,
      ...values
    );
    await expect(
      database.runAsync(
        `INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(', ')})`,
        ...values.map((value, index) => (index === 0 ? 'two' : value))
      )
    ).rejects.toThrow(`UNIQUE constraint failed: ${table}.operation_id`);
  }
});

it('serializes exclusive database writes', async () => {
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstFinished = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const database = await openDatabase();
  const first = runExclusiveDatabaseTransaction(database, async () => {
    order.push('first-start');
    await firstFinished;
    order.push('first-end');
  });
  const second = runExclusiveDatabaseTransaction(database, async () => {
    order.push('second');
  });
  await Promise.resolve();
  expect(order).toEqual(['first-start']);
  releaseFirst();
  await Promise.all([first, second]);
  expect(order).toEqual(['first-start', 'first-end', 'second']);
});

it('repairs only legacy transfer category links once in shadow and JSON data', async () => {
  mockDatabase = new StatefulSqliteFake();
  mockDatabase.seed(
    'schema_migrations',
    Array.from({ length: 10 }, (_, index) => ({
      version: index + 1,
      applied_at: index + 1
    }))
  );
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
  mockDatabase.seed('finance_transactions', [
    {
      id: legacyTransfer.id,
      type: legacyTransfer.type,
      category_id: legacyTransfer.categoryId,
      payload: JSON.stringify(legacyTransfer)
    },
    {
      id: cleanTransfer.id,
      type: cleanTransfer.type,
      category_id: cleanTransfer.categoryId,
      payload: JSON.stringify(cleanTransfer)
    },
    {
      id: expense.id,
      type: expense.type,
      category_id: expense.categoryId,
      payload: JSON.stringify(expense)
    }
  ]);
  resetDatabaseForTests();

  const database = await openDatabase();
  const repaired = await database.getAllAsync<Row>(
    'SELECT * FROM finance_transactions'
  );
  const legacy = repaired.find((row) => row.id === legacyTransfer.id)!;
  expect(legacy.category_id).toBeNull();
  expect(JSON.parse(String(legacy.payload))).toEqual({
    ...legacyTransfer,
    categoryId: null
  });
  expect(repaired.find((row) => row.id === cleanTransfer.id)).toEqual({
    id: cleanTransfer.id,
    type: cleanTransfer.type,
    category_id: null,
    payload: JSON.stringify(cleanTransfer)
  });
  expect(repaired.find((row) => row.id === expense.id)).toEqual({
    id: expense.id,
    type: expense.type,
    category_id: expense.categoryId,
    payload: JSON.stringify(expense)
  });

  resetDatabaseForTests();
  await openDatabase();
  expect(
    await database.getAllAsync<Row>('SELECT * FROM finance_transactions')
  ).toEqual(repaired);
});
