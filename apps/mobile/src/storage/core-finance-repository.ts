import {
  accountInputSchema,
  categoryInputSchema,
  deriveAccountBalance,
  isConfirmedTransaction,
  matchesFilters,
  normalizeSearch,
  projectTransactionEffects,
  transactionInputSchema,
  type Account,
  type AccountInput,
  type Category,
  type CategoryInput,
  type SyncConflict,
  type Transaction,
  type TransactionDraft,
  type TransactionFilterSet,
  type TransactionInput
} from '@/domain/core-finance';
import {
  createDefaultCategories,
  isLegacyFixtureAccount,
  isLegacyFixtureTransaction
} from '@/domain/core-finance-seeds';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CoreFinanceError,
  type CardPayoffInput,
  type TransactionPage
} from '@/services/contracts/core-finance-service';
import { openDatabase, runExclusiveDatabaseTransaction } from './database';

export interface CoreFinanceSeed {
  accounts?: Account[];
  categories?: Category[];
  transactions?: Transaction[];
  conflicts?: SyncConflict[];
  cleanupLegacyFixtures?: boolean;
  replaceEmptyDefaultLedger?: boolean;
}

export class CoreFinanceRepository {
  private readonly seed: CoreFinanceSeed;
  private accounts: Account[];
  private categories: Category[];
  private transactions: Transaction[];
  private drafts = new Map<string, TransactionDraft>();
  private conflicts: SyncConflict[];
  private deletedPriorStatus = new Map<string, Transaction['status']>();
  private operationResults = new Map<string, Transaction>();
  private batchOperationResults = new Map<string, Transaction[]>();
  private sequence = 0;
  private cleanupLegacyFixtures: boolean;
  private replaceEmptyDefaultLedger: boolean;

  constructor(seed: CoreFinanceSeed = {}) {
    this.seed = copy(seed);
    this.accounts = seed.accounts?.map(copy) ?? [];
    this.categories = seed.categories?.map(copy) ?? [];
    this.transactions = seed.transactions?.map(copy) ?? [];
    this.conflicts = seed.conflicts?.map(copy) ?? [];
    this.cleanupLegacyFixtures = seed.cleanupLegacyFixtures ?? false;
    this.replaceEmptyDefaultLedger = seed.replaceEmptyDefaultLedger ?? false;
  }

  reset(): void {
    const seed = this.seed;
    this.accounts = seed.accounts?.map(copy) ?? [];
    this.categories = seed.categories?.map(copy) ?? [];
    this.transactions = seed.transactions?.map(copy) ?? [];
    this.conflicts = seed.conflicts?.map(copy) ?? [];
    this.drafts.clear();
    this.deletedPriorStatus.clear();
    this.operationResults.clear();
    this.batchOperationResults.clear();
    this.sequence = 0;
  }

  relocalizeDemoFixtures(seed: CoreFinanceSeed): void {
    const accounts = new Map(
      seed.accounts?.map((account) => [account.id, account])
    );
    const transactions = new Map(
      seed.transactions?.map((transaction) => [transaction.id, transaction])
    );
    this.accounts = this.accounts.map((account) => {
      const localized = accounts.get(account.id);
      return localized
        ? {
            ...account,
            name: localized.name,
            institution: localized.institution,
            notes: localized.notes
          }
        : account;
    });
    this.transactions = this.transactions.map((transaction) => {
      const localized = transactions.get(transaction.id);
      return localized
        ? {
            ...transaction,
            title: localized.title,
            merchant: localized.merchant,
            notes: localized.notes
          }
        : transaction;
    });
  }

