import {
  deriveAccountBalance,
  emptyTransactionFilters,
  matchesFilters,
  projectTransactionEffect,
  projectTransactionEffects,
  type Account,
  type Transaction
} from './core-finance';

const account: Account = {
  id: 'source',
  name: 'Source',
  type: 'bank',
  currencyCode: 'SAR',
  openingBalanceMinor: 1_000,
  institution: null,
  lastFour: null,
  creditLimitMinor: null,
  statementDay: null,
  paymentDueDay: null,
  monthlyInterestRateBasisPoints: null,
  minimumPaymentMinor: null,
  automaticTrackingEnabled: true,
  isDefault: true,
  iconKey: null,
  colorKey: null,
  notes: null,
  status: 'active',
  createdAt: 1,
  updatedAt: 1
};

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'transaction',
    type: 'expense',
    amountMinor: 100,
    currencyCode: 'SAR',
    accountId: 'source',
    destinationAccountId: null,
    feeMinor: 0,
    categoryId: 'food',
    title: 'Transaction',
    merchant: null,
    paymentMethod: null,
    occurredAt: 1,
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
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

const noEffect = {
  accountDeltaMinor: 0,
  incomeMinor: 0,
  expenseMinor: 0,
  feeMinor: 0
};

describe('canonical transaction effects', () => {
  it('rejects an unsafe account total instead of rounding minor units', () => {
    expect(() =>
      deriveAccountBalance(
        { ...account, openingBalanceMinor: Number.MAX_SAFE_INTEGER },
        [transaction({ type: 'income', amountMinor: 1 })]
      )
    ).toThrow('unsafe_minor_total');
  });

  it('rejects a persisted transfer whose principal and fee are unsafe', () => {
    expect(() =>
      projectTransactionEffects(
        [
          transaction({
            type: 'transfer',
            amountMinor: Number.MAX_SAFE_INTEGER,
            feeMinor: 1,
            categoryId: null,
            destinationAccountId: 'destination'
          })
        ],
        null
      )
    ).toThrow('unsafe_minor_total');
  });

  it.each([
    [
      'posted income is confirmed and positive',
      transaction({ type: 'income' }),
      'source',
      null,
      {
        confirmed: {
          accountDeltaMinor: 100,
          incomeMinor: 100,
          expenseMinor: 0,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'posted refund restores the account and offsets expense',
      transaction({ type: 'refund', originalTransactionId: 'original' }),
      'source',
      transaction({ id: 'original' }),
      {
        confirmed: {
          accountDeltaMinor: 100,
          incomeMinor: 0,
          expenseMinor: -100,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'posted expense reduces the source account',
      transaction(),
      'source',
      null,
      {
        confirmed: {
          accountDeltaMinor: -100,
          incomeMinor: 0,
          expenseMinor: 100,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'posted obligation payment is expense',
      transaction({ type: 'obligation_payment' }),
      'source',
      null,
      {
        confirmed: {
          accountDeltaMinor: -100,
          incomeMinor: 0,
          expenseMinor: 100,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'posted recurring payment is expense',
      transaction({ type: 'recurring_payment' }),
      'source',
      null,
      {
        confirmed: {
          accountDeltaMinor: -100,
          incomeMinor: 0,
          expenseMinor: 100,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'transfer source pays principal and fee without global income or expense',
      transaction({
        type: 'transfer',
        destinationAccountId: 'destination',
        feeMinor: 5
      }),
      'source',
      null,
      {
        confirmed: {
          accountDeltaMinor: -105,
          incomeMinor: 0,
          expenseMinor: 0,
          feeMinor: 5
        },
        pending: noEffect
      }
    ],
    [
      'incoming transfer credits the destination account',
      transaction({
        type: 'transfer',
        destinationAccountId: 'destination',
        feeMinor: 5
      }),
      'destination',
      null,
      {
        confirmed: {
          accountDeltaMinor: 100,
          incomeMinor: 0,
          expenseMinor: 0,
          feeMinor: 5
        },
        pending: noEffect
      }
    ],
    [
      'transfer leaves an unrelated account unchanged',
      transaction({
        type: 'transfer',
        destinationAccountId: 'destination',
        feeMinor: 5
      }),
      'other',
      null,
      {
        confirmed: {
          accountDeltaMinor: 0,
          incomeMinor: 0,
          expenseMinor: 0,
          feeMinor: 5
        },
        pending: noEffect
      }
    ],
    [
      'pending expense stays separate from confirmed totals',
      transaction({ status: 'pending' }),
      'source',
      null,
      {
        confirmed: noEffect,
        pending: {
          accountDeltaMinor: -100,
          incomeMinor: 0,
          expenseMinor: 100,
          feeMinor: 0
        }
      }
    ],
    [
      'pending transfer keeps its fee and balance effect separate',
      transaction({
        type: 'transfer',
        status: 'pending',
        destinationAccountId: 'destination',
        feeMinor: 5
      }),
      'source',
      null,
      {
        confirmed: noEffect,
        pending: {
          accountDeltaMinor: -105,
          incomeMinor: 0,
          expenseMinor: 0,
          feeMinor: 5
        }
      }
    ],
    [
      'pending partial refund offsets only its linked amount',
      transaction({
        type: 'refund',
        status: 'pending',
        amountMinor: 40,
        originalTransactionId: 'original'
      }),
      'source',
      transaction({ id: 'original', amountMinor: 100 }),
      {
        confirmed: noEffect,
        pending: {
          accountDeltaMinor: 40,
          incomeMinor: 0,
          expenseMinor: -40,
          feeMinor: 0
        }
      }
    ],
    [
      'pending reversal keeps its linked negation separate',
      transaction({
        type: 'reversal',
        status: 'pending',
        originalTransactionId: 'original'
      }),
      'source',
      transaction({ id: 'original' }),
      {
        confirmed: noEffect,
        pending: {
          accountDeltaMinor: 100,
          incomeMinor: 0,
          expenseMinor: -100,
          feeMinor: 0
        }
      }
    ],
    [
      'failed financial event has no effect',
      transaction({ status: 'failed' }),
      'source',
      null,
      { confirmed: noEffect, pending: noEffect }
    ],
    [
      'deleted financial event has no effect',
      transaction({ status: 'deleted' }),
      'source',
      null,
      { confirmed: noEffect, pending: noEffect }
    ],
    [
      'refunded original has no active effect',
      transaction({ status: 'refunded' }),
      'source',
      null,
      { confirmed: noEffect, pending: noEffect }
    ],
    [
      'reversed original has no active effect',
      transaction({ status: 'reversed' }),
      'source',
      null,
      { confirmed: noEffect, pending: noEffect }
    ],
    [
      'posted reversal negates its linked posted expense',
      transaction({
        id: 'reversal',
        type: 'reversal',
        originalTransactionId: 'original'
      }),
      'source',
      transaction({ id: 'original' }),
      {
        confirmed: {
          accountDeltaMinor: 100,
          incomeMinor: 0,
          expenseMinor: -100,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'posted reversal does not negate an already reversed original twice',
      transaction({
        id: 'reversal',
        type: 'reversal',
        originalTransactionId: 'original'
      }),
      'source',
      transaction({ id: 'original', status: 'reversed' }),
      { confirmed: noEffect, pending: noEffect }
    ],
    [
      'posted local value remains confirmed after sync failure',
      transaction({ syncStatus: 'failed' }),
      'source',
      null,
      {
        confirmed: {
          accountDeltaMinor: -100,
          incomeMinor: 0,
          expenseMinor: 100,
          feeMinor: 0
        },
        pending: noEffect
      }
    ],
    [
      'unresolved conflict has no effect',
      transaction({ syncStatus: 'conflict' }),
      'source',
      null,
      { confirmed: noEffect, pending: noEffect }
    ]
  ])('%s', (_label, financialEvent, accountId, original, expected) => {
    expect(
      projectTransactionEffect(financialEvent, accountId, original)
    ).toEqual(expected);
  });

  it.each([
    ['linked posted original', 'posted' as const, 1_000],
    ['already reversed original', 'reversed' as const, 1_000]
  ])(
    'applies a reversal exactly once for an %s',
    (_label, originalStatus, expectedBalance) => {
      const original = transaction({ id: 'original', status: originalStatus });
      const reversal = transaction({
        id: 'reversal',
        type: 'reversal',
        originalTransactionId: original.id
      });

      expect(deriveAccountBalance(account, [original, reversal])).toBe(
        expectedBalance
      );
    }
  );

  it.each([
    [
      'unlinked posted refund',
      [transaction({ type: 'refund', originalTransactionId: null })],
      'transaction'
    ],
    [
      'refund marker for an already-refunded original',
      [
        transaction({ id: 'original', status: 'refunded' }),
        transaction({
          id: 'refund',
          type: 'refund',
          amountMinor: 40,
          originalTransactionId: 'original'
        })
      ],
      'refund'
    ]
  ] as const)(
    'treats an %s as informational',
    (_label, transactions, markerId) => {
      expect(
        projectTransactionEffects(transactions, 'source').get(markerId)
      ).toEqual({ confirmed: noEffect, pending: noEffect });
    }
  );

  it('applies a partial refund against its eligible linked original', () => {
    const original = transaction({ id: 'original', amountMinor: 100 });
    const refund = transaction({
      id: 'refund',
      type: 'refund',
      amountMinor: 40,
      originalTransactionId: original.id
    });

    expect(
      projectTransactionEffects([original, refund], 'source').get(refund.id)
    ).toEqual({
      confirmed: {
        accountDeltaMinor: 40,
        incomeMinor: 0,
        expenseMinor: -40,
        feeMinor: 0
      },
      pending: noEffect
    });
    expect(deriveAccountBalance(account, [original, refund])).toBe(940);
  });

  it.each([
    ['income original', { type: 'income' as const }, {}],
    ['different account', {}, { accountId: 'other' }],
    ['different currency', {}, { currencyCode: 'AED' }]
  ])(
    'keeps a persisted refund with an invalid %s informational',
    (_case, originalPatch, refundPatch) => {
      const original = transaction({ id: 'original', ...originalPatch });
      const refund = transaction({
        id: 'refund',
        type: 'refund',
        amountMinor: 40,
        originalTransactionId: original.id,
        ...refundPatch
      });

      expect(
        projectTransactionEffects([original, refund], refund.accountId).get(
          refund.id
        )
      ).toEqual({ confirmed: noEffect, pending: noEffect });
    }
  );

  it('applies only deterministic refunds that fit the original amount', () => {
    const original = transaction({ id: 'original', amountMinor: 100 });
    const first = transaction({
      id: 'refund-first',
      type: 'refund',
      amountMinor: 60,
      originalTransactionId: original.id,
      occurredAt: 2
    });
    const overflow = transaction({
      id: 'refund-overflow',
      type: 'refund',
      amountMinor: 50,
      originalTransactionId: original.id,
      occurredAt: 3
    });

    const projections = projectTransactionEffects(
      [overflow, original, first],
      'source'
    );
    expect(projections.get(first.id)?.confirmed.expenseMinor).toBe(-60);
    expect(projections.get(overflow.id)).toEqual({
      confirmed: noEffect,
      pending: noEffect
    });
    expect(deriveAccountBalance(account, [overflow, original, first])).toBe(
      960
    );
  });

  it('applies only one active reversal for the same original', () => {
    const original = transaction({ id: 'original' });
    const first = transaction({
      id: 'reversal-first',
      type: 'reversal',
      originalTransactionId: original.id,
      occurredAt: 2
    });
    const duplicate = transaction({
      id: 'reversal-duplicate',
      type: 'reversal',
      originalTransactionId: original.id,
      occurredAt: 3
    });

    const projections = projectTransactionEffects(
      [duplicate, original, first],
      'source'
    );
    const reversalDelta = [first.id, duplicate.id].reduce(
      (total, reversalId) =>
        total + (projections.get(reversalId)?.confirmed.accountDeltaMinor ?? 0),
      0
    );
    expect(reversalDelta).toBe(100);
    expect(deriveAccountBalance(account, [duplicate, original, first])).toBe(
      1_000
    );
  });
});

describe('canonical account and amount filters', () => {
  it('includes a transfer when the selected account is its destination', () => {
    expect(
      matchesFilters(
        transaction({ type: 'transfer', destinationAccountId: 'destination' }),
        { ...emptyTransactionFilters, accountIds: ['destination'] }
      )
    ).toBe(true);
  });

  it.each([
    ['OMR', true],
    ['SAR', false]
  ])('keeps OMR thresholds scoped to %s values', (currencyCode, expected) => {
    expect(
      matchesFilters(transaction({ amountMinor: 12_345, currencyCode }), {
        ...emptyTransactionFilters,
        amountCurrencyCode: 'OMR',
        minMinor: 12_000,
        maxMinor: 13_000
      })
    ).toBe(expected);
  });
});
