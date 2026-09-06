import { z } from 'zod';

import { getCurrencyMinorUnitScale } from './currencies';

export const accountTypes = [
  'bank',
  'debit_card',
  'credit_card',
  'wallet',
  'cash',
  'savings',
  'other'
] as const;
export const transactionTypes = [
  'expense',
  'income',
  'transfer',
  'refund',
  'reversal',
  'adjustment',
  'obligation_payment',
  'recurring_payment'
] as const;
export const transactionSources = [
  'manual',
  'automatic',
  'voice',
  'platform_assisted',
  'adjustment'
] as const;
export const syncStatuses = [
  'pending',
  'syncing',
  'synced',
  'failed',
  'conflict'
] as const;

export interface MoneyValue {
  minorUnits: number;
  currencyCode: string;
  scale: number;
}

export type AccountType = (typeof accountTypes)[number];
export type TransactionType = (typeof transactionTypes)[number];
export type TransactionSource = (typeof transactionSources)[number];
export type SyncStatus = (typeof syncStatuses)[number];

const automaticTrackingAccountTypes = new Set<AccountType>([
  'bank',
  'debit_card',
  'credit_card',
  'wallet',
  'savings'
]);

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currencyCode: string;
  openingBalanceMinor: number;
  institution: string | null;
  lastFour: string | null;
  creditLimitMinor: number | null;
  statementDay: number | null;
  paymentDueDay: number | null;
  monthlyInterestRateBasisPoints: number | null;
  minimumPaymentMinor: number | null;
  automaticTrackingEnabled: boolean;
  isDefault: boolean;
  iconKey: string | null;
  colorKey: string | null;
  notes: string | null;
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  kind: 'system' | 'custom';
  financialType: 'income' | 'expense' | null;
  parentId: string | null;
  labelAr: string;
  labelEn: string;
  iconKey: string | null;
  colorKey: string | null;
  isFavorite: boolean;
  status: 'active' | 'archived' | 'merged';
  mergedIntoId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amountMinor: number;
  currencyCode: string;
  accountId: string;
  destinationAccountId: string | null;
  transferPurpose?: 'internal' | 'card_payoff' | null;
  feeMinor: number;
  categoryId: string | null;
  title: string;
  merchant: string | null;
  paymentMethod: string | null;
  occurredAt: number;
  source: TransactionSource;
  status: 'pending' | 'posted' | 'failed' | 'refunded' | 'reversed' | 'deleted';
  reviewStatus: 'none' | 'required' | 'resolved';
  syncStatus: SyncStatus;
  originalTransactionId: string | null;
  obligationId: string | null;
  notes: string | null;
  version: number;
  adjustmentSign: -1 | 1;
  deletedAt: number | null;
  undoExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionDraft {
  id: string;
  transactionType: TransactionType | null;
  amountText: string;
  accountId: string | null;
  destinationAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  notes: string | null;
  occurredAt: number | null;
  status: 'editing' | 'valid' | 'saving' | 'saved' | 'discarded';
  updatedAt: number;
}

export interface TransactionFilterSet {
  search: string;
  periodStart: number | null;
  periodEnd: number | null;
  accountIds: string[];
  categoryIds: string[];
  types: TransactionType[];
  sources: TransactionSource[];
  statuses: Transaction['status'][];
  syncStatuses: SyncStatus[];
  reviewRequired: boolean | null;
  amountCurrencyCode: string | null;
  minMinor: number | null;
  maxMinor: number | null;
  sort: 'newest' | 'oldest' | 'amount_high' | 'amount_low';
}

export interface SyncConflict {
  id: string;
  transactionId: string;
  localSnapshot: Transaction;
  laterSnapshot: Transaction;
  resolution: 'keep_local' | 'keep_later' | 'keep_both' | null;
  status: 'pending' | 'resolving' | 'resolved' | 'failed';
  createdAt: number;
  resolvedAt: number | null;
}

export interface ExchangeRateEstimate {
  baseCurrencyCode: string;
  quoteCurrencyCode: string;
  rate: number;
  asOf: number;
  status: 'available' | 'stale' | 'unavailable';
}

export interface EstimatedComponent {
  accountId: string;
  originalMinor: number;
  currencyCode: string;
  convertedMinor: number;
  rate: number;
  asOf: number;
}

