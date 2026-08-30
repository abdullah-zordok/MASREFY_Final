import { Platform } from 'react-native';
import { isDemoModeEnabled } from '@/config/demo-mode';
import {
  accountInputSchema,
  categoryInputSchema,
  emptyTransactionFilters,
  matchesFilters,
  projectTransactionEffects,
  transactionInputSchema,
  type AccountInput,
  type CategoryInput,
  type HomeSummary,
  type SyncConflict,
  type TransactionDraft,
  type TransactionFilterSet,
  type TransactionInput
} from '@/domain/core-finance';
import type {
  CoreFinanceService,
  DeleteResult,
  MutationResult
} from '@/services/contracts/core-finance-service';
import { coreFinanceServiceCapability } from '@/services/contracts/core-finance-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import type { CapabilityProviderKind } from '@/services/contracts/capability-contract';
import {
  createDefaultAccount,
  createDefaultCategories,
  createDemoAccounts,
  createDemoTransactions,
  legacyFixtureAccounts,
  legacyFixtureTransactions
} from '@/domain/core-finance-seeds';
import type { Locale } from '@/domain/foundation';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';
import {
  createMockExchangeRateService,
  createProductionExchangeRateService
} from './exchange-rate-service';
import type { ExchangeRateService } from '@/services/contracts/core-finance-service';

const scopes = {
  account: (id: string) => [
    'home.summary',
    'accounts.list',
    `accounts.detail.${id}`,
    'transactions.list'
  ],
  transaction: (id: string) => [
    'home.summary',
    'accounts.list',
    'transactions.list',
    `transactions.detail.${id}`
  ],
  category: (id: string) => [
    'categories.list',
    `categories.detail.${id}`,
    'transactions.list',
    'home.summary'
  ]
};

const derivedScopes = ['reports.live', 'assistant.context'] as const;

