import app from '../../app.json';

const mockExistingFiles = new Set(['file:///databases/masarifi.db']);
const mockDeletedFiles: string[] = [];
const mockDeleteFailures = new Map<string, number>();
const mockSql: string[] = [];
const mockSecureValues = new Map<string, string>();
let mismatchCounts = false;
let migrationMarker: string | null = null;
let failSchemaMigration = false;
interface MockDatabase {
  execAsync(sql: string): Promise<void>;
  getFirstAsync(sql: string): Promise<Record<string, unknown> | null>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  runAsync(): Promise<void>;
  withExclusiveTransactionAsync(
    operation: (database: MockDatabase) => Promise<void>
  ): Promise<void>;
  closeAsync(): Promise<void>;
}
const mockDatabase: MockDatabase = {
  execAsync: jest.fn(async (sql: string) => {
    mockSql.push(sql);
    if (failSchemaMigration && sql.includes('PRAGMA journal_mode'))
      throw new Error('schema migration failed');
  }),
  getFirstAsync: jest.fn(async (sql: string) => {
    if (sql.includes('cipher_version')) return { cipher_version: '4.6.1' };
    if (sql.includes('_masarifi_migration_state'))
      return migrationMarker ? { value: migrationMarker } : null;
    if (mismatchCounts && sql.includes('main."offline_entries"'))
      return { count: 2 };
    return { count: 1 };
  }),
  getAllAsync: jest.fn(async (sql: string) =>
    sql.includes('legacy.sqlite_master') ? [{ name: 'offline_entries' }] : []
  ) as unknown as MockDatabase['getAllAsync'],
  runAsync: jest.fn(async () => undefined),
  withExclusiveTransactionAsync: jest.fn(
    async (operation: (database: MockDatabase) => Promise<void>) =>
      operation(mockDatabase)
  ),
  closeAsync: jest.fn(async () => undefined)
};

jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: 'file:///databases',
  openDatabaseAsync: jest.fn(async (name: string) => {
    mockExistingFiles.add(`file:///databases/${name}`);
    return mockDatabase;
  })
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(
    async (key: string) => mockSecureValues.get(key) ?? null
  ),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureValues.set(key, value);
  })
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
    value.includes('owner-b') ? 'b'.repeat(64) : 'a'.repeat(64)
  ),
  getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(7))
}));
jest.mock('expo-file-system', () => ({
  File: class {
    readonly uri: string;
    constructor(directory: string, name: string) {
      this.uri = `${directory}/${name}`;
    }
    get exists() {
      return mockExistingFiles.has(this.uri);
    }
    delete() {
      const failures = mockDeleteFailures.get(this.uri) ?? 0;
      if (failures > 0) {
        mockDeleteFailures.set(this.uri, failures - 1);
        throw new Error('delete failed');
      }
      mockDeletedFiles.push(this.uri);
      mockExistingFiles.delete(this.uri);
    }
  }
}));

const SQLite = jest.requireMock('expo-sqlite') as {
  openDatabaseAsync: jest.Mock;
};
const SecureStore = jest.requireMock('expo-secure-store') as {
  setItemAsync: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const {
  clearDatabaseOwner,
  configureDatabaseOwner,
  openDatabase,
  resetDatabaseForTests,
  runExclusiveDatabaseTransaction
} = require('./database') as typeof import('./database');

beforeEach(async () => {
  await clearDatabaseOwner();
  resetDatabaseForTests();
  mockExistingFiles.clear();
  mockExistingFiles.add('file:///databases/masarifi.db');
  mockDeletedFiles.length = 0;
  mockDeleteFailures.clear();
  mockSql.length = 0;
  mockSecureValues.clear();
  mismatchCounts = false;
  migrationMarker = null;
  failSchemaMigration = false;
  jest.clearAllMocks();
});

test('binds the legacy store once, exports it into an encrypted owner namespace, and preserves rows', async () => {
  mockSecureValues.set('masarifi.database.legacyOwnerHash', 'a'.repeat(64));
  await configureDatabaseOwner('user_owner-a');
  await openDatabase();

  expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(
    `masarifi-${'a'.repeat(24)}.db`
  );
  expect(mockSql[0]).toMatch(/^PRAGMA key = "x'[0-9a-f]{64}'";$/);
  expect(mockSql.join('\n')).toContain(
    "ATTACH DATABASE 'file:///databases/masarifi.db' AS legacy KEY ''"
  );
  expect(mockSql.join('\n')).toContain("sqlcipher_export('main', 'legacy')");
  expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
    'SELECT count(*) AS count FROM legacy."offline_entries"'
  );
  expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
    'SELECT count(*) AS count FROM main."offline_entries"'
  );
  expect(mockDeletedFiles).toContain('file:///databases/masarifi.db');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'masarifi.database.legacyOwnerHash',
    'a'.repeat(64)
  );
});

test('does not assign an unclaimed legacy database to the first signed-in owner', async () => {
  await configureDatabaseOwner('user_owner-a');
  await openDatabase();

  expect(mockSql.join('\n')).not.toContain('sqlcipher_export');
  expect(mockExistingFiles).toContain('file:///databases/masarifi.db');
});

