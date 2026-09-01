import type {
  Account,
  AccountInput,
  Category,
  CategoryInput,
  HomeSummary,
  SyncConflict,
  Transaction,
  TransactionDraft,
  TransactionFilterSet,
  TransactionInput
} from '@/domain/core-finance';
import type { CapabilityContractMetadata } from './capability-contract';

export const coreFinanceServiceCapability: CapabilityContractMetadata = {
  capability: 'core-finance.records',
  majorVersion: 1,
  owner: 'core-finance',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'coreFinance.state.error'
};

export const exchangeRateServiceCapability: CapabilityContractMetadata = {
  capability: 'core-finance.exchange-rate',
  majorVersion: 1,
  owner: 'core-finance',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'coreFinance.exchange.unavailable'
};

export interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
  total: number;
}

export interface AccountBalanceProjection {
  accountId: string;
  balanceMinor: number;
  currencyCode: string;
}

export interface MutationResult<T> {
  value: T;
  affectedScopes: readonly string[];
}

export interface ImpactPreview {
  affectedTransactionCount: number;
  affectedAccountIds: string[];
}

export interface CardPayoffInput {
  fundingAccountId: string;
  cardAccountId: string;
  amountMinor: number;
  currencyCode: string;
  occurredAt: number;
  title: string;
  notes?: string | null;
}

export interface DeleteResult extends MutationResult<Transaction> {
  undoExpiresAt: number;
}

export interface CoreFinanceService {
  getHomeSummary(
    profileCurrency: string,
    filters?: TransactionFilterSet
  ): Promise<HomeSummary>;
  listAccounts(includeArchived?: boolean): Promise<Account[]>;
  listAccountBalances(
    includeArchived?: boolean
  ): Promise<AccountBalanceProjection[]>;
  getAccount(id: string): Promise<Account>;
  createAccount(input: AccountInput): Promise<MutationResult<Account>>;
  updateAccount(
    id: string,
    input: AccountInput
  ): Promise<MutationResult<Account>>;
  archiveAccount(id: string): Promise<MutationResult<Account>>;
  restoreAccount(id: string): Promise<MutationResult<Account>>;
  listCategories(includeArchived?: boolean): Promise<Category[]>;
  createCategory(input: CategoryInput): Promise<MutationResult<Category>>;
  updateCategory(
    id: string,
    input: CategoryInput
  ): Promise<MutationResult<Category>>;
  setCategoryStatus(
    id: string,
    status: 'active' | 'archived'
  ): Promise<MutationResult<Category>>;
  mergeCategory(
    sourceId: string,
    targetId: string
  ): Promise<MutationResult<Category>>;
  listTransactions(
    filters: TransactionFilterSet,
    cursor?: string | null,
    pageSize?: number
  ): Promise<TransactionPage>;
  getTransaction(id: string): Promise<Transaction>;
  getRemainingRefundableMinor(
    originalTransactionId: string,
    excludedRefundId?: string
  ): Promise<number>;
  createTransaction(
    input: TransactionInput,
    operationId?: string,
    source?: Transaction['source']
  ): Promise<MutationResult<Transaction>>;
  createCardPayoff(
    input: CardPayoffInput,
    operationId: string
  ): Promise<MutationResult<Transaction>>;
  createTransactionsAtomically(
    inputs: readonly TransactionInput[],
    operationId: string,
    source: 'voice'
  ): Promise<MutationResult<Transaction[]>>;
  updateTransaction(
    id: string,
    input: TransactionInput
  ): Promise<MutationResult<Transaction>>;
  saveDraft(draft: TransactionDraft): Promise<TransactionDraft>;
  loadDraft(id: string): Promise<TransactionDraft | null>;
  discardDraft(id: string): Promise<void>;
  deleteTransaction(id: string): Promise<DeleteResult>;
  undoDelete(id: string): Promise<MutationResult<Transaction>>;
  getConflict(id: string): Promise<SyncConflict>;
  resolveConflict(
    id: string,
    resolution: NonNullable<SyncConflict['resolution']>
  ): Promise<MutationResult<Transaction>>;
}

export interface ExchangeRateResult {
  rate: number | null;
  asOf: number | null;
  status: 'available' | 'stale' | 'unavailable';
}

export interface ExchangeRateService {
  getRate(
    baseCurrencyCode: string,
    quoteCurrencyCode: string
  ): Promise<ExchangeRateResult>;
}

export type CoreFinanceErrorCode =
  | 'not_found'
  | 'validation'
  | 'archived'
  | 'conflict'
  | 'expired'
  | 'offline'
  | 'unknown';

export class CoreFinanceError extends Error {
  constructor(public readonly code: CoreFinanceErrorCode) {
    super(code);
    this.name = 'CoreFinanceError';
  }
}