export function createMockCoreFinanceService(
  repository = new CoreFinanceRepository(),
  {
    persistent = false,
    registerForReset = false,
    rates = createMockExchangeRateService(),
    providerKind = 'mock'
  }: {
    persistent?: boolean;
    registerForReset?: boolean;
    rates?: ExchangeRateService;
    providerKind?: CapabilityProviderKind;
  } = {}
): CapabilityProviderHandle<CoreFinanceService> {
  let hydration: Promise<void> | null = null;
  const ensureReady = () => {
    if (!persistent) return Promise.resolve();
    hydration ??= repository.hydrate();
    return hydration;
  };
  if (registerForReset)
    registerRuntimeUserDataReset(() => {
      repository.reset();
      hydration = null;
    });
  const read = async <T>(query: () => T | Promise<T>): Promise<T> => {
    await ensureReady();
    return query();
  };
  const mutate = async <T>(
    command: () => T,
    persist: (record: T) => Promise<void>,
    affectedScopes: (record: T) => readonly string[]
  ): Promise<MutationResult<T>> => {
    await ensureReady();
    const record = command();
    if (persistent) await persist(record);
    return result(record, affectedScopes(record));
  };
  return {
    metadata: {
      id: providerKind === 'live' ? 'local-core-finance' : 'mock-core-finance',
      capability: coreFinanceServiceCapability.capability,
      majorVersion: coreFinanceServiceCapability.majorVersion,
      kind: providerKind,
      availability: 'available'
    },
    async getHomeSummary(
      profileCurrency,
      filters = emptyTransactionFilters
    ): Promise<HomeSummary> {
      await ensureReady();
      const accounts = repository
        .listAccounts()
        .filter(
          (account) =>
            !filters.accountIds.length ||
            filters.accountIds.includes(account.id)
        );
      const components = [];
      const excludedAccountIds: string[] = [];
      let totalBalanceMinor = 0;
      for (const account of accounts) {
        const originalMinor = repository.accountBalance(account.id);
        const rate = await rates.getRate(account.currencyCode, profileCurrency);
        if (rate.rate === null || rate.asOf === null) {
          excludedAccountIds.push(account.id);
          continue;
        }
        const convertedMinor = Math.round(originalMinor * rate.rate);
        totalBalanceMinor += convertedMinor;
        components.push({
          accountId: account.id,
          originalMinor,
          currencyCode: account.currencyCode,
          convertedMinor,
          rate: rate.rate,
          asOf: rate.asOf
        });
      }
      const transactions = repository.allTransactions();
      const periodTransactions = transactions.filter((transaction) =>
        matchesFilters(transaction, filters)
      );
      const comparableTransactions = periodTransactions.filter(
        (transaction) => transaction.currencyCode === profileCurrency
      );
      const projections = projectTransactionEffects(transactions, null);
      const periodTotals = comparableTransactions.reduce(
        (totals, transaction) => {
          const confirmed = projections.get(transaction.id)!.confirmed;
          return {
            incomeMinor: totals.incomeMinor + confirmed.incomeMinor,
            expenseMinor: totals.expenseMinor + confirmed.expenseMinor
          };
        },
        { incomeMinor: 0, expenseMinor: 0 }
      );
      return {
        totalBalanceMinor,
        currencyCode: profileCurrency,
        isEstimated:
          components.some((item) => item.currencyCode !== profileCurrency) ||
          excludedAccountIds.length > 0 ||
          comparableTransactions.length !== periodTransactions.length,
        components,
        excludedAccountIds,
        periodIncomeMinor: periodTotals.incomeMinor,
        periodExpenseMinor: periodTotals.expenseMinor,
        activeAccountCount: accounts.length,
        recentTransactions: repository.listTransactions(filters, null, 5).items,
        reviewCount: periodTransactions.filter(
          (item) => item.reviewStatus === 'required'
        ).length,
        pendingSyncCount: periodTransactions.filter(
          (item) =>
            item.syncStatus === 'pending' ||
            item.syncStatus === 'failed' ||
            item.syncStatus === 'conflict'
        ).length,
        dataState:
          accounts.length === 0 && transactions.length === 0
            ? 'empty'
            : excludedAccountIds.length ||
                comparableTransactions.length !== periodTransactions.length
              ? 'partial'
              : 'ready'
      };
    },
    async listAccounts(includeArchived) {
      return read(() => repository.listAccounts(includeArchived));
    },
    async listAccountBalances(includeArchived) {
      return read(() =>
        repository.listAccounts(includeArchived).map((account) => ({
          accountId: account.id,
          balanceMinor: repository.accountBalance(account.id),
          currencyCode: account.currencyCode
        }))
      );
    },
    async getAccount(id) {
      return read(() => repository.requireAccount(id));
    },
    async createAccount(input: AccountInput) {
      return mutate(
        () => repository.saveAccount(accountInputSchema.parse(input)),
        () => repository.persistAccounts(),
        (account) => scopes.account(account.id)
      );
    },
    async updateAccount(id, input: AccountInput) {
      return mutate(
        () => repository.saveAccount(input, id),
        () => repository.persistAccounts(),
        () => scopes.account(id)
      );
    },
    async archiveAccount(id) {
      return mutate(
        () => repository.archiveAccount(id),
        () => repository.persistAccounts(),
        () => scopes.account(id)
      );
    },
    async restoreAccount(id) {
      return mutate(
        () => repository.restoreAccount(id),
        () => repository.persistAccounts(),
        () => scopes.account(id)
      );
    },
    async listCategories(includeArchived) {
      return read(() => repository.listCategories(includeArchived));
    },
    async createCategory(input: CategoryInput) {
      return mutate(
        () => repository.saveCategory(categoryInputSchema.parse(input)),
        (category) => repository.persistCategory(category),
        (category) => scopes.category(category.id)
      );
    },
    async updateCategory(id, input: CategoryInput) {
      return mutate(
        () =>
          repository.saveCategory(
            categoryInputSchema.parse({ ...input, id }),
            id
          ),
        (category) => repository.persistCategory(category),
        () => scopes.category(id)
      );
    },
    async setCategoryStatus(id, status) {
      return mutate(
        () => repository.setCategoryStatus(id, status),
        (category) => repository.persistCategory(category),
        () => scopes.category(id)
      );
    },
    async mergeCategory(sourceId, targetId) {
      await ensureReady();
      const value = repository.mergeCategory(sourceId, targetId);
      if (persistent) await repository.persistCategoryMerge();
      return result(value, [
        ...scopes.category(sourceId),
        ...scopes.category(targetId)
      ]);
    },
    async listTransactions(filters: TransactionFilterSet, cursor, pageSize) {
      return read(() => repository.listTransactions(filters, cursor, pageSize));
    },
    async getTransaction(id) {
      return read(() => repository.requireTransaction(id));
    },
    async createTransaction(input: TransactionInput, operationId, source) {
      return mutate(
        () =>
          repository.saveTransaction(
            transactionInputSchema.parse(input),
            undefined,
            operationId,
            source
          ),
        (transaction) =>
          repository.persistTransaction(transaction, operationId),
        (transaction) => scopes.transaction(transaction.id)
      );
    },
    async createTransactionsAtomically(inputs, operationId, source) {
      await ensureReady();
      const value = await repository.saveTransactionsAtomically(
        inputs,
        operationId,
        source,
        persistent
      );
      return result(
        value,
        value.flatMap((transaction) => scopes.transaction(transaction.id))
      );
    },
    async updateTransaction(id, input: TransactionInput) {
      return mutate(
        () =>
          repository.saveTransaction(transactionInputSchema.parse(input), id),
        (transaction) => repository.persistTransaction(transaction),
        () => scopes.transaction(id)
      );
    },
    async saveDraft(draft: TransactionDraft) {
      await ensureReady();
      const savedDraft = repository.saveDraft(draft);
      if (persistent) await repository.persistDraft(savedDraft);
      return savedDraft;
    },
    async loadDraft(id) {
      return read(() => repository.loadDraft(id));
    },
    async discardDraft(id) {
      await ensureReady();
      repository.discardDraft(id);
      if (persistent) await repository.removePersistedDraft(id);
    },
    async deleteTransaction(id): Promise<DeleteResult> {
      await ensureReady();
      const value = repository.deleteTransaction(id);
      if (persistent) await repository.persistDelete(value);
      return {
        value,
        undoExpiresAt: value.undoExpiresAt!,
        affectedScopes: uniqueScopes(scopes.transaction(id))
      };
    },
    async undoDelete(id) {
      await ensureReady();
      const value = repository.undoDelete(id);
      if (persistent) await repository.persistUndo(value);
      return result(value, scopes.transaction(id));
    },
    async getConflict(id) {
      return read(() => repository.requireConflict(id));
    },
    async resolveConflict(
      id,
      resolution: NonNullable<SyncConflict['resolution']>
    ) {
      await ensureReady();
      const value = repository.resolveConflict(id, resolution);
      if (persistent) await repository.persistConflictResolution(id);
      return result(value, scopes.transaction(value.id));
    }
  };
}

