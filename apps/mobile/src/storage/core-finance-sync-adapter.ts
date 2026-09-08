import type { SQLiteDatabase } from 'expo-sqlite';

import { accountTypes, transactionSources } from '../domain/core-finance';
import { createDefaultCategories } from '../domain/core-finance-seeds';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';
import { SyncRepository, type SyncDomain } from './sync-repository';

const accountStatuses = ['active', 'archived', 'closed'] as const;
const categoryKinds = ['income', 'expense', 'transfer'] as const;
const transactionKinds = [
  'income',
  'expense',
  'transfer',
  'opening',
  'refund',
  'reversal',
  'adjustment'
] as const;
const transactionStatuses = [
  'draft',
  'pending',
  'confirmed',
  'reversed',
  'deleted'
] as const;
const defaultFavoriteByCategory = new Map(
  createDefaultCategories().map((category) => [
    category.id,
    category.isFavorite
  ])
);

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
      if (domain === 'categories')
        await this.primeCategoryMappings(transaction, items);
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
      if (domain === 'categories')
        await this.primeCategoryMappings(
          transaction,
          changes.flatMap((change) =>
            change.snapshot ? [change.snapshot] : []
          )
        );
      for (const change of changes) {
        this.changeVersion(change.version);
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
    const systemKey =
      domain === 'categories'
        ? this.nullable(snapshot.system_key ?? snapshot.systemKey)
        : null;
    const localId =
      systemKey ?? (await this.localId(transaction, domain, serverId));
    if (
      (await this.hasUnresolvedLocalMutation(transaction, localId)) ||
      (domain === 'transactions' &&
        (await this.hasUnresolvedConflict(transaction, localId)))
    ) {
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
      const existing = await transaction.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM finance_categories WHERE id=?',
        localId
      );
      const category = this.category(
        snapshot,
        localId,
        this.localFavorite(existing?.payload, localId)
      );
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
    await this.saveIdMapping(transaction, domain, localId, serverId, now);
    return true;
  }

  private async tombstone(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    change: ServerChange
  ): Promise<boolean> {
    const localId = await this.localId(transaction, domain, change.resourceId);
    if (
      (await this.hasUnresolvedLocalMutation(transaction, localId)) ||
      (domain === 'transactions' &&
        (await this.hasUnresolvedConflict(transaction, localId)))
    ) {
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
    const status = domain === 'transactions' ? 'deleted' : 'archived';
    const deletedAt = change.deletedAt
      ? Date.parse(change.deletedAt)
      : Date.now();
    if (domain === 'transactions')
      await transaction.runAsync(
        `UPDATE ${table} SET payload=json_set(payload,'$.status',?,'$.deletedAt',?,'$.undoExpiresAt',NULL),
           status=?,updated_at=? WHERE id=?`,
        status,
        deletedAt,
        status,
        deletedAt,
        localId
      );
    else
      await transaction.runAsync(
        `UPDATE ${table} SET payload=json_set(payload,'$.status',?),status=?,updated_at=? WHERE id=?`,
        status,
        status,
        deletedAt,
        localId
      );
    await this.saveIdMapping(
      transaction,
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

  private async hasUnresolvedLocalMutation(
    transaction: SQLiteDatabase,
    resourceId: string
  ): Promise<boolean> {
    return Boolean(
      await transaction.getFirstAsync(
        `SELECT 1 present FROM sync_mutation_queue
         WHERE resource_id=? AND status IN ('pending','sending','conflict') LIMIT 1`,
        resourceId
      )
    );
  }

  private async hasUnresolvedConflict(
    transaction: SQLiteDatabase,
    transactionId: string
  ): Promise<boolean> {
    return Boolean(
      await transaction.getFirstAsync(
        `SELECT 1 present FROM finance_sync_conflicts
         WHERE transaction_id=? AND status='pending' LIMIT 1`,
        transactionId
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
    const version = this.safeInteger(value);
    if (version < 1) throw new Error('SYNC_SNAPSHOT_INVALID');
    return version;
  }

  private changeVersion(value: unknown): number {
    const version = this.safeInteger(value);
    if (version < 0) throw new Error('SYNC_SNAPSHOT_INVALID');
    return version;
  }

  private account(value: Record<string, unknown>, id: string) {
    const currencyCode = this.text(value.currency_code ?? value.currencyCode);
    if (!/^[A-Z]{3}$/.test(currencyCode))
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return {
      id,
      name: this.text(value.name),
      type: this.member(value.type, accountTypes),
      currencyCode,
      openingBalanceMinor: 0,
      institution: this.nullable(value.institution_name ?? value.institution),
      lastFour: this.nullable(value.last_four ?? value.lastFour),
      creditLimitMinor: this.numberOrNull(
        value.credit_limit_minor ?? value.creditLimitMinor
      ),
      statementDay: this.numberOrNull(
        value.statement_day ?? value.statementDay,
        1,
        28
      ),
      paymentDueDay: this.numberOrNull(
        value.payment_due_day ?? value.paymentDueDay,
        1,
        28
      ),
      monthlyInterestRateBasisPoints: this.numberOrNull(
        value.monthly_interest_rate_basis_points ??
          value.monthlyInterestRateBasisPoints,
        0,
        10_000
      ),
      minimumPaymentMinor: this.numberOrNull(
        value.minimum_payment_minor ?? value.minimumPaymentMinor,
        1
      ),
      automaticTrackingEnabled: this.boolean(
        value.automatic_tracking_enabled === undefined
          ? value.automaticTrackingEnabled
          : value.automatic_tracking_enabled,
        true
      ),
      isDefault: this.boolean(
        value.is_default === undefined ? value.isDefault : value.is_default,
        false
      ),
      iconKey: this.nullable(value.icon_key ?? value.iconKey),
      colorKey: this.nullable(value.color_key ?? value.colorKey),
      notes: this.nullable(value.notes),
      status: this.member(value.status, accountStatuses),
      sortOrder: this.safeInteger(value.sort_order ?? value.sortOrder ?? 0),
      includeInTotals: this.boolean(
        value.include_in_totals === undefined
          ? value.includeInTotals
          : value.include_in_totals,
        true
      ),
      openedAt: this.dateOrNull(value.opened_at ?? value.openedAt),
      closedAt: this.dateOrNull(value.closed_at ?? value.closedAt),
      createdAt: this.time(value.created_at ?? value.createdAt),
      updatedAt: this.time(value.updated_at ?? value.updatedAt)
    };
  }

  private category(
    value: Record<string, unknown>,
    id: string,
    isFavorite: boolean
  ) {
    const categoryKind = this.member(value.kind, categoryKinds);
    const active = this.boolean(value.active);
    const merged = value.merged_into_id ?? value.mergedIntoId;
    return {
      id,
      kind:
        (value.system_key ?? value.systemKey)
          ? ('system' as const)
          : ('custom' as const),
      systemKey: this.nullable(value.system_key ?? value.systemKey),
      financialType:
        categoryKind === 'income'
          ? ('income' as const)
          : categoryKind === 'expense'
            ? ('expense' as const)
            : null,
      parentId: this.nullable(value.parent_id ?? value.parentId),
      labelAr: this.text(value.label_ar ?? value.labelAr),
      labelEn: this.text(value.label_en ?? value.labelEn),
      iconKey: this.nullable(value.icon ?? value.iconKey),
      colorKey: this.nullable(value.color ?? value.colorKey),
      isFavorite,
      status: merged
        ? ('merged' as const)
        : active
          ? ('active' as const)
          : ('archived' as const),
      mergedIntoId: this.nullable(merged),
      createdAt: this.time(value.created_at ?? value.createdAt),
      updatedAt: this.time(value.updated_at ?? value.updatedAt)
    };
  }

  private async primeCategoryMappings(
    transaction: SQLiteDatabase,
    snapshots: readonly Record<string, unknown>[]
  ): Promise<void> {
    for (const snapshot of snapshots) {
      const systemKey = this.nullable(
        snapshot.system_key ?? snapshot.systemKey
      );
      if (!systemKey) continue;
      await this.saveIdMapping(
        transaction,
        'categories',
        systemKey,
        this.text(snapshot.id),
        this.time(snapshot.updated_at ?? snapshot.updatedAt)
      );
    }
  }

  private async saveIdMapping(
    transaction: SQLiteDatabase,
    domain: SyncDomain,
    localId: string,
    serverId: string,
    now: number
  ): Promise<void> {
    await transaction.runAsync(
      `INSERT INTO sync_id_mappings(domain,local_id,server_id,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(domain,local_id) DO UPDATE SET server_id=excluded.server_id,
         updated_at=excluded.updated_at`,
      domain,
      localId,
      serverId,
      now
    );
  }

  private localFavorite(
    payload: string | undefined,
    categoryId: string
  ): boolean {
    if (payload)
      try {
        const value = JSON.parse(payload) as { isFavorite?: unknown };
        if (typeof value.isFavorite === 'boolean') return value.isFavorite;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // Invalid local payload is replaced by the validated server snapshot.
      }
    return defaultFavoriteByCategory.get(categoryId) ?? false;
  }

  private transaction(value: Record<string, unknown>, id: string) {
    const postings = Array.isArray(value.postings)
      ? (value.postings as Record<string, unknown>[])
      : [];
    const kind = this.member(value.kind ?? value.type, transactionKinds);
    const primaryPosting =
      postings.find((posting) =>
        kind === 'opening'
          ? (posting.posting_role ?? posting.postingRole) === 'opening'
          : (posting.posting_role ?? posting.postingRole) === 'source'
      ) ?? postings[0];
    const destination = postings.find(
      (posting) => posting.posting_role === 'destination'
    );
    const type = kind === 'opening' ? ('adjustment' as const) : kind;
    const transferPurpose = value.transfer_purpose ?? value.transferPurpose;
    const status = this.member(value.status, transactionStatuses);
    const rawSource = this.text(value.source);
    const transactionSource =
      kind === 'opening'
        ? ('adjustment' as const)
        : this.member(rawSource, transactionSources);
    const openingPostingAmount =
      kind === 'opening'
        ? this.safeInteger(
            primaryPosting?.amount_minor ?? primaryPosting?.amountMinor
          )
        : null;
    if (openingPostingAmount === 0) throw new Error('SYNC_SNAPSHOT_INVALID');
    return {
      id,
      type,
      amountMinor: this.safeInteger(value.amount_minor ?? value.amountMinor),
      currencyCode: this.text(value.currency_code ?? value.currencyCode).trim(),
      accountId: this.text(
        primaryPosting?.account_id ??
          primaryPosting?.accountId ??
          value.accountId
      ),
      destinationAccountId: this.nullable(
        destination?.account_id ??
          destination?.accountId ??
          value.destinationAccountId
      ),
      feeMinor: this.safeInteger(value.fee_minor ?? value.feeMinor ?? 0),
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
      source: transactionSource,
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
      version: this.version(value.version),
      adjustmentSign:
        openingPostingAmount !== null && openingPostingAmount < 0
          ? (-1 as const)
          : (1 as const),
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

  private member<const T extends readonly string[]>(
    value: unknown,
    allowed: T
  ): T[number] {
    const result = this.text(value);
    if (!allowed.includes(result)) throw new Error('SYNC_SNAPSHOT_INVALID');
    return result as T[number];
  }

  private boolean(value: unknown, fallback?: boolean): boolean {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error('SYNC_SNAPSHOT_INVALID');
    return value;
  }

  private safeInteger(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value))
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return value;
  }

  private numberOrNull(
    value: unknown,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
  ): number | null {
    if (value === null || value === undefined) return null;
    const number = this.safeInteger(value);
    if (number < minimum || number > maximum)
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return number;
  }

  private dateOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error('SYNC_SNAPSHOT_INVALID');
    const time = this.time(value);
    if (new Date(time).toISOString().slice(0, 10) !== value)
      throw new Error('SYNC_SNAPSHOT_INVALID');
    return time;
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