export interface HomeSummary {
  totalBalanceMinor: number;
  currencyCode: string;
  isEstimated: boolean;
  components: EstimatedComponent[];
  excludedAccountIds: string[];
  periodIncomeMinor: number;
  periodExpenseMinor: number;
  activeAccountCount: number;
  recentTransactions: Transaction[];
  reviewCount: number;
  pendingSyncCount: number;
  dataState: 'ready' | 'empty' | 'partial' | 'offline' | 'stale';
}

export interface TransactionEffect {
  accountDeltaMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  feeMinor: number;
}

export interface TransactionEffectProjection {
  confirmed: TransactionEffect;
  pending: TransactionEffect;
}

interface TransactionProjectionContext {
  accountId: string | null;
  transactionById: ReadonlyMap<string, Transaction>;
  activeRefundIds: ReadonlySet<string>;
  activeReversalIds: ReadonlySet<string>;
}

export const emptyTransactionFilters: TransactionFilterSet = {
  search: '',
  periodStart: null,
  periodEnd: null,
  accountIds: [],
  categoryIds: [],
  types: [],
  sources: [],
  statuses: [],
  syncStatuses: [],
  reviewRequired: null,
  amountCurrencyCode: null,
  minMinor: null,
  maxMinor: null,
  sort: 'newest'
};

const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);
const safeMinorSchema = z.number().int().safe();

export const accountInputSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(accountTypes),
    currencyCode: currencyCodeSchema,
    openingBalanceMinor: safeMinorSchema,
    institution: z.string().trim().max(100).nullable().default(null),
    lastFour: z
      .string()
      .regex(/^\d{4}$/)
      .nullable()
      .default(null),
    creditLimitMinor: safeMinorSchema.nonnegative().nullable().default(null),
    statementDay: z.number().int().min(1).max(28).nullable().default(null),
    paymentDueDay: z.number().int().min(1).max(28).nullable().default(null),
    monthlyInterestRateBasisPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .nullable()
      .default(null),
    minimumPaymentMinor: safeMinorSchema.positive().nullable().default(null),
    automaticTrackingEnabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    notes: z.string().trim().max(500).nullable().default(null)
  })
  .superRefine((value, context) => {
    if (
      value.type !== 'credit_card' &&
      [
        value.statementDay,
        value.paymentDueDay,
        value.monthlyInterestRateBasisPoints,
        value.minimumPaymentMinor
      ].some((item) => item !== null)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: 'coreFinance.validation.cardTermsRequireCreditCard'
      });
  });

export const categoryInputSchema = z
  .object({
    id: z.string().optional(),
    labelAr: z.string().trim().min(1),
    labelEn: z.string().trim().min(1),
    financialType: z.enum(['income', 'expense']),
    parentId: z.string().nullable().default(null),
    iconKey: z.string().nullable().default(null),
    colorKey: z.string().nullable().default(null),
    isFavorite: z.boolean().default(false)
  })
  .superRefine((value, context) => {
    if (value.id && value.parentId === value.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentId'],
        message: 'coreFinance.validation.categoryCycle'
      });
    }
  });

export const transactionInputSchema = z
  .object({
    type: z.enum(transactionTypes),
    amountMinor: safeMinorSchema.positive(),
    currencyCode: currencyCodeSchema,
    accountId: z.string().min(1),
    destinationAccountId: z.string().nullable().default(null),
    transferPurpose: z
      .enum(['internal', 'card_payoff'])
      .nullable()
      .default(null),
    feeMinor: safeMinorSchema.nonnegative().default(0),
    categoryId: z.string().nullable().default(null),
    title: z.string().trim().min(1),
    merchant: z.string().trim().nullable().default(null),
    occurredAt: z.number().int().nonnegative(),
    notes: z.string().trim().max(500).nullable().default(null),
    originalTransactionId: z.string().nullable().default(null),
    obligationId: z.string().nullable().default(null)
  })
  .superRefine((value, context) => {
    if (value.type !== 'transfer' && value.transferPurpose) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['transferPurpose'],
        message: 'coreFinance.validation.transferPurpose'
      });
    }
    if (value.type === 'transfer' && value.categoryId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: 'coreFinance.validation.transferCategory'
      });
    }
    if (
      value.type === 'transfer' &&
      safeMinorSum(value.amountMinor, value.feeMinor) === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['feeMinor'],
        message: 'coreFinance.validation.amount'
      });
    }
    if (
      value.type === 'transfer' &&
      (!value.destinationAccountId ||
        value.destinationAccountId === value.accountId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationAccountId'],
        message: 'coreFinance.validation.transferAccounts'
      });
    }
    if (
      value.type !== 'transfer' &&
      value.type !== 'adjustment' &&
      value.type !== 'refund' &&
      !value.categoryId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: 'coreFinance.validation.categoryRequired'
      });
    }
    if (
      (value.type === 'refund' || value.type === 'reversal') &&
      !value.originalTransactionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['originalTransactionId'],
        message: 'coreFinance.validation.originalRequired'
      });
    }
  });