  async hydrate(): Promise<void> {
    const seededAccounts = this.accounts.map(copy);
    const seededCategories = this.categories.map(copy);
    const seededTransactions = this.transactions.map(copy);
    const database = await openDatabase();
    const [
      accounts,
      categories,
      transactions,
      drafts,
      conflicts,
      corrections,
      operations
    ] = await Promise.all([
      database.getAllAsync<{ payload: string }>(
        'SELECT payload FROM finance_accounts'
      ),
      database.getAllAsync<{ payload: string }>(
        'SELECT payload FROM finance_categories'
      ),
      database.getAllAsync<{ payload: string }>(
        'SELECT payload FROM finance_transactions'
      ),
      database.getAllAsync<{ payload: string }>(
        'SELECT payload FROM finance_drafts'
      ),
      database.getAllAsync<{ transaction_id: string; payload: string }>(
        'SELECT transaction_id, payload FROM finance_sync_conflicts'
      ),
      database.getAllAsync<{
        transaction_id: string;
        payload: string;
        status: string;
      }>('SELECT transaction_id, payload, status FROM finance_corrections'),
      database.getAllAsync<{
        operation_id: string;
        transaction_id: string;
        payload: string;
        status: string;
      }>(
        'SELECT operation_id, transaction_id, payload, status FROM finance_operations'
      )
    ]);
    if (!accounts.length && !categories.length && !transactions.length) {
      await this.persistAll();
      return;
    }
    this.accounts = parseRows<Account>(accounts);
    this.categories = parseRows<Category>(categories);
    this.transactions = parseRows<Transaction>(transactions);
    this.drafts = new Map(
      parseRows<TransactionDraft>(drafts).map((draft) => [draft.id, draft])
    );
    this.conflicts = parseRows<SyncConflict>(conflicts);
    this.deletedPriorStatus = new Map(
      corrections
        .filter((row) => row.status === 'undoable')
        .map((row) => [
          row.transaction_id,
          JSON.parse(row.payload).priorStatus as Transaction['status']
        ])
    );
    this.operationResults = new Map(
      operations
        .filter((row) => row.status === 'succeeded')
        .map((row) => [
          row.operation_id,
          JSON.parse(row.payload) as Transaction
        ])
    );
    if (
      this.shouldReplaceEmptyDefaultLedger(
        seededAccounts,
        seededCategories,
        seededTransactions,
        drafts.length +
          conflicts.length +
          corrections.length +
          operations.length
      )
    ) {
      this.accounts = seededAccounts;
      this.categories = seededCategories;
      this.transactions = seededTransactions;
      await this.persistAll();
      return;
    }
    if (this.cleanupLegacyFixtures) {
      const referencedTransactionIds = new Set([
        ...corrections.map((row) => row.transaction_id),
        ...operations.map((row) => row.transaction_id),
        ...conflicts.map((row) => row.transaction_id),
        ...(await this.persistedDependentTransactionIds(database))
      ]);
      await this.removePersistedLegacyFixtures(
        database,
        referencedTransactionIds
      );
    }
    if (!this.accounts.length && seededAccounts.length) {
      this.accounts = seededAccounts;
      await this.persistAccounts();
    }
    const normalized = this.normalizeLegacyTransferData();
    if (normalized.categories.length || normalized.transactions.length) {
      await runExclusiveDatabaseTransaction(database, async (transaction) => {
        for (const category of normalized.categories)
          await persistCategory(transaction, category);
        for (const ledgerEntry of normalized.transactions)
          await persistTransaction(transaction, ledgerEntry);
      });
    }
  }

