import type { SQLiteDatabase } from 'expo-sqlite';

import { openDatabase, runExclusiveDatabaseTransaction } from './database';
import { SyncRepository, type SyncDomain } from './sync-repository';

export interface ServerChange {
  resourceId: string;
  operation: 'upsert' | 'delete';
  version: number;
  snapshot?: Record<string, unknown>;
  deletedAt: string | null;
}

export interface ServerConflict {
  id: string;
  transactionId: string;
  serverSnapshot: Record<string, unknown>;
  clientSnapshot: Record<string, unknown>;
  status: 'open' | 'resolved' | 'rejected';
  resolution: 'server' | 'client' | 'merged' | 'duplicate' | null;
  createdAt: string;
  resolvedAt: string | null;
}

export class CoreFinanceSyncAdapter {
  private readonly sync: SyncRepository;

  constructor(
    private readonly database?: SQLiteDatabase,
    sync?: SyncRepository
  ) {
    this.sync = sync ?? new SyncRepository(database);
  }

  private async db(): Promise<SQLiteDatabase> {
    return this.database ?? openDatabase();
  }

  async applyBootstrap(
    domain: SyncDomain,
    items: Record<string, unknown>[],
    cursor: string,
    hasMore: boolean
  ): Promise<void> {
    const database = await this.db();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      for (const item of items) {
        const serverId = this.text(item.id);
        const version = this.version(item.version);
        const state = await this.sync.resourceState(
          transaction,
          domain,
          serverId
        );
        if (state && version <= state.version) continue;
        if (await this.upsert(transaction, domain, serverId, item, version))
          await this.sync.saveResourceState(
            transaction,
            domain,
            serverId,
            version,
            null
          );
      }
      if (!hasMore)
        await this.sync.saveCursor(transaction, domain, cursor, null);
    });
  }

  async applyDelta(
    domain: SyncDomain,
    changes: ServerChange[],
    cursor: string,
    lastMutationId: string | null
  ): Promise<void> {
    const database = await this.db();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      for (const change of changes) {
        const state = await this.sync.resourceState(
          transaction,
          domain,
          change.resourceId
        );
        if (state && change.version <= state.version) continue;
        let applied = false;
        if (change.operation === 'delete')
          applied = await this.tombstone(transaction, domain, change);
        else if (change.snapshot)
          applied = await this.upsert(
            transaction,
            domain,
            change.resourceId,
            change.snapshot,
            change.version
          );
        else throw new Error('SYNC_SNAPSHOT_REQUIRED');
        if (applied)
          await this.sync.saveResourceState(
            transaction,
            domain,
            change.resourceId,
            change.version,
            change.operation === 'delete' && change.deletedAt
              ? Date.parse(change.deletedAt)
              : null
          );
      }
      await this.sync.saveCursor(transaction, domain, cursor, lastMutationId);
    });
  }

  async storeConflict(conflict: ServerConflict): Promise<void> {
    const database = await this.db();
    await database.runAsync(
      `INSERT INTO finance_sync_conflicts(id,transaction_id,payload,status,created_at)
       VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,status=excluded.status`,
      conflict.id,
      conflict.transactionId,
      JSON.stringify({
        id: conflict.id,
        transactionId: conflict.transactionId,
        localSnapshot: this.transaction(
          conflict.clientSnapshot,
          conflict.transactionId
        ),
        laterSnapshot: this.transaction(
          conflict.serverSnapshot,
          conflict.transactionId
        ),
        resolution:
          conflict.resolution === 'client' || conflict.resolution === 'merged'
            ? 'keep_local'
            : conflict.resolution === 'server' ||
                conflict.resolution === 'duplicate'
              ? 'keep_later'
              : null,
        status: conflict.status === 'open' ? 'pending' : 'resolved',
        createdAt: Date.parse(conflict.createdAt),
        resolvedAt: conflict.resolvedAt ? Date.parse(conflict.resolvedAt) : null
      }),
      conflict.status === 'open' ? 'pending' : 'resolved',
      Date.parse(conflict.createdAt)
    );
  }

  private async upsert(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    serverId: string,
    snapshot: Record<string, unknown>,
    version: number
  ): Promise<boolean> {
    const localId = await this.localId(transaction, domain, serverId);
    if (await this.hasPending(transaction, localId)) {
      if (domain === 'transactions')
        await this.pendingConflict(transaction, localId, serverId, version, {
          kind: 'server_update_vs_local_edit',
          snapshot
        });
      await this.markLocalConflict(transaction, localId);
      return false;
    }
    snapshot = await this.translateRelationships(transaction, domain, snapshot);
    const now = this.time(snapshot.updated_at ?? snapshot.updatedAt);
    if (domain === 'accounts') {
      const account = this.account(snapshot, localId);
      await transaction.runAsync(
        `INSERT INTO finance_accounts(id,payload,status,is_default,updated_at) VALUES(?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,status=excluded.status,
           is_default=excluded.is_default,updated_at=excluded.updated_at`,
        localId,
        JSON.stringify(account),
        account.status,
        account.isDefault ? 1 : 0,
        now
      );
    } else if (domain === 'categories') {
      const category = this.category(snapshot, localId);
      await transaction.runAsync(
        `INSERT INTO finance_categories(id,payload,parent_id,status,merged_into_id,updated_at)
         VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,
           parent_id=excluded.parent_id,status=excluded.status,
           merged_into_id=excluded.merged_into_id,updated_at=excluded.updated_at`,
        localId,
        JSON.stringify(category),
        category.parentId,
        category.status,
        category.mergedIntoId,
        now
      );
    } else {
      const ledgerEntry = this.transaction(snapshot, localId);
      await transaction.runAsync(
        `INSERT INTO finance_transactions(
           id,payload,account_id,destination_account_id,category_id,occurred_at,type,source,
           status,sync_status,review_status,normalized_title,amount_minor,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,account_id=excluded.account_id,
           destination_account_id=excluded.destination_account_id,category_id=excluded.category_id,
           occurred_at=excluded.occurred_at,type=excluded.type,source=excluded.source,
           status=excluded.status,sync_status=excluded.sync_status,
           review_status=excluded.review_status,normalized_title=excluded.normalized_title,
           amount_minor=excluded.amount_minor,updated_at=excluded.updated_at`,
        localId,
        JSON.stringify(ledgerEntry),
        ledgerEntry.accountId,
        ledgerEntry.destinationAccountId,
        ledgerEntry.categoryId,
        ledgerEntry.occurredAt,
        ledgerEntry.type,
        ledgerEntry.source,
        ledgerEntry.status,
        ledgerEntry.syncStatus,
        ledgerEntry.reviewStatus,
        ledgerEntry.title.toLocaleLowerCase(),
        ledgerEntry.amountMinor,
        ledgerEntry.updatedAt
      );
    }
    await transaction.runAsync(
      `INSERT INTO sync_id_mappings(domain,local_id,server_id,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(domain,local_id) DO UPDATE SET server_id=excluded.server_id,
         updated_at=excluded.updated_at`,
      domain,
      localId,
      serverId,
      now
    );
    return true;
  }

  private async tombstone(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    change: ServerChange
  ): Promise<boolean> {
    const localId = await this.localId(transaction, domain, change.resourceId);
    if (await this.hasPending(transaction, localId)) {
      if (domain === 'transactions')
        await this.pendingConflict(
          transaction,
          localId,
          change.resourceId,
          change.version,
          {
            kind: 'delete_vs_local_edit',
            change
          }
        );
      await this.markLocalConflict(transaction, localId);
      return false;
    }
    const table = `finance_${domain}`;
    await transaction.runAsync(
      `UPDATE ${table} SET status=?,updated_at=? WHERE id=?`,
      domain === 'transactions' ? 'deleted' : 'archived',
      change.deletedAt ? Date.parse(change.deletedAt) : Date.now(),
      localId
    );
    await transaction.runAsync(
      `INSERT INTO sync_id_mappings(domain,local_id,server_id,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(domain,local_id) DO UPDATE SET server_id=excluded.server_id,
         updated_at=excluded.updated_at`,
      domain,
      localId,
      change.resourceId,
      change.deletedAt ? Date.parse(change.deletedAt) : Date.now()
    );
    return true;
  }

  private async pendingConflict(
    transaction: SQLiteDatabase,
    localId: string,
    serverId: string,
    version: number,
    payload: Record<string, unknown>
  ): Promise<void> {
    await transaction.runAsync(
      `INSERT OR IGNORE INTO finance_sync_conflicts(id,transaction_id,payload,status,created_at)
       VALUES(?,?,?,?,?)`,
      `sync:${serverId}:${String(version)}`,
      localId,
      JSON.stringify(payload),
      'pending',
      Date.now()
    );
  }

  private async markLocalConflict(
    transaction: SQLiteDatabase,
    localId: string
  ): Promise<void> {
    await transaction.runAsync(
      `UPDATE sync_mutation_queue SET status='conflict',last_error_code='SYNC_SERVER_CONFLICT',
         next_attempt_at=NULL,updated_at=?
       WHERE resource_id=? AND status IN ('pending','sending')`,
      Date.now(),
      localId
    );
  }

  private async translateRelationships(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    snapshot: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (domain === 'categories') {
      const parent = snapshot.parent_id ?? snapshot.parentId;
      const merged = snapshot.merged_into_id ?? snapshot.mergedIntoId;
      return {
        ...snapshot,
        ...(typeof parent === 'string'
          ? {
              parent_id: await this.mappedLocalId(
                transaction,
                'categories',
                parent
              )
            }
          : {}),
        ...(typeof merged === 'string'
          ? {
              merged_into_id: await this.mappedLocalId(
                transaction,
                'categories',
                merged
              )
            }
          : {})
      };
    }
    if (domain !== 'transactions') return snapshot;
    const category = snapshot.category_id ?? snapshot.categoryId;
    const postings = Array.isArray(snapshot.postings)
      ? await Promise.all(
          (snapshot.postings as Record<string, unknown>[]).map(
            async (posting) => {
              const account = posting.account_id ?? posting.accountId;
              return typeof account === 'string'
                ? {
                    ...posting,
                    account_id: await this.mappedLocalId(
                      transaction,
                      'accounts',
                      account
                    )
                  }
                : posting;
            }
          )
        )
      : snapshot.postings;
    return {
      ...snapshot,
      ...(typeof category === 'string'
        ? {
            category_id: await this.mappedLocalId(
              transaction,
              'categories',
              category
            )
          }
        : {}),
      ...(postings ? { postings } : {})
    };
  }

  private async hasPending(
    transaction: SQLiteDatabase,
    resourceId: string
  ): Promise<boolean> {
    return Boolean(
      await transaction.getFirstAsync(
        `SELECT 1 present FROM sync_mutation_queue
         WHERE resource_id=? AND status IN ('pending','sending') LIMIT 1`,
        resourceId
      )
    );
  }

  private async localId(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    serverId: string
  ): Promise<string> {
    return this.mappedLocalId(transaction, domain, serverId);
  }

  private async mappedLocalId(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    serverId: string
  ): Promise<string> {
    const row = await transaction.getFirstAsync<{ local_id: string }>(
      'SELECT local_id FROM sync_id_mappings WHERE domain=? AND server_id=?',
      domain,
      serverId
    );
    return row?.local_id ?? serverId;
  }

  private version(value: unknown): number {
    const version = Number(value);
    if (!Number.isSafeInteger(version) || version < 0)
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return version;
  }

  private account(value: Record<string, unknown>, id: string) {
    return {
      id,
      name: this.text(value.name),
      type: this.text(value.type),
      currencyCode: this.text(value.currency_code ?? value.currencyCode),
      openingBalanceMinor: 0,
      institution: this.nullable(value.institution_name ?? value.institution),
      lastFour: this.nullable(value.last_four ?? value.lastFour),
      creditLimitMinor: this.numberOrNull(
        value.credit_limit_minor ?? value.creditLimitMinor
      ),
      isDefault: Boolean(value.is_default ?? value.isDefault),
      iconKey: this.nullable(value.icon_key ?? value.iconKey),
      colorKey: this.nullable(value.color_key ?? value.colorKey),
      notes: this.nullable(value.notes),
      status:
        value.status === 'active' ? ('active' as const) : ('archived' as const),
      createdAt: this.time(value.created_at ?? value.createdAt),
      updatedAt: this.time(value.updated_at ?? value.updatedAt)
    };
  }

  private category(value: Record<string, unknown>, id: string) {
    const active = value.active === true;
    const transfer = value.kind === 'transfer';
    const merged = value.merged_into_id ?? value.mergedIntoId;
    return {
      id,
      kind:
        (value.system_key ?? value.systemKey)
          ? ('system' as const)
          : ('custom' as const),
      financialType:
        value.kind === 'income' ? ('income' as const) : ('expense' as const),
      parentId: this.nullable(value.parent_id ?? value.parentId),
      labelAr: this.text(value.label_ar ?? value.labelAr),
      labelEn: this.text(value.label_en ?? value.labelEn),
      iconKey: this.nullable(value.icon ?? value.iconKey),
      colorKey: this.nullable(value.color ?? value.colorKey),
      isFavorite: false,
      status: transfer
        ? ('archived' as const)
        : merged
          ? ('merged' as const)
          : active
            ? ('active' as const)
            : ('archived' as const),
      mergedIntoId: this.nullable(merged),
      createdAt: this.time(value.created_at ?? value.createdAt),
      updatedAt: this.time(value.updated_at ?? value.updatedAt)
    };
  }

  private transaction(value: Record<string, unknown>, id: string) {
    const postings = Array.isArray(value.postings)
      ? (value.postings as Record<string, unknown>[])
      : [];
    const source =
      postings.find((posting) => posting.posting_role === 'source') ??
      postings[0];
    const destination = postings.find(
      (posting) => posting.posting_role === 'destination'
    );
    const kind = this.text(value.kind ?? value.type);
    const type = kind === 'opening' ? ('adjustment' as const) : kind;
    const transferPurpose = value.transfer_purpose ?? value.transferPurpose;
    const status = this.text(value.status);
    return {
      id,
      type,
      amountMinor: Number(value.amount_minor ?? value.amountMinor),
      currencyCode: this.text(value.currency_code ?? value.currencyCode).trim(),
      accountId: this.text(
        source?.account_id ?? source?.accountId ?? value.accountId
      ),
      destinationAccountId: this.nullable(
        destination?.account_id ??
          destination?.accountId ??
          value.destinationAccountId
      ),
      feeMinor: Number(value.fee_minor ?? value.feeMinor ?? 0),
      transferPurpose:
        type === 'transfer'
          ? transferPurpose === 'card_payoff'
            ? ('card_payoff' as const)
            : ('internal' as const)
          : null,
      categoryId:
        type === 'transfer'
          ? null
          : this.nullable(value.category_id ?? value.categoryId),
      title: this.text(value.title),
      merchant: this.nullable(value.merchant),
      paymentMethod: this.nullable(value.payment_method ?? value.paymentMethod),
      occurredAt: this.time(value.occurred_at ?? value.occurredAt),
      source: this.text(value.source),
      status:
        status === 'confirmed'
          ? ('posted' as const)
          : status === 'draft'
            ? ('pending' as const)
            : status,
      reviewStatus: 'none' as const,
      syncStatus: 'synced' as const,
      originalTransactionId: this.nullable(
        value.reverses_transaction_id ?? value.originalTransactionId
      ),
      obligationId: null,
      notes: this.nullable(value.note ?? value.notes),
      version: Number(value.version),
      adjustmentSign: 1 as const,
      deletedAt: this.timeOrNull(value.deleted_at ?? value.deletedAt),
      undoExpiresAt: this.timeOrNull(
        value.undo_expires_at ?? value.undoExpiresAt
      ),
      createdAt: this.time(value.created_at ?? value.createdAt),
      updatedAt: this.time(value.updated_at ?? value.updatedAt)
    };
  }

  private text(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return value;
  }

  private nullable(value: unknown): string | null {
    return value === null || value === undefined ? null : this.text(value);
  }

  private numberOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
  }

  private time(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return Date.parse(value);
  }

  private timeOrNull(value: unknown): number | null {
    return value === null || value === undefined ? null : this.time(value);
  }
}