export const draftInputSchema = z.object({
  id: z.string().min(1),
  transactionType: z.enum(transactionTypes).nullable(),
  amountText: z.string(),
  accountId: z.string().nullable(),
  destinationAccountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  merchant: z.string().trim().nullable(),
  notes: z.string().trim().max(500).nullable(),
  occurredAt: z.number().int().nonnegative().nullable(),
  status: z.enum(['editing', 'valid', 'saving', 'saved', 'discarded']),
  updatedAt: z.number().int().nonnegative()
});

export const conflictResolutionSchema = z.enum([
  'keep_local',
  'keep_later',
  'keep_both'
]);

export type AccountInput = z.input<typeof accountInputSchema>;

export function supportsAutomaticTrackingAccountType(
  type: AccountType
): boolean {
  return automaticTrackingAccountTypes.has(type);
}

export function accountAllowsAutomaticTracking(account: Account): boolean {
  return (
    account.status === 'active' &&
    account.automaticTrackingEnabled &&
    supportsAutomaticTrackingAccountType(account.type)
  );
}
export type CategoryInput = z.input<typeof categoryInputSchema>;
export type TransactionInput = z.input<typeof transactionInputSchema>;
export type DraftInput = z.input<typeof draftInputSchema>;
export type ConflictResolution = z.input<typeof conflictResolutionSchema>;

