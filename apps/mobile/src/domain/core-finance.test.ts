import {
  deriveAccountBalance,
  emptyTransactionFilters,
  matchesFilters,
  normalizeSearch,
  parseAmountToMinor,
  transactionEffectForAccount,
  accountInputSchema,
  type Account,
  type Transaction
} from './core-finance';

const now = 1_700_000_000_000;
const account: Account = {
  id: 'a1',
  name: 'Main',
  type: 'bank',
  currencyCode: 'SAR',
  openingBalanceMinor: 100_000,
  institution: null,
  lastFour: '1234',
  creditLimitMinor: null,
  automaticTrackingEnabled: true,
  isDefault: true,
  iconKey: null,
  colorKey: null,
  notes: null,
  status: 'active',
  createdAt: now,
  updatedAt: now
};

it('defaults account automatic tracking on and preserves an explicit opt-out', () => {
  const base = {
    name: 'Main',
    type: 'bank' as const,
    currencyCode: 'SAR',
    openingBalanceMinor: 0
  };
  expect(accountInputSchema.parse(base).automaticTrackingEnabled).toBe(true);
  expect(
    accountInputSchema.parse({ ...base, automaticTrackingEnabled: false })
      .automaticTrackingEnabled
  ).toBe(false);
});
const transaction = (overrides: Partial<Transaction>): Transaction => ({
  id: 't1',
  type: 'expense',
  amountMinor: 2_500,
  currencyCode: 'SAR',
  accountId: 'a1',
  destinationAccountId: null,
  feeMinor: 0,
  categoryId: 'food',
  title: 'Coffee',
  merchant: null,
  paymentMethod: 'card',
  occurredAt: now,
  source: 'manual',
  status: 'posted',
  reviewStatus: 'none',
  syncStatus: 'synced',
  originalTransactionId: null,
  obligationId: null,
  notes: null,
  version: 1,
  adjustmentSign: 1,
  deletedAt: null,
  undoExpiresAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

describe('money parsing', () => {
  it.each([
    ['JPY', '12', 12],
    ['SAR', '12.34', 1234],
    ['OMR', '12.345', 12345],
    ['KWD', '0.001', 1],
    ['BHD', '1.230', 1230],
    ['JOD', '999999.999', 999999999]
  ])('preserves %s minor units from %s', (currencyCode, text, expected) => {
    expect(parseAmountToMinor(text, currencyCode)).toBe(expected);
  });

  it.each([
    ['12', 1200],
    ['12.3', 1230],
    ['1,234.56', 123456]
  ])('parses %s', (text, expected) => {
    expect(parseAmountToMinor(text, 'SAR')).toBe(expected);
  });
  it.each(['', '-1', '1.234', 'abc'])('rejects %s', (text) =>
    expect(parseAmountToMinor(text, 'SAR')).toBeNull()
  );
  it('rejects values beyond the safe integer limit', () => {
    expect(parseAmountToMinor('90071992547409.92', 'SAR')).toBeNull();
  });
  it('formats user input scale deterministically through parsed minor units', () => {
    expect(parseAmountToMinor('0.01', 'SAR')).toBe(1);
    expect(parseAmountToMinor('0.1', 'SAR')).toBe(10);
  });
});

describe('ledger effects', () => {
  it('derives balance from opening balance and posted effects only', () => {
    const items = [
      transaction({}),
      transaction({ id: 't2', type: 'income', amountMinor: 10_000 }),
      transaction({ id: 't3', status: 'deleted', amountMinor: 90_000 })
    ];
    expect(deriveAccountBalance(account, items)).toBe(107_500);
  });
  it('applies transfer to source and destination without changing unrelated accounts', () => {
    const item = transaction({
      type: 'transfer',
      destinationAccountId: 'a2',
      amountMinor: 5_000,
      feeMinor: 100,
      categoryId: null
    });
    expect(transactionEffectForAccount(item, 'a1')).toBe(-5_100);
    expect(transactionEffectForAccount(item, 'a2')).toBe(5_000);
    expect(transactionEffectForAccount(item, 'a3')).toBe(0);
  });
  it('uses an explicit sign for adjustments', () => {
    expect(
      transactionEffectForAccount(
        transaction({
          type: 'adjustment',
          amountMinor: 500,
          adjustmentSign: -1,
          categoryId: null
        }),
        'a1'
      )
    ).toBe(-500);
  });
  it('excludes failed, deleted, draft-like pending, and unresolved conflict records', () => {
    const items = [
      transaction({ id: 'posted', amountMinor: 1000 }),
      transaction({ id: 'failed', status: 'failed', amountMinor: 1000 }),
      transaction({ id: 'deleted', status: 'deleted', amountMinor: 1000 }),
      transaction({ id: 'pending', status: 'pending', amountMinor: 1000 }),
      transaction({ id: 'conflict', syncStatus: 'conflict', amountMinor: 1000 })
    ];
    expect(deriveAccountBalance(account, items)).toBe(99_000);
  });
});

describe('search and filters', () => {
  it('normalizes Arabic diacritics', () =>
    expect(normalizeSearch(' مَطْعَم ')).toBe('مطعم'));
  it('combines search and typed filters', () => {
    expect(
      matchesFilters(transaction({}), {
        ...emptyTransactionFilters,
        search: 'coffee',
        types: ['expense']
      })
    ).toBe(true);
    expect(
      matchesFilters(transaction({}), {
        ...emptyTransactionFilters,
        sources: ['voice']
      })
    ).toBe(false);
  });

  it('hides deleted transactions by default and includes them only when requested', () => {
    const deleted = transaction({ status: 'deleted' });

    expect(matchesFilters(deleted, emptyTransactionFilters)).toBe(false);
    expect(
      matchesFilters(deleted, {
        ...emptyTransactionFilters,
        statuses: ['deleted']
      })
    ).toBe(true);
  });

  it.each([
    ['OMR', true],
    ['SAR', false]
  ])(
    'applies OMR amount thresholds only to %s transactions',
    (currencyCode, expected) => {
      expect(
        matchesFilters(
          transaction({ amountMinor: 12_345, currencyCode }),
          {
            ...emptyTransactionFilters,
            amountCurrencyCode: 'OMR',
            minMinor: 12_000,
            maxMinor: 13_000
          }
        )
      ).toBe(expected);
    }
  );
});
