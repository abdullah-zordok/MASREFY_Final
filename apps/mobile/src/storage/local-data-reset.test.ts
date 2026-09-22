import { StatefulSqlite } from '@/test-utils/stateful-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAppShellUserData } from './app-shell-storage';
import { resetLocalUserData } from './local-data-reset';
import { clearPersistedPreferences } from './secure-preferences';
import { registerRuntimeUserDataReset } from './runtime-user-data-reset';

let mockDatabase: StatefulSqlite;

jest.mock('./database', () => ({
  openDatabase: jest.fn(async () => mockDatabase),
  runExclusiveDatabaseTransaction: jest.fn(async (db: StatefulSqlite, operation: (transaction: StatefulSqlite) => Promise<void>) => db.withExclusiveTransactionAsync(operation))
}));
jest.mock('./app-shell-storage', () => ({
  clearAppShellUserData: jest.fn(async () => undefined)
}));
jest.mock('./secure-preferences', () => ({
  clearPersistedPreferences: jest.fn(async () => undefined)
}));

const clearShellData = jest.mocked(clearAppShellUserData);
const clearPreferences = jest.mocked(clearPersistedPreferences);

const clearedTables = [
  'notifications',
  'assistant_conversations',
  'assistant_responses',
  'support_drafts',
  'support_tickets',
  'subscription_state',
  'tracking_events',
  'sms_import_queue',
  'planning_obligation_payments',
  'planning_obligations',
  'finance_corrections',
  'finance_transactions',
  'finance_accounts',
  'demo_seed_markers'
];
const preservedTables = ['schema_migrations'];

beforeEach(async () => {
  jest.clearAllMocks();
  mockDatabase = new StatefulSqlite([...clearedTables, ...preservedTables]);
  for (const table of [...clearedTables, ...preservedTables]) {
    await mockDatabase.runAsync(`INSERT INTO ${table} (id, payload) VALUES (?, ?)`, `${table}-1`, '{}');
  }
});

test('deletes every user-data table discovered from the authoritative schema', async () => {
  await AsyncStorage.setItem('masarifi.tracking.smsImportQueue.v1', 'private SMS');
  const runtimeReset = jest.fn();
  const unregister = registerRuntimeUserDataReset(runtimeReset);
  const result = await resetLocalUserData('local-delete-1');

  expect(result).toEqual({ deletedRows: clearedTables.length, operationId: 'local-delete-1' });
  for (const table of clearedTables) expect(mockDatabase.read(table)).toEqual([]);
  expect(await AsyncStorage.getItem('masarifi.tracking.smsImportQueue.v1')).toBeNull();
  expect(mockDatabase.read('schema_migrations')).toHaveLength(1);
  expect(clearShellData).toHaveBeenCalledTimes(1);
  expect(clearPreferences).toHaveBeenCalledTimes(1);
  expect(runtimeReset).toHaveBeenCalledTimes(1);
  unregister();
});

test('rolls back all deletes on failure and replays completed operations', async () => {
  const runtimeReset = jest.fn();
  const unregister = registerRuntimeUserDataReset(runtimeReset);
  mockDatabase.failNextWrite('planning_obligations');
  await expect(resetLocalUserData('local-delete-fail')).rejects.toThrow(
    'injected planning_obligations failure'
  );
  for (const table of [...clearedTables, ...preservedTables]) expect(mockDatabase.read(table)).toHaveLength(1);
  expect(clearShellData).toHaveBeenCalledTimes(1);
  expect(clearPreferences).toHaveBeenCalledTimes(1);
  expect(runtimeReset).toHaveBeenCalledTimes(1);

  await expect(resetLocalUserData('local-delete-2')).resolves.toMatchObject({ deletedRows: clearedTables.length });
  await expect(resetLocalUserData('local-delete-2')).resolves.toMatchObject({ deletedRows: clearedTables.length });
  unregister();
});
