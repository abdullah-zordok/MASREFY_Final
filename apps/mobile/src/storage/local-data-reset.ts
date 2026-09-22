import { openDatabase, runExclusiveDatabaseTransaction } from './database';
import { clearAppShellUserData } from './app-shell-storage';
import { resetRuntimeUserData } from './runtime-user-data-reset';
import { clearPersistedPreferences } from './secure-preferences';
import { clearLegacySmsImportQueue } from './sms-import-queue';

type LocalDataDeletionResult = { deletedRows: number; operationId: string };
type SqliteLike = {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  runAsync(sql: string, ...values: unknown[]): Promise<{ changes: number }>;
};

const completed = new Map<string, LocalDataDeletionResult>();
export async function resetLocalUserData(operationId: string): Promise<LocalDataDeletionResult> {
  const replay = completed.get(operationId);
  if (replay) return replay;

  let deletedRows = 0;
  const outcomes = await Promise.allSettled([
    (async () => {
      const database = await openDatabase();
      await runExclusiveDatabaseTransaction(database, async (transaction) => {
        const sqlite = transaction as SqliteLike;
        await sqlite.execAsync('PRAGMA defer_foreign_keys = ON');
        const tables = await sqlite.getAllAsync<{ name: string }>(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name != 'schema_migrations'
            AND name NOT LIKE 'sqlite_%'
        `);
        for (const { name } of tables) {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
            throw new Error('invalid local data table');
          deletedRows += (await sqlite.runAsync(`DELETE FROM "${name}"`)).changes;
        }
      });
    })(),
    clearAppShellUserData(),
    clearPersistedPreferences(),
    clearLegacySmsImportQueue()
  ]);
  await resetRuntimeUserData();
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
  );
  if (failure) throw failure.reason;

  const result = { deletedRows, operationId };
  completed.set(operationId, result);
  return result;
}