export function parseAmountToMinor(
  text: string,
  currencyCode: string
): number | null {
  const scale = getCurrencyMinorUnitScale(currencyCode);
  const normalized = text.trim().replaceAll(',', '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > scale) return null;
  const value =
    Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

export function safeMinorSum(left: number, right: number): number | null {
  const total = left + right;
  return Number.isSafeInteger(total) ? total : null;
}

export function transactionEffectForAccount(
  transaction: Transaction,
  accountId: string,
  originalTransaction: Transaction | null = null
): number {
  return projectTransactionEffect(transaction, accountId, originalTransaction)
    .confirmed.accountDeltaMinor;
}

export function projectTransactionEffect(
  transaction: Transaction,
  accountId: string | null,
  originalTransaction: Transaction | null = null
): TransactionEffectProjection {
  const effect = transactionValues(transaction, accountId, originalTransaction);
  if (isConfirmedTransaction(transaction)) {
    return { confirmed: effect, pending: emptyTransactionEffect() };
  }
  if (isPendingTransaction(transaction)) {
    return { confirmed: emptyTransactionEffect(), pending: effect };
  }
  return {
    confirmed: emptyTransactionEffect(),
    pending: emptyTransactionEffect()
  };
}

export function projectTransactionEffects(
  transactions: readonly Transaction[],
  accountId: string | null
): ReadonlyMap<string, TransactionEffectProjection> {
  const transactionById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );
  const activeReversalIds = selectActiveReversalIds(
    transactions,
    transactionById
  );
  const reversedOriginalIds = new Set(
    [...activeReversalIds].flatMap((reversalId) => {
      const originalId = transactionById.get(reversalId)?.originalTransactionId;
      return originalId ? [originalId] : [];
    })
  );
  const activeRefundIds = selectActiveRefundIds(
    transactions,
    transactionById,
    reversedOriginalIds
  );
  const context = {
    accountId,
    transactionById,
    activeRefundIds,
    activeReversalIds
  };
  return new Map(
    transactions.map((transaction) => [
      transaction.id,
      projectAggregateTransaction(transaction, context)
    ])
  );
}

function projectAggregateTransaction(
  transaction: Transaction,
  context: TransactionProjectionContext
): TransactionEffectProjection {
  const original = transaction.originalTransactionId
    ? (context.transactionById.get(transaction.originalTransactionId) ?? null)
    : null;
  const eligibleOriginal =
    transaction.type === 'reversal'
      ? context.activeReversalIds.has(transaction.id)
        ? original
        : null
      : transaction.type === 'refund'
        ? context.activeRefundIds.has(transaction.id)
          ? original
          : null
        : original;
  return projectTransactionEffect(
    transaction,
    context.accountId,
    eligibleOriginal
  );
}

export function isConfirmedTransaction(transaction: Transaction): boolean {
  return (
    transaction.status === 'posted' &&
    transaction.reviewStatus !== 'required' &&
    transaction.syncStatus !== 'conflict'
  );
}

function isPendingTransaction(transaction: Transaction): boolean {
  return (
    transaction.status === 'pending' &&
    transaction.reviewStatus !== 'required' &&
    transaction.syncStatus !== 'conflict'
  );
}

function transactionValues(
  transaction: Transaction,
  accountId: string | null,
  originalTransaction: Transaction | null
): TransactionEffect {
  if (transaction.type === 'transfer')
    return transferValues(transaction, accountId);
  if (transaction.type === 'reversal') {
    return reversalValues(transaction, accountId, originalTransaction);
  }
  const onAccount = transaction.accountId === accountId;
  if (transaction.type === 'income')
    return effect(
      onAccount ? transaction.amountMinor : 0,
      transaction.amountMinor,
      0
    );
  if (transaction.type === 'refund') {
    return refundValues(transaction, accountId, originalTransaction);
  }
  if (transaction.type === 'adjustment')
    return effect(
      onAccount ? transaction.amountMinor * transaction.adjustmentSign : 0,
      0,
      0
    );
  return effect(
    onAccount ? -transaction.amountMinor : 0,
    0,
    transaction.amountMinor
  );
}

function refundValues(
  transaction: Transaction,
  accountId: string | null,
  originalTransaction: Transaction | null
): TransactionEffect {
  if (!hasEligibleRefundOriginal(transaction, originalTransaction)) {
    return emptyTransactionEffect();
  }
  return effect(
    transaction.accountId === accountId ? transaction.amountMinor : 0,
    0,
    -transaction.amountMinor
  );
}

function transferValues(
  transaction: Transaction,
  accountId: string | null
): TransactionEffect {
  const sourceDebitMinor = safeMinorSum(
    transaction.amountMinor,
    transaction.feeMinor
  );
  if (sourceDebitMinor === null) throw new RangeError('unsafe_minor_total');
  const accountDeltaMinor =
    transaction.accountId === accountId
      ? -sourceDebitMinor
      : transaction.destinationAccountId === accountId
        ? transaction.amountMinor
        : 0;
  return effect(accountDeltaMinor, 0, 0, transaction.feeMinor);
}

function reversalValues(
  transaction: Transaction,
  accountId: string | null,
  originalTransaction: Transaction | null
): TransactionEffect {
  if (!hasEligibleOriginal(transaction, originalTransaction)) {
    return emptyTransactionEffect();
  }
  const original = transactionValues(originalTransaction, accountId, null);
  return effect(
    negate(original.accountDeltaMinor),
    negate(original.incomeMinor),
    negate(original.expenseMinor),
    negate(original.feeMinor)
  );
}

function hasEligibleOriginal(
  transaction: Transaction,
  originalTransaction: Transaction | null
): originalTransaction is Transaction {
  return (
    originalTransaction !== null &&
    transaction.originalTransactionId === originalTransaction.id &&
    isConfirmedTransaction(originalTransaction)
  );
}

function hasEligibleRefundOriginal(
  refund: Transaction,
  original: Transaction | null
): original is Transaction {
  return (
    hasEligibleOriginal(refund, original) &&
    original.type === 'expense' &&
    original.id !== refund.id &&
    original.accountId === refund.accountId &&
    original.currencyCode === refund.currencyCode
  );
}

function selectActiveRefundIds(
  transactions: readonly Transaction[],
  transactionById: ReadonlyMap<string, Transaction>,
  reversedOriginalIds: ReadonlySet<string>
): Set<string> {
  const refundedByOriginal = new Map<string, number>();
  const selected = new Set<string>();
  const candidates = transactions
    .filter(
      (transaction) =>
        transaction.type === 'refund' &&
        (isConfirmedTransaction(transaction) ||
          isPendingTransaction(transaction))
    )
    .sort(compareLinkedPriority);
  for (const refund of candidates) {
    const original = refund.originalTransactionId
      ? (transactionById.get(refund.originalTransactionId) ?? null)
      : null;
    if (
      !hasEligibleRefundOriginal(refund, original) ||
      reversedOriginalIds.has(original.id) ||
      reversedOriginalIds.has(refund.id)
    )
      continue;
    const refunded = refundedByOriginal.get(original.id) ?? 0;
    if (refund.amountMinor > original.amountMinor - refunded) continue;
    refundedByOriginal.set(original.id, refunded + refund.amountMinor);
    selected.add(refund.id);
  }
  return selected;
}

function selectActiveReversalIds(
  transactions: readonly Transaction[],
  transactionById: ReadonlyMap<string, Transaction>
): Set<string> {
  const selectedOriginalIds = new Set<string>();
  const selectedReversalIds = new Set<string>();
  const candidates = activeReversalCandidates(transactions);
  for (const reversal of candidates) {
    const originalId = eligibleOriginalId(reversal, transactionById);
    if (!originalId || selectedOriginalIds.has(originalId)) continue;
    selectedOriginalIds.add(originalId);
    selectedReversalIds.add(reversal.id);
  }
  return selectedReversalIds;
}

function activeReversalCandidates(
  transactions: readonly Transaction[]
): Transaction[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'reversal' &&
        (isConfirmedTransaction(transaction) ||
          isPendingTransaction(transaction))
    )
    .sort(compareLinkedPriority);
}

