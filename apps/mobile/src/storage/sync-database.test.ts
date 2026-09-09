type Row = Record<string, unknown>;

class V9Database {
  readonly rows = new Map<string, Row[]>([
    [
      'schema_migrations',
      Array.from({ length: 9 }, (_, index) => ({ version: index + 1 }))
    ],
    ['finance_accounts', [{ id: 'local-account', payload: '{"name":"Cash"}' }]]
  ]);

  async execAsync(sql: string): Promise<void> {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g))
      this.rows.set(match[1]!, this.rows.get(match[1]!) ?? []);
  }

  async withExclusiveTransactionAsync(
    action: (database: this) => Promise<void>
  ): Promise<void> {
    await action(this);
  }

  async getAllAsync<T>(sql: string): Promise<T[]> {
    const table = sql.match(/FROM (\w+)/)?.[1];
    return [...(this.rows.get(table ?? '') ?? [])] as T[];
  }

  async runAsync(sql: string, version: number): Promise<void> {
    if (sql.includes('schema_migrations'))
      this.rows.set('schema_migrations', [
        ...(this.rows.get('schema_migrations') ?? []),
        { version }
      ]);
  }
}

const mockDatabase = new V9Database();
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockDatabase)
}));

const { openDatabase, resetDatabaseForTests } =
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./database') as typeof import('./database');

describe('sync schema through v12', () => {
  beforeEach(() => resetDatabaseForTests());

  it('adds sync metadata and later repairs while preserving populated v9 finance data', async () => {
    const migrated = await openDatabase();
    expect(
      await migrated.getAllAsync('SELECT * FROM finance_accounts')
    ).toEqual([{ id: 'local-account', payload: '{"name":"Cash"}' }]);
    expect(
      (
        await migrated.getAllAsync<{ version: number }>(
          'SELECT version FROM schema_migrations'
        )
      ).at(-1)
    ).toEqual({ version: 12 });
    for (const table of [
      'sync_state',
      'sync_mutation_queue',
      'sync_id_mappings'
    ])
      expect(await migrated.getAllAsync(`SELECT * FROM ${table}`)).toEqual([]);
  });
});