export function createSeededCoreFinanceService() {
  return createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: legacyFixtureAccounts,
      categories: createDefaultCategories(),
      transactions: legacyFixtureTransactions
    }),
    { persistent: Platform.OS !== 'web' && process.env.NODE_ENV !== 'test' }
  );
}

let demoCoreFinanceRepository: CoreFinanceRepository | null = null;

export function createProductionCoreFinanceService(locale: Locale = 'ar') {
  if (isDemoModeEnabled()) {
    const repository = createDemoCoreFinanceRepository(locale);
    demoCoreFinanceRepository = repository;
    return createMockCoreFinanceService(
      repository,
      {
        persistent: Platform.OS !== 'web' && process.env.NODE_ENV !== 'test',
        registerForReset: true
      }
    );
  }
  return createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: [createDefaultAccount()],
      categories: createDefaultCategories(),
      cleanupLegacyFixtures: true
    }),
    {
      persistent: Platform.OS !== 'web' && process.env.NODE_ENV !== 'test',
      registerForReset: true,
      rates: createProductionExchangeRateService(),
      providerKind: 'live'
    }
  );
}

export function createDemoCoreFinanceService(locale: Locale = 'ar') {
  return createMockCoreFinanceService(createDemoCoreFinanceRepository(locale), {
    persistent: Platform.OS !== 'web' && process.env.NODE_ENV !== 'test'
  });
}

function createDemoCoreFinanceRepository(locale: Locale) {
  const now = Date.now();
  return new CoreFinanceRepository({
    accounts: createDemoAccounts(now, locale),
    categories: createDefaultCategories(),
    transactions: createDemoTransactions(now, locale),
    replaceEmptyDefaultLedger: true
  });
}

export const coreFinanceService = createProductionCoreFinanceService();

export function relocalizeDemoCoreFinanceRepository(locale: Locale): void {
  const now = Date.now();
  demoCoreFinanceRepository?.relocalizeDemoFixtures({
    accounts: createDemoAccounts(now, locale),
    transactions: createDemoTransactions(now, locale)
  });
}

function result<T>(
  value: T,
  affectedScopes: readonly string[]
): MutationResult<T> {
  return { value, affectedScopes: uniqueScopes(affectedScopes) };
}

function uniqueScopes(affectedScopes: readonly string[]) {
  return [...new Set([...affectedScopes, ...derivedScopes])];
}