  async persistAll(): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      await transaction.execAsync(
        'PRAGMA defer_foreign_keys = ON; DELETE FROM finance_sync_conflicts; DELETE FROM finance_corrections; DELETE FROM finance_transactions; DELETE FROM finance_drafts; DELETE FROM finance_categories; DELETE FROM finance_accounts;'
      );
      for (const account of this.accounts)
        await persistAccount(transaction, account);
      for (const category of this.categories)
        await persistCategory(transaction, category);
      for (const ledgerEntry of this.transactions)
        await persistTransaction(transaction, ledgerEntry);
      for (const draft of this.drafts.values())
        await persistDraft(transaction, draft);
      for (const conflict of this.conflicts)
        await persistConflict(transaction, conflict);
    });
  }

  async persistAccounts(): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      for (const account of this.accounts)
        await persistAccount(transaction, account);
    });
  }

  async persistCategory(category: Category): Promise<void> {
    await persistCategory(await openDatabase(), category);
  }

  async persistTransaction(
    transaction: Transaction,
    operationId?: string
  ): Promise<void> {
    const database = await openDatabase();
    if (!operationId) return persistTransaction(database, transaction);
    await runExclusiveDatabaseTransaction(
      database,
      async (sqliteTransaction) => {
        await persistTransaction(sqliteTransaction, transaction);
        await persistOperation(sqliteTransaction, operationId, transaction);
      }
    );
  }

  async persistDraft(draft: TransactionDraft): Promise<void> {
    await persistDraft(await openDatabase(), draft);
  }

  async removePersistedDraft(id: string): Promise<void> {
    await (
      await openDatabase()
    ).runAsync('DELETE FROM finance_drafts WHERE id = ?', id);
  }

  async persistCategoryMerge(): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      await transaction.execAsync('PRAGMA defer_foreign_keys = ON;');
      for (const category of this.categories)
        await persistCategory(transaction, category);
      for (const ledgerEntry of this.transactions)
        await persistTransaction(transaction, ledgerEntry);
    });
  }

  async persistConflictResolution(conflictId: string): Promise<void> {
    const database = await openDatabase();
    const conflict = this.requireConflict(conflictId);
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      for (const ledgerEntry of this.transactions)
        await persistTransaction(transaction, ledgerEntry);
      await persistConflict(transaction, conflict);
    });
  }

  async persistDelete(transaction: Transaction): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(
      database,
      async (sqliteTransaction) => {
        await persistTransaction(sqliteTransaction, transaction);
        await sqliteTransaction.runAsync(
          'INSERT OR REPLACE INTO finance_corrections (id, transaction_id, payload, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          `delete-${transaction.id}`,
          transaction.id,
          JSON.stringify({
            priorStatus: this.deletedPriorStatus.get(transaction.id) ?? 'posted'
          }),
          'undoable',
          transaction.undoExpiresAt,
          transaction.deletedAt
        );
      }
    );
  }

  async persistUndo(transaction: Transaction): Promise<void> {
    const database = await openDatabase();
    await runExclusiveDatabaseTransaction(
      database,
      async (sqliteTransaction) => {
        await persistTransaction(sqliteTransaction, transaction);
        await sqliteTransaction.runAsync(
          'DELETE FROM finance_corrections WHERE id = ?',
          `delete-${transaction.id}`
        );
      }
    );
  }

  listAccounts(includeArchived = false): Account[] {
    return this.accounts
      .filter((item) => includeArchived || item.status === 'active')
      .map(copy);
  }

  requireAccount(id: string): Account {
    const account = this.accounts.find((item) => item.id === id);
    if (!account) throw new CoreFinanceError('not_found');
    return copy(account);
  }

  saveAccount(input: AccountInput, id?: string): Account {
    const value = accountInputSchema.parse(input);
    const now = Date.now();
    if (id) {
      const index = this.accounts.findIndex((item) => item.id === id);
      if (index < 0) throw new CoreFinanceError('not_found');
      const current = this.accounts[index];
      if (
        current.currencyCode !== value.currencyCode &&
        this.transactions.some(
          (item) => item.accountId === id && item.status === 'posted'
        )
      ) {
        throw new CoreFinanceError('validation');
      }
      if (value.isDefault) this.clearDefault(id);
      const next: Account = {
        ...current,
        name: value.name,
        type: value.type,
        currencyCode: value.currencyCode,
        openingBalanceMinor: value.openingBalanceMinor,
        institution:
          input.institution !== undefined
            ? value.institution
            : current.institution,
        lastFour:
          input.lastFour !== undefined ? value.lastFour : current.lastFour,
        creditLimitMinor:
          input.creditLimitMinor !== undefined
            ? value.creditLimitMinor
            : current.creditLimitMinor,
        iconKey: current.iconKey,
        colorKey: current.colorKey,
        notes: input.notes !== undefined ? value.notes : current.notes,
        isDefault: value.isDefault,
        updatedAt: now
      };
      this.accounts[index] = next;
      return copy(next);
    }
    const next: Account = {
      id: this.nextId('account'),
      ...value,
      iconKey: null,
      colorKey: null,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    if (
      next.isDefault ||
      !this.accounts.some((item) => item.status === 'active' && item.isDefault)
    ) {
      this.clearDefault();
      next.isDefault = true;
    }
    this.accounts.push(next);
    return copy(next);
  }

  archiveAccount(id: string): Account {
    const index = this.accounts.findIndex((item) => item.id === id);
    if (index < 0) throw new CoreFinanceError('not_found');
    const next = {
      ...this.accounts[index],
      status: 'archived' as const,
      isDefault: false,
      updatedAt: Date.now()
    };
    this.accounts[index] = next;
    if (
      !this.accounts.some((item) => item.status === 'active' && item.isDefault)
    ) {
      const replacement = this.accounts.find(
        (item) => item.status === 'active'
      );
      if (replacement) replacement.isDefault = true;
    }
    return copy(next);
  }

  restoreAccount(id: string): Account {
    const index = this.accounts.findIndex((item) => item.id === id);
    if (index < 0) throw new CoreFinanceError('not_found');
    const next = {
      ...this.accounts[index],
      status: 'active' as const,
      updatedAt: Date.now()
    };
    this.accounts[index] = next;
    if (
      !this.accounts.some((item) => item.status === 'active' && item.isDefault)
    )
      next.isDefault = true;
    return copy(next);
  }

  accountBalance(id: string): number {
    return deriveAccountBalance(this.requireAccount(id), this.transactions);
  }

  listCategories(includeArchived = false): Category[] {
    return this.categories
      .filter((item) => includeArchived || item.status === 'active')
      .map(copy);
  }

  requireCategory(id: string): Category {
    const category = this.categories.find((item) => item.id === id);
    if (!category) throw new CoreFinanceError('not_found');
    return copy(category);
  }

  saveCategory(input: CategoryInput, id?: string): Category {
    const value = categoryInputSchema.parse({ ...input, id });
    this.assertCategoryParent(id ?? null, value.parentId);
    const now = Date.now();
    if (id) {
      const index = this.categories.findIndex((item) => item.id === id);
      if (index < 0) throw new CoreFinanceError('not_found');
      const next: Category = {
        ...this.categories[index],
        ...value,
        id,
        updatedAt: now
      };
      this.categories[index] = next;
      return copy(next);
    }
    const next: Category = {
      kind: 'custom',
      ...value,
      id: this.nextId('category'),
      status: 'active',
      mergedIntoId: null,
      createdAt: now,
      updatedAt: now
    };
    this.categories.push(next);
    return copy(next);
  }

  setCategoryStatus(id: string, status: 'active' | 'archived'): Category {
    const index = this.categories.findIndex((item) => item.id === id);
    if (index < 0) throw new CoreFinanceError('not_found');
    const next = { ...this.categories[index], status, updatedAt: Date.now() };
    this.categories[index] = next;
    return copy(next);
  }

  mergeCategory(sourceId: string, targetId: string): Category {
    if (sourceId === targetId) throw new CoreFinanceError('validation');
    const sourceIndex = this.categories.findIndex(
      (item) => item.id === sourceId
    );
    const target = this.categories.find(
      (item) => item.id === targetId && item.status === 'active'
    );
    if (sourceIndex < 0 || !target) throw new CoreFinanceError('not_found');
    const stagedTransactions = this.transactions.map((item) =>
      item.categoryId === sourceId
        ? {
            ...item,
            categoryId: targetId,
            updatedAt: Date.now(),
            version: item.version + 1
          }
        : item
    );
    const next = {
      ...this.categories[sourceIndex],
      status: 'merged' as const,
      mergedIntoId: targetId,
      updatedAt: Date.now()
    };
    this.transactions = stagedTransactions;
    this.categories[sourceIndex] = next;
    return copy(next);
  }

  listTransactions(
    filters: TransactionFilterSet,
    cursor: string | null = null,
    pageSize = 50
  ): TransactionPage {
    const sorted = this.transactions
      .filter((item) => matchesFilters(item, filters))
      .sort(transactionSorter(filters.sort));
    const start = cursor
      ? Math.max(0, sorted.findIndex((item) => item.id === cursor) + 1)
      : 0;
    const items = sorted.slice(start, start + pageSize).map(copy);
    return {
      items,
      total: sorted.length,
      nextCursor:
        start + pageSize < sorted.length
          ? (items[items.length - 1]?.id ?? null)
          : null
    };
  }

  allTransactions(): Transaction[] {
    return this.transactions.map(copy);
  }

  requireTransaction(id: string): Transaction {
    const transaction = this.transactions.find((item) => item.id === id);
    if (!transaction) throw new CoreFinanceError('not_found');
    return copy(transaction);
  }

  getRemainingRefundableMinor(
    originalTransactionId: string,
    excludedRefundId?: string
  ): number {
    const original = this.transactions.find(
      (transaction) => transaction.id === originalTransactionId
    );
    return original
      ? this.remainingRefundableMinor(original, excludedRefundId)
      : 0;
  }

  saveTransaction(
    input: TransactionInput,
    id?: string,
    operationId?: string,
    source: Transaction['source'] = 'manual'
  ): Transaction {
    if (operationId) {
      const existing = this.operationResults.get(operationId);
      if (existing) return copy(existing);
    }
    const value = transactionInputSchema.parse(input);
    const current = id
      ? this.transactions.find((item) => item.id === id)
      : undefined;
    this.assertSelectable(
      value.accountId,
      value.type === 'refund' ? null : value.categoryId,
      value.destinationAccountId,
      value.currencyCode,
      current
    );
    if (value.type === 'refund') this.assertRefund(value, id);
    if (id) this.assertRefundedOriginalUpdate(id, value);
    const now = Date.now();
    if (id) {
      const index = this.transactions.findIndex((item) => item.id === id);
      if (index < 0) throw new CoreFinanceError('not_found');
      const next: Transaction = {
        ...this.transactions[index],
        ...value,
        version: this.transactions[index].version + 1,
        updatedAt: now
      };
      this.transactions[index] = next;
      return copy(next);
    }
    const next: Transaction = {
      id: this.nextId('transaction'),
      ...value,
      paymentMethod: null,
      source,
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'pending',
      version: 1,
      adjustmentSign: 1,
      deletedAt: null,
      undoExpiresAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.transactions.push(next);
    if (operationId) this.operationResults.set(operationId, next);
    return copy(next);
  }

  createCardPayoff(input: CardPayoffInput, operationId: string): Transaction {
    if (!operationId.trim()) throw new CoreFinanceError('validation');
    const transfer = this.parseCardPayoff(input);
    const existing = this.operationResults.get(operationId);
    if (existing) {
      if (
        existing.type !== 'transfer' ||
        existing.transferPurpose !== 'card_payoff' ||
        existing.accountId !== transfer.accountId ||
        existing.destinationAccountId !== transfer.destinationAccountId ||
        existing.amountMinor !== transfer.amountMinor ||
        existing.currencyCode !== transfer.currencyCode ||
        existing.occurredAt !== transfer.occurredAt ||
        existing.title !== transfer.title ||
        existing.notes !== transfer.notes
      )
        throw new CoreFinanceError('validation');
      return copy(existing);
    }
    this.assertSelectable(
      transfer.accountId,
      null,
      transfer.destinationAccountId ?? null,
      transfer.currencyCode
    );
    const card = this.requireAccount(input.cardAccountId);
    let fundingBalance: number;
    let cardBalance: number;
    try {
      fundingBalance = this.accountBalance(input.fundingAccountId);
      cardBalance = this.accountBalance(input.cardAccountId);
    } catch (error) {
      if (error instanceof RangeError) throw new CoreFinanceError('validation');
      throw error;
    }
    if (
      card.type !== 'credit_card' ||
      cardBalance >= 0 ||
      transfer.amountMinor > fundingBalance ||
      transfer.amountMinor > -cardBalance
    )
      throw new CoreFinanceError('validation');
    return this.saveTransaction(transfer, undefined, operationId);
  }

  private parseCardPayoff(input: CardPayoffInput): TransactionInput {
    try {
      return transactionInputSchema.parse({
        type: 'transfer',
        transferPurpose: 'card_payoff',
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        accountId: input.fundingAccountId,
        destinationAccountId: input.cardAccountId,
        categoryId: null,
        feeMinor: 0,
        title: input.title,
        merchant: null,
        occurredAt: input.occurredAt,
        notes: input.notes ?? null,
        originalTransactionId: null,
        obligationId: null
      });
    } catch {
      throw new CoreFinanceError('validation');
    }
  }

  async saveTransactionsAtomically(
    inputs: readonly TransactionInput[],
    operationId: string,
    source: 'voice',
    persistent: boolean
  ): Promise<Transaction[]> {
    const existing = this.batchOperationResults.get(operationId);
    if (existing) return copy(existing);
    const values = inputs.map((input) => transactionInputSchema.parse(input));
    values.forEach((value) =>
      this.assertSelectable(
        value.accountId,
        value.categoryId,
        value.destinationAccountId,
        value.currencyCode
      )
    );
    const previousLength = this.transactions.length;
    const previousSequence = this.sequence;
    try {
      const created = values.map((value) =>
        this.saveTransaction(value, undefined, undefined, source)
      );
      if (persistent) {
        const database = await openDatabase();
        await runExclusiveDatabaseTransaction(database, async (transaction) => {
          for (const item of created)
            await persistTransaction(transaction, item);
        });
      }
      this.batchOperationResults.set(operationId, created);
      return copy(created);
    } catch (error) {
      this.transactions.splice(previousLength);
      this.sequence = previousSequence;
      throw error;
    }
  }

  async withPlanningLedgerWrite<T>(
    input: TransactionInput,
    operationId: string,
    source: Transaction['source'],
    planningWrite: (transaction: Transaction) => Promise<T> | T
  ): Promise<{ transaction: Transaction; value: T }> {
    const previousTransactions = this.transactions.map(copy);
    const previousSequence = this.sequence;
    try {
      const transaction = this.saveTransaction(
        input,
        undefined,
        operationId,
        source
      );
      const value = await planningWrite(copy(transaction));
      return { transaction, value };
    } catch (error) {
      this.transactions = previousTransactions;
      this.sequence = previousSequence;
      throw error;
    }
  }

  saveDraft(draft: TransactionDraft): TransactionDraft {
    const saved = { ...draft, updatedAt: Date.now() };
    this.drafts.set(saved.id, saved);
    return copy(saved);
  }

  loadDraft(id: string): TransactionDraft | null {
    const draft = this.drafts.get(id);
    return draft ? copy(draft) : null;
  }

  discardDraft(id: string): void {
    this.drafts.delete(id);
  }

  deleteTransaction(id: string, now = Date.now()): Transaction {
    const index = this.transactions.findIndex((item) => item.id === id);
    if (index < 0) throw new CoreFinanceError('not_found');
    const current = this.transactions[index];
    if (current.status === 'deleted') return copy(current);
    this.deletedPriorStatus.set(id, current.status);
    const next = {
      ...current,
      status: 'deleted' as const,
      deletedAt: now,
      undoExpiresAt: now + 30_000,
      updatedAt: now
    };
    this.transactions[index] = next;
    return copy(next);
  }

  undoDelete(id: string, now = Date.now()): Transaction {
    const index = this.transactions.findIndex((item) => item.id === id);
    if (index < 0) throw new CoreFinanceError('not_found');
    const current = this.transactions[index];
    if (
      current.status !== 'deleted' ||
      current.undoExpiresAt === null ||
      now > current.undoExpiresAt
    )
      throw new CoreFinanceError('expired');
    const next = {
      ...current,
      status: this.deletedPriorStatus.get(id) ?? 'posted',
      deletedAt: null,
      undoExpiresAt: null,
      updatedAt: now
    };
    this.transactions[index] = next;
    this.deletedPriorStatus.delete(id);
    return copy(next);
  }

  addConflict(conflict: SyncConflict): void {
    this.conflicts.push(copy(conflict));
  }

  requireConflict(id: string): SyncConflict {
    const conflict = this.conflicts.find((item) => item.id === id);
    if (!conflict) throw new CoreFinanceError('not_found');
    return copy(conflict);
  }

  resolveConflict(
    id: string,
    resolution: NonNullable<SyncConflict['resolution']>
  ): Transaction {
    const conflictIndex = this.conflicts.findIndex((item) => item.id === id);
    if (conflictIndex < 0) throw new CoreFinanceError('not_found');
    const conflict = this.conflicts[conflictIndex];
    if (resolution === 'keep_both') throw new CoreFinanceError('validation');
    const selected =
      resolution === 'keep_later'
        ? conflict.laterSnapshot
        : conflict.localSnapshot;
    const index = this.transactions.findIndex(
      (item) => item.id === conflict.transactionId
    );
    if (index < 0) throw new CoreFinanceError('not_found');
    const resolved = {
      ...selected,
      syncStatus: 'pending' as const,
      updatedAt: Date.now(),
      version: selected.version + 1
    };
    this.transactions[index] = resolved;
    this.conflicts[conflictIndex] = {
      ...conflict,
      resolution,
      status: 'resolved',
      resolvedAt: Date.now()
    };
    return copy(resolved);
  }

  countTransactionsForCategory(id: string): number {
    return this.transactions.filter((item) => item.categoryId === id).length;
  }

  private async removePersistedLegacyFixtures(
    database: SQLiteDatabase,
    referencedTransactionIds: ReadonlySet<string>
  ): Promise<void> {
    const cleanup = separateLegacyFixtures(
      this.accounts,
      this.transactions,
      referencedTransactionIds
    );
    const { accounts, removedAccounts, removedTransactions, transactions } =
      cleanup;
    if (!removedTransactions.length && !removedAccounts.length) return;
    await runExclusiveDatabaseTransaction(database, async (transaction) => {
      for (const item of removedTransactions)
        await transaction.runAsync(
          'DELETE FROM finance_transactions WHERE id = ?',
          item.id
        );
      for (const item of removedAccounts)
        await transaction.runAsync(
          'DELETE FROM finance_accounts WHERE id = ?',
          item.id
        );
    });
    this.transactions = transactions;
    this.accounts = accounts;
  }

  private async persistedDependentTransactionIds(
    database: SQLiteDatabase
  ): Promise<string[]> {
    const [salaryReceipts, obligationPayments, goalMovements, feedback] =
      await Promise.all([
        database.getAllAsync<{ transaction_id: string }>(
          'SELECT transaction_id FROM planning_salary_receipts'
        ),
        database.getAllAsync<{ transaction_id: string }>(
          'SELECT transaction_id FROM planning_obligation_payments'
        ),
        database.getAllAsync<{ linked_transaction_id: string }>(
          'SELECT linked_transaction_id FROM planning_goal_movements WHERE linked_transaction_id IS NOT NULL'
        ),
        database.getAllAsync<{ transaction_id: string }>(
          'SELECT transaction_id FROM tracking_feedback'
        )
      ]);
    return [
      ...salaryReceipts.map((item) => item.transaction_id),
      ...obligationPayments.map((item) => item.transaction_id),
      ...goalMovements.map((item) => item.linked_transaction_id),
      ...feedback.map((item) => item.transaction_id)
    ];
  }

  private shouldReplaceEmptyDefaultLedger(
    seededAccounts: readonly Account[],
    seededCategories: readonly Category[],
    seededTransactions: readonly Transaction[],
    persistedWorkCount: number
  ): boolean {
    return (
      this.replaceEmptyDefaultLedger &&
      seededAccounts.length > 0 &&
      seededCategories.length > 0 &&
      seededTransactions.length > 0 &&
      persistedWorkCount === 0 &&
      this.transactions.length === 0 &&
      this.accounts.length === 1 &&
      isEmptyDefaultAccount(this.accounts[0]) &&
      this.categories.every((category) => category.kind === 'system')
    );
  }

  private clearDefault(exceptId?: string): void {
    this.accounts.forEach((item) => {
      if (item.id !== exceptId) item.isDefault = false;
    });
  }

  private assertSelectable(
    accountId: string,
    categoryId: string | null,
    destinationId: string | null,
    currencyCode: string,
    current?: Transaction
  ): void {
    const preservesLegacyBoundary = Boolean(
      current &&
      current.accountId === accountId &&
      current.destinationAccountId === destinationId &&
      current.currencyCode === currencyCode
    );
    const account = this.requireAccount(accountId);
    if (account.status !== 'active') throw new CoreFinanceError('archived');
    if (account.currencyCode !== currencyCode && !preservesLegacyBoundary)
      throw new CoreFinanceError('validation');
    if (destinationId) {
      const destination = this.requireAccount(destinationId);
      if (destination.status !== 'active')
        throw new CoreFinanceError('archived');
      if (destination.currencyCode !== currencyCode && !preservesLegacyBoundary)
        throw new CoreFinanceError('validation');
    }
    if (categoryId && this.requireCategory(categoryId).status !== 'active')
      throw new CoreFinanceError('archived');
  }

  private assertRefund(value: TransactionInput, currentId?: string): void {
    const original = this.transactions.find(
      (transaction) => transaction.id === value.originalTransactionId
    );
    if (
      !original ||
      original.id === currentId ||
      original.type !== 'expense' ||
      !isConfirmedTransaction(original) ||
      original.accountId !== value.accountId ||
      original.currencyCode !== value.currencyCode ||
      original.categoryId !== value.categoryId ||
      value.amountMinor > this.remainingRefundableMinor(original, currentId)
    )
      throw new CoreFinanceError('validation');
  }

  private assertRefundedOriginalUpdate(
    id: string,
    value: TransactionInput
  ): void {
    const linkedRefunds = this.activeRefundsFor(id);
    if (!linkedRefunds.length) return;
    const refundedMinor = linkedRefunds.reduce(
      (total, refund) => total + refund.amountMinor,
      0
    );
    if (
      value.type !== 'expense' ||
      linkedRefunds.some(
        (refund) =>
          refund.accountId !== value.accountId ||
          refund.currencyCode !== value.currencyCode ||
          refund.categoryId !== value.categoryId
      ) ||
      value.amountMinor < refundedMinor
    )
      throw new CoreFinanceError('validation');
  }

  private remainingRefundableMinor(
    original: Transaction,
    excludedRefundId?: string
  ): number {
    if (original.type !== 'expense' || !isConfirmedTransaction(original))
      return 0;
    if (this.hasActiveReversal(original.id)) return 0;
    const refunded = this.activeRefundsFor(
      original.id,
      excludedRefundId
    ).reduce((total, transaction) => total + transaction.amountMinor, 0);
    return Math.max(0, original.amountMinor - refunded);
  }

  private activeRefundsFor(
    originalId: string,
    excludedRefundId?: string
  ): Transaction[] {
    const transactions = excludedRefundId
      ? this.transactions.filter(
          (transaction) => transaction.id !== excludedRefundId
        )
      : this.transactions;
    const projections = projectTransactionEffects(transactions, null);
    return transactions.filter((transaction) => {
      if (
        transaction.type !== 'refund' ||
        transaction.originalTransactionId !== originalId
      )
        return false;
      const projection = projections.get(transaction.id);
      return Boolean(
        projection &&
        (projection.confirmed.expenseMinor !== 0 ||
          projection.pending.expenseMinor !== 0)
      );
    });
  }

  private hasActiveReversal(originalId: string): boolean {
    const projections = projectTransactionEffects(this.transactions, null);
    return this.transactions.some((transaction) => {
      if (
        transaction.type !== 'reversal' ||
        transaction.originalTransactionId !== originalId
      )
        return false;
      const projection = projections.get(transaction.id);
      return Boolean(
        projection &&
        (projection.confirmed.expenseMinor !== 0 ||
          projection.pending.expenseMinor !== 0)
      );
    });
  }

  private normalizeLegacyTransferData(): {
    categories: Category[];
    transactions: Transaction[];
  } {
    const categories: Category[] = [];
    const transactions: Transaction[] = [];
    const defaultCategories = createDefaultCategories();
    const remittance = defaultCategories.find(
      (category) => category.id === 'remittance'
    )!;
    const remittanceIndex = this.categories.findIndex(
      (category) => category.id === remittance.id
    );
    if (remittanceIndex === -1) {
      this.categories.push(copy(remittance));
      categories.push(remittance);
    } else if (
      JSON.stringify(this.categories[remittanceIndex]) !==
      JSON.stringify(remittance)
    ) {
      this.categories[remittanceIndex] = copy(remittance);
      categories.push(remittance);
    }
    this.categories = this.categories.map((category) => {
      const linkedTypes = new Set(
        this.transactions.flatMap((transaction) =>
          transaction.categoryId === category.id &&
          (transaction.type === 'income' || transaction.type === 'expense')
            ? [transaction.type]
            : []
        )
      );
      const inferredFinancialType =
        (category.kind === 'system'
          ? defaultCategories.find((item) => item.id === category.id)
              ?.financialType
          : undefined) ??
        (category.kind === 'custom' && linkedTypes.size === 1
          ? linkedTypes.values().next().value
          : undefined);
      let normalized = category.financialType
        ? category
        : inferredFinancialType
          ? { ...category, financialType: inferredFinancialType }
          : {
              ...category,
              financialType: null,
              status:
                category.status === 'active'
                  ? ('archived' as const)
                  : category.status
            };
      if (
        category.id !== 'transfers' ||
        category.kind !== 'system' ||
        category.status === 'archived'
      ) {
        if (normalized !== category) categories.push(normalized);
        return normalized;
      }
      normalized = { ...normalized, status: 'archived' as const };
      categories.push(normalized);
      return normalized;
    });
    this.transactions = this.transactions.map((transaction) => {
      if (transaction.type !== 'transfer' || transaction.categoryId === null)
        return transaction;
      const repaired = { ...transaction, categoryId: null };
      transactions.push(repaired);
      return repaired;
    });
    return { categories, transactions };
  }

  private assertCategoryParent(
    id: string | null,
    parentId: string | null
  ): void {
    if (!parentId) return;
    let current: string | null = parentId;
    while (current) {
      if (current === id) throw new CoreFinanceError('validation');
      current =
        this.categories.find((item) => item.id === current)?.parentId ?? null;
    }
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${Date.now()}-${this.sequence}`;
  }
}

type SqlRunner = Pick<SQLiteDatabase, 'runAsync'>;

function parseRows<T>(rows: readonly { payload: string }[]): T[] {
  return rows.map((row) => JSON.parse(row.payload) as T);
}

async function persistAccount(
  database: SqlRunner,
  account: Account
): Promise<void> {
  await database.runAsync(
    'INSERT INTO finance_accounts (id, payload, status, is_default, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, is_default = excluded.is_default, updated_at = excluded.updated_at',
    account.id,
    JSON.stringify(account),
    account.status,
    account.isDefault ? 1 : 0,
    account.updatedAt
  );
}

async function persistCategory(
  database: SqlRunner,
  category: Category
): Promise<void> {
  await database.runAsync(
    'INSERT INTO finance_categories (id, payload, parent_id, status, merged_into_id, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, parent_id = excluded.parent_id, status = excluded.status, merged_into_id = excluded.merged_into_id, updated_at = excluded.updated_at',
    category.id,
    JSON.stringify(category),
    category.parentId,
    category.status,
    category.mergedIntoId,
    category.updatedAt
  );
}

async function persistTransaction(
  database: SqlRunner,
  transaction: Transaction
): Promise<void> {
  await database.runAsync(
    'INSERT INTO finance_transactions (id, payload, account_id, destination_account_id, category_id, occurred_at, type, source, status, sync_status, review_status, normalized_title, amount_minor, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, account_id = excluded.account_id, destination_account_id = excluded.destination_account_id, category_id = excluded.category_id, occurred_at = excluded.occurred_at, type = excluded.type, source = excluded.source, status = excluded.status, sync_status = excluded.sync_status, review_status = excluded.review_status, normalized_title = excluded.normalized_title, amount_minor = excluded.amount_minor, updated_at = excluded.updated_at',
    transaction.id,
    JSON.stringify(transaction),
    transaction.accountId,
    transaction.destinationAccountId,
    transaction.categoryId,
    transaction.occurredAt,
    transaction.type,
    transaction.source,
    transaction.status,
    transaction.syncStatus,
    transaction.reviewStatus,
    normalizeSearch(`${transaction.title} ${transaction.merchant ?? ''}`),
    transaction.amountMinor,
    transaction.updatedAt
  );
}

async function persistOperation(
  database: SqlRunner,
  operationId: string,
  transaction: Transaction
): Promise<void> {
  await database.runAsync(
    'INSERT INTO finance_operations (id, operation_id, transaction_id, payload, kind, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET operation_id = excluded.operation_id, transaction_id = excluded.transaction_id, payload = excluded.payload, kind = excluded.kind, status = excluded.status, created_at = excluded.created_at',
    `operation-${operationId}`,
    operationId,
    transaction.id,
    JSON.stringify(transaction),
    'transaction_create',
    'succeeded',
    transaction.createdAt
  );
}

async function persistDraft(
  database: SqlRunner,
  draft: TransactionDraft
): Promise<void> {
  await database.runAsync(
    'INSERT INTO finance_drafts (id, payload, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status, updated_at = excluded.updated_at',
    draft.id,
    JSON.stringify(draft),
    draft.status,
    draft.updatedAt
  );
}

async function persistConflict(
  database: SqlRunner,
  conflict: SyncConflict
): Promise<void> {
  await database.runAsync(
    'INSERT INTO finance_sync_conflicts (id, transaction_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET transaction_id = excluded.transaction_id, payload = excluded.payload, status = excluded.status, created_at = excluded.created_at',
    conflict.id,
    conflict.transactionId,
    JSON.stringify(conflict),
    conflict.status,
    conflict.createdAt
  );
}

function transactionSorter(sort: TransactionFilterSet['sort']) {
  return (a: Transaction, b: Transaction) => {
    if (sort === 'oldest')
      return a.occurredAt - b.occurredAt || a.id.localeCompare(b.id);
    if (sort === 'amount_high')
      return (
        b.amountMinor - a.amountMinor ||
        b.occurredAt - a.occurredAt ||
        b.id.localeCompare(a.id)
      );
    if (sort === 'amount_low')
      return (
        a.amountMinor - b.amountMinor ||
        b.occurredAt - a.occurredAt ||
        b.id.localeCompare(a.id)
      );
    return b.occurredAt - a.occurredAt || b.id.localeCompare(a.id);
  };
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isEmptyDefaultAccount(account: Account): boolean {
  return (
    account.id === 'account-default' &&
    account.name === 'Masarifi' &&
    account.type === 'bank' &&
    account.currencyCode === 'SAR' &&
    account.openingBalanceMinor === 0 &&
    account.institution === null &&
    account.lastFour === null &&
    account.creditLimitMinor === null &&
    account.isDefault &&
    account.iconKey === 'bank' &&
    account.colorKey === 'account-teal' &&
    account.notes === null &&
    account.status === 'active'
  );
}

function separateLegacyFixtures(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  referencedTransactionIds: ReadonlySet<string>
) {
  const retainedTransactions = transactions.filter(
    (transaction) =>
      !isLegacyFixtureTransaction(transaction) ||
      referencedTransactionIds.has(transaction.id)
  );
  const retainedAccounts = accounts.filter((account) =>
    retainsLegacyAccount(account, retainedTransactions)
  );
  return {
    accounts: retainedAccounts,
    removedAccounts: accounts.filter(
      (account) => !retainedAccounts.includes(account)
    ),
    removedTransactions: transactions.filter(
      (transaction) => !retainedTransactions.includes(transaction)
    ),
    transactions: retainedTransactions
  };
}

function retainsLegacyAccount(
  account: Account,
  transactions: readonly Transaction[]
): boolean {
  return (
    !isLegacyFixtureAccount(account) ||
    transactions.some(
      (transaction) =>
        transaction.accountId === account.id ||
        transaction.destinationAccountId === account.id
    )
  );
}