function eligibleOriginalId(
  reversal: Transaction,
  transactionById: ReadonlyMap<string, Transaction>
): string | null {
  const originalId = reversal.originalTransactionId;
  const original = originalId
    ? (transactionById.get(originalId) ?? null)
    : null;
  return originalId && hasEligibleOriginal(reversal, original)
    ? originalId
    : null;
}

function compareLinkedPriority(left: Transaction, right: Transaction): number {
  return (
    reversalStatusPriority(left) - reversalStatusPriority(right) ||
    left.occurredAt - right.occurredAt ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}

function reversalStatusPriority(transaction: Transaction): number {
  return isConfirmedTransaction(transaction) ? 0 : 1;
}

function negate(minorUnits: number): number {
  return minorUnits === 0 ? 0 : -minorUnits;
}

function effect(
  accountDeltaMinor: number,
  incomeMinor: number,
  expenseMinor: number,
  feeMinor = 0
): TransactionEffect {
  return { accountDeltaMinor, incomeMinor, expenseMinor, feeMinor };
}

function emptyTransactionEffect(): TransactionEffect {
  return effect(0, 0, 0);
}

export function deriveAccountBalance(
  account: Account,
  transactions: readonly Transaction[]
): number {
  const projections = projectTransactionEffects(transactions, account.id);
  return transactions.reduce((total, transaction) => {
    const next = safeMinorSum(
      total,
      projections.get(transaction.id)?.confirmed.accountDeltaMinor ?? 0
    );
    if (next === null) throw new RangeError('unsafe_minor_total');
    return next;
  }, account.openingBalanceMinor);
}

export function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '');
}

export function matchesFilters(
  transaction: Transaction,
  filters: TransactionFilterSet
): boolean {
  if (transaction.status === 'deleted' && filters.statuses.length === 0)
    return false;
  const query = normalizeSearch(filters.search);
  if (
    query &&
    !normalizeSearch(
      `${transaction.title} ${transaction.merchant ?? ''}`
    ).includes(query)
  )
    return false;
  if (
    filters.periodStart !== null &&
    transaction.occurredAt < filters.periodStart
  )
    return false;
  if (filters.periodEnd !== null && transaction.occurredAt > filters.periodEnd)
    return false;
  if (
    filters.accountIds.length &&
    !filters.accountIds.includes(transaction.accountId) &&
    !(
      transaction.type === 'transfer' &&
      transaction.destinationAccountId !== null &&
      filters.accountIds.includes(transaction.destinationAccountId)
    )
  )
    return false;
  if (
    filters.categoryIds.length &&
    (!transaction.categoryId ||
      !filters.categoryIds.includes(transaction.categoryId))
  )
    return false;
  if (filters.types.length && !filters.types.includes(transaction.type))
    return false;
  if (filters.sources.length && !filters.sources.includes(transaction.source))
    return false;
  if (filters.statuses.length && !filters.statuses.includes(transaction.status))
    return false;
  if (
    filters.syncStatuses.length &&
    !filters.syncStatuses.includes(transaction.syncStatus)
  )
    return false;
  if (
    filters.reviewRequired !== null &&
    (transaction.reviewStatus === 'required') !== filters.reviewRequired
  )
    return false;
  if (
    (filters.minMinor !== null || filters.maxMinor !== null) &&
    transaction.currencyCode !== filters.amountCurrencyCode
  )
    return false;
  if (filters.minMinor !== null && transaction.amountMinor < filters.minMinor)
    return false;
  if (filters.maxMinor !== null && transaction.amountMinor > filters.maxMinor)
    return false;
  return true;
}
