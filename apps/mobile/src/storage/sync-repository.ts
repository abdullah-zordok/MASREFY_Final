import type { SQLiteDatabase } from 'expo-sqlite';

import { openDatabase, runExclusiveDatabaseTransaction } from './database';

export type SyncDomain = 'accounts' | 'categories' | 'transactions';
export type SyncResourceType = 'account' | 'category' | 'transaction';
export type QueueStatus =
  'pending' | 'sending' | 'applied' | 'conflict' | 'rejected';

export interface LocalSyncMutation {
  operationId: string;
  domain: SyncDomain;
  resourceType: SyncResourceType;
  schemaVersion: 1;
  dependsOn: string[];
  operation: string;
  resourceId: string | null;
  baseVersion: number | null;
  payload: Record<string, unknown>;
}

export interface QueuedSyncMutation extends LocalSyncMutation {
  status: QueueStatus;
  attemptCount: number;
  nextAttemptAt: number | null;
  lastErrorCode: string | null;
}

export class SyncRepository {
  constructor(private readonly database?: SQLiteDatabase) {}

  private async db(): Promise<SQLiteDatabase> {
    return this.database ?? openDatabase();
  }

  async enqueue(mutation: LocalSyncMutation, now = Date.now()): Promise<void> {
    const database = await this.db();
    await database.runAsync(
      `INSERT OR IGNORE INTO sync_mutation_queue(
        operation_id,domain,resource_type,schema_version,depends_on,operation,
        resource_id,base_version,payload,status,
        attempt_count,next_attempt_at,last_error_code,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,'pending',0,NULL,NULL,?,?)`,
      mutation.operationId,
      mutation.domain,
      mutation.resourceType,
      mutation.schemaVersion,
      JSON.stringify(mutation.dependsOn),
      mutation.operation,
      mutation.resourceId,
      mutation.baseVersion,
      JSON.stringify(mutation.payload),
      now,
      now
    );
  }

  async ready(now = Date.now(), limit = 100): Promise<QueuedSyncMutation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('SYNC_QUEUE_LIMIT_INVALID');
    const rows = await (
      await this.db()
    ).getAllAsync<{
      operation_id: string;
      domain: SyncDomain;
      resource_type: SyncResourceType;
      schema_version: 1;
      depends_on: string;
      operation: string;
      resource_id: string | null;
      base_version: number | null;
      payload: string;
      status: QueueStatus;
      attempt_count: number;
      next_attempt_at: number | null;
      last_error_code: string | null;
    }>(
      `SELECT * FROM sync_mutation_queue
       WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?)
       ORDER BY created_at,operation_id LIMIT ?`,
      now,
      limit
    );
    return rows.map((row) => ({
      operationId: row.operation_id,
      domain: row.domain,
      resourceType: row.resource_type,
      schemaVersion: row.schema_version,
      dependsOn: JSON.parse(row.depends_on) as string[],
      operation: row.operation,
      resourceId: row.resource_id,
      baseVersion: row.base_version,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at,
      lastErrorCode: row.last_error_code
    }));
  }

  async markSending(operationIds: string[], now = Date.now()): Promise<void> {
    const database = await this.db();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      for (const operationId of operationIds)
        await transaction.runAsync(
          `UPDATE sync_mutation_queue SET status='sending',attempt_count=attempt_count+1,
             updated_at=? WHERE operation_id=? AND status='pending'`,
          now,
          operationId
        );
    });
  }

  async complete(
    operationId: string,
    status: 'applied' | 'conflict' | 'rejected',
    errorCode: string | null
  ): Promise<void> {
    await (
      await this.db()
    ).runAsync(
      `UPDATE sync_mutation_queue SET status=?,last_error_code=?,next_attempt_at=NULL,
         updated_at=? WHERE operation_id=?`,
      status,
      errorCode,
      Date.now(),
      operationId
    );
  }

  async recoverSending(now = Date.now()): Promise<void> {
    await (
      await this.db()
    ).runAsync(
      `UPDATE sync_mutation_queue SET status='pending',next_attempt_at=?,updated_at=?
       WHERE status='sending'`,
      now,
      now
    );
  }

  async retry(
    operationId: string,
    nextAttemptAt: number,
    errorCode: string,
    now = Date.now()
  ): Promise<void> {
    const boundedNextAttemptAt = Math.min(
      Math.max(nextAttemptAt, now),
      now + 300_000
    );
    await (
      await this.db()
    ).runAsync(
      `UPDATE sync_mutation_queue SET status='pending',next_attempt_at=?,last_error_code=?,
         updated_at=? WHERE operation_id=?`,
      boundedNextAttemptAt,
      errorCode,
      now,
      operationId
    );
  }

  async cursor(domain: SyncDomain): Promise<string | null> {
    const row = await (
      await this.db()
    ).getFirstAsync<{ cursor: string }>(
      'SELECT cursor FROM sync_state WHERE domain=?',
      domain
    );
    return row?.cursor ?? null;
  }

  async saveCursor(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    cursor: string,
    lastMutationId: string | null,
    now = Date.now()
  ): Promise<void> {
    await transaction.runAsync(
      `INSERT INTO sync_state(domain,cursor,last_mutation_id,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(domain) DO UPDATE SET cursor=excluded.cursor,
         last_mutation_id=excluded.last_mutation_id,updated_at=excluded.updated_at`,
      domain,
      cursor,
      lastMutationId,
      now
    );
  }

  async mapId(
    domain: SyncDomain,
    localId: string,
    serverId: string,
    now = Date.now()
  ): Promise<void> {
    await (
      await this.db()
    ).runAsync(
      `INSERT INTO sync_id_mappings(domain,local_id,server_id,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(domain,local_id) DO UPDATE SET server_id=excluded.server_id,
         updated_at=excluded.updated_at`,
      domain,
      localId,
      serverId,
      now
    );
  }

  async resourceState(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    serverId: string
  ): Promise<{ version: number; deletedAt: number | null } | null> {
    const row = await transaction.getFirstAsync<{
      version: number;
      deleted_at: number | null;
    }>(
      'SELECT version,deleted_at FROM sync_resource_state WHERE domain=? AND server_id=?',
      domain,
      serverId
    );
    return row ? { version: row.version, deletedAt: row.deleted_at } : null;
  }

  async saveResourceState(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    serverId: string,
    version: number,
    deletedAt: number | null,
    now = Date.now()
  ): Promise<void> {
    await transaction.runAsync(
      `INSERT INTO sync_resource_state(domain,server_id,version,deleted_at,updated_at)
       VALUES(?,?,?,?,?) ON CONFLICT(domain,server_id) DO UPDATE SET
         version=excluded.version,deleted_at=excluded.deleted_at,updated_at=excluded.updated_at
       WHERE excluded.version>sync_resource_state.version`,
      domain,
      serverId,
      version,
      deletedAt,
      now
    );
  }
}