test('keeps the plaintext legacy store when encrypted row counts differ', async () => {
  mismatchCounts = true;
  mockSecureValues.set('masarifi.database.legacyOwnerHash', 'a'.repeat(64));
  await configureDatabaseOwner('user_owner-a');

  await expect(openDatabase()).rejects.toThrow(
    'legacy database row-count mismatch'
  );
  expect(mockExistingFiles).toContain('file:///databases/masarifi.db');
  expect(mockDeletedFiles).not.toContain('file:///databases/masarifi.db');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(
    'masarifi.database.legacyOwnerHash',
    expect.anything()
  );
});

test('closes the active connection before switching to another owner namespace', async () => {
  mockExistingFiles.clear();
  await configureDatabaseOwner('user_owner-a');
  await openDatabase();
  await configureDatabaseOwner('user_owner-b');

  expect(mockDatabase.closeAsync).toHaveBeenCalledTimes(1);
  await openDatabase();
  expect(SQLite.openDatabaseAsync).toHaveBeenLastCalledWith(
    `masarifi-${'b'.repeat(24)}.db`
  );

  await configureDatabaseOwner('user_owner-a');
  await openDatabase();
  expect(SQLite.openDatabaseAsync).toHaveBeenLastCalledWith(
    `masarifi-${'a'.repeat(24)}.db`
  );
});

test('enables the native SQLCipher build in Expo configuration', () => {
  expect(app.expo.plugins).toContainEqual([
    'expo-sqlite',
    { useSQLCipher: true }
  ]);
});

test('rejects live database access until an authenticated owner is configured', async () => {
  process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
  try {
    await expect(openDatabase()).rejects.toThrow('database owner required');
    expect(SQLite.openDatabaseAsync).not.toHaveBeenCalled();
  } finally {
    delete process.env.EXPO_PUBLIC_CLIENT_MODE;
  }
});

test('rejects a stale database handle in live mode', async () => {
  process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
  try {
    await configureDatabaseOwner('user_owner-a');
    await openDatabase();
    await expect(
      runExclusiveDatabaseTransaction({} as never, async () => undefined)
    ).rejects.toThrow('stale database owner');
  } finally {
    delete process.env.EXPO_PUBLIC_CLIENT_MODE;
  }
});

test('rejects a requested owner that differs from the active database owner', async () => {
  await configureDatabaseOwner('user_owner-a');
  const active = await openDatabase();
  await expect(openDatabase('user_owner-b')).rejects.toThrow(
    'stale database owner'
  );
  await expect(openDatabase('user_owner-a')).resolves.toBe(active);
});

test('finishes deleting a verified plaintext legacy store after an interrupted cleanup', async () => {
  const ownerHash = 'a'.repeat(64);
  migrationMarker = ownerHash;
  mockExistingFiles.add(
    `file:///databases/masarifi-${ownerHash.slice(0, 24)}.db`
  );
  mockSecureValues.set('masarifi.database.legacyOwnerHash', ownerHash);

  await configureDatabaseOwner('user_owner-a');
  await openDatabase();

  expect(mockDeletedFiles).toContain('file:///databases/masarifi.db');
  expect(mockSql.join('\n')).not.toContain('sqlcipher_export');
});

test('preserves plaintext when an existing target has equal counts without an export marker', async () => {
  const ownerHash = 'a'.repeat(64);
  mockExistingFiles.add(
    `file:///databases/masarifi-${ownerHash.slice(0, 24)}.db`
  );
  mockSecureValues.set('masarifi.database.legacyOwnerHash', ownerHash);

  await configureDatabaseOwner('user_owner-a');
  await expect(openDatabase()).rejects.toThrow(
    'legacy database migration incomplete'
  );

  expect(mockDeletedFiles).toEqual([]);
});

test('preserves both copies when schema migration fails after a verified export', async () => {
  const ownerHash = 'a'.repeat(64);
  mockSecureValues.set('masarifi.database.legacyOwnerHash', ownerHash);
  failSchemaMigration = true;

  await configureDatabaseOwner('user_owner-a');
  await expect(openDatabase()).rejects.toThrow('schema migration failed');

  expect(mockExistingFiles).toContain('file:///databases/masarifi.db');
  expect(mockExistingFiles).toContain(
    `file:///databases/masarifi-${ownerHash.slice(0, 24)}.db`
  );
});

test('retries plaintext sidecar cleanup after deletion is interrupted', async () => {
  const ownerHash = 'a'.repeat(64);
  const target = `file:///databases/masarifi-${ownerHash.slice(0, 24)}.db`;
  const wal = 'file:///databases/masarifi.db-wal';
  mockExistingFiles.add(target);
  mockExistingFiles.add(wal);
  mockSecureValues.set('masarifi.database.legacyOwnerHash', ownerHash);
  migrationMarker = ownerHash;
  mockDeleteFailures.set(wal, 1);

  await configureDatabaseOwner('user_owner-a');
  await expect(openDatabase()).rejects.toThrow('delete failed');
  expect(mockExistingFiles).toContain(wal);

  await expect(openDatabase()).resolves.toBe(mockDatabase);
  expect(mockExistingFiles).not.toContain(wal);
});

test('serializes an owner switch before a concurrent database open', async () => {
  mockExistingFiles.clear();
  await configureDatabaseOwner('user_owner-a');
  await openDatabase();

  const switching = configureDatabaseOwner('user_owner-b');
  const opening = openDatabase();
  await Promise.all([switching, opening]);

  expect(SQLite.openDatabaseAsync).toHaveBeenLastCalledWith(
    `masarifi-${'b'.repeat(24)}.db`
  );
});
