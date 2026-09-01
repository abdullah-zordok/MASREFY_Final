import {
  emptyTransactionFilters,
  transactionEffectForAccount,
  type Transaction,
  type TransactionInput
} from '@/domain/core-finance';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions,
  makeTransaction
} from '@/test-utils/core-finance-fixtures';
import { createMockCoreFinanceService } from './core-finance-service';

const at = Date.UTC(2026, 7, 8, 12);
const bank = {
  ...fixtureAccounts[0],
  id: 'bank',
  currencyCode: 'SAR',
  openingBalanceMinor: 100_000
};
const card = {
  ...fixtureAccounts[0],
  id: 'card',
  type: 'credit_card' as const,
  currencyCode: 'SAR',
  openingBalanceMinor: -32_000
};

function payoffService(accounts = [bank, card]) {
  return createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts,
      categories: fixtureCategories,
      transactions: []
    })
  );
}

function transactionInput(transaction: Transaction): TransactionInput {
  return {
    type: transaction.type,
    amountMinor: transaction.amountMinor,
    currencyCode: transaction.currencyCode,
    accountId: transaction.accountId,
    destinationAccountId: transaction.destinationAccountId,
    transferPurpose: transaction.transferPurpose,
    feeMinor: transaction.feeMinor,
    categoryId: transaction.categoryId,
    title: transaction.title,
    merchant: transaction.merchant,
    occurredAt: transaction.occurredAt,
    notes: transaction.notes,
    originalTransactionId: transaction.originalTransactionId,
    obligationId: transaction.obligationId
  };
}

it('applies transfer effects atomically and blocks same-account transfers', async () => {
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: fixtureTransactions.slice(0, 1)
    })
  );
  await expect(
    service.createTransaction({
      type: 'transfer',
      amountMinor: 100,
      currencyCode: 'SAR',
      accountId: 'account-bank',
      destinationAccountId: 'account-bank',
      categoryId: null,
      title: 'Move',
      occurredAt: 1
    })
  ).rejects.toThrow();
  const transfer = (
    await service.createTransaction({
      type: 'transfer',
      amountMinor: 100,
      currencyCode: 'SAR',
      accountId: 'account-bank',
      destinationAccountId: 'account-wallet',
      feeMinor: 5,
      categoryId: null,
      title: 'Move',
      occurredAt: 1
    })
  ).value;
  expect(transactionEffectForAccount(transfer, 'account-bank')).toBe(-105);
  expect(transactionEffectForAccount(transfer, 'account-wallet')).toBe(100);
});

it('keeps refunds linked to the original transaction and distinct from income', async () => {
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: fixtureTransactions.slice(0, 2)
    })
  );
  const refund = await service.createTransaction({
    type: 'refund',
    amountMinor: 50,
    currencyCode: 'SAR',
    accountId: 'account-bank',
    categoryId: 'food',
    title: 'Refund',
    occurredAt: 2,
    originalTransactionId: 'transaction-1'
  });
  expect(refund.value.originalTransactionId).toBe('transaction-1');
  expect(refund.value.type).toBe('refund');
});

it('allows bounded partial and full refunds and rejects cumulative excess atomically', async () => {
  const original = makeTransaction(301, {
    id: 'original-expense',
    type: 'expense',
    amountMinor: 10_000,
    currencyCode: 'SAR',
    accountId: 'account-bank',
    categoryId: 'food',
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced'
  });
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: [original]
    })
  );
  const input = {
    type: 'refund' as const,
    currencyCode: 'SAR',
    accountId: original.accountId,
    categoryId: original.categoryId,
    title: 'Linked refund',
    occurredAt: at,
    originalTransactionId: original.id
  };

  await expect(
    service.createTransaction({ ...input, amountMinor: 2_500 })
  ).resolves.toMatchObject({ value: { type: 'refund', amountMinor: 2_500 } });
  await expect(service.getRemainingRefundableMinor(original.id)).resolves.toBe(
    7_500
  );
  await expect(
    service.createTransaction({ ...input, amountMinor: 7_500 })
  ).resolves.toMatchObject({ value: { type: 'refund', amountMinor: 7_500 } });
  await expect(service.getRemainingRefundableMinor(original.id)).resolves.toBe(
    0
  );
  const before = (await service.listTransactions(emptyTransactionFilters))
    .total;
  await expect(
    service.createTransaction({ ...input, amountMinor: 1 })
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    service.listTransactions(emptyTransactionFilters)
  ).resolves.toMatchObject({ total: before });
});

it.each([
  ['income', { type: 'income' as const }],
  [
    'transfer',
    {
      type: 'transfer' as const,
      categoryId: null,
      destinationAccountId: 'account-wallet'
    }
  ],
  ['deleted', { status: 'deleted' as const }],
  ['review-required', { reviewStatus: 'required' as const }],
  ['conflict', { syncStatus: 'conflict' as const }]
])(
  'rejects a refund of an ineligible %s original without mutation',
  async (_case, patch) => {
    const original = makeTransaction(401, {
      id: 'ineligible-original',
      type: 'expense',
      accountId: 'account-bank',
      currencyCode: 'SAR',
      categoryId: 'food',
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'synced',
      ...patch
    });
    const service = createMockCoreFinanceService(
      new CoreFinanceRepository({
        accounts: fixtureAccounts,
        categories: fixtureCategories,
        transactions: [original]
      })
    );

    await expect(
      service.createTransaction({
        type: 'refund',
        amountMinor: 100,
        currencyCode: 'SAR',
        accountId: 'account-bank',
        categoryId: 'food',
        title: 'Invalid refund',
        occurredAt: at,
        originalTransactionId: original.id
      })
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(service.getTransaction(original.id)).resolves.toEqual(
      original
    );
  }
);

it.each([
  ['type', { type: 'income' as const }],
  ['account', { accountId: 'account-wallet' }],
  ['amount', { amountMinor: 49 }]
])(
  'rejects changing a refunded original %s without mutation',
  async (_case, patch) => {
    const original = makeTransaction(403, {
      id: 'protected-original',
      type: 'expense',
      amountMinor: 100,
      accountId: 'account-bank',
      currencyCode: 'SAR',
      categoryId: 'food',
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'synced'
    });
    const refund = makeTransaction(404, {
      id: 'protected-refund',
      type: 'refund',
      amountMinor: 50,
      accountId: original.accountId,
      currencyCode: original.currencyCode,
      categoryId: original.categoryId,
      originalTransactionId: original.id,
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'synced'
    });
    const service = createMockCoreFinanceService(
      new CoreFinanceRepository({
        accounts: fixtureAccounts,
        categories: fixtureCategories,
        transactions: [original, refund]
      })
    );

    await expect(
      service.updateTransaction(original.id, {
        ...transactionInput(original),
        ...patch
      })
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(service.getTransaction(original.id)).resolves.toEqual(
      original
    );
  }
);

it('rejects turning an expense into a self-linked refund', async () => {
  const original = makeTransaction(405, {
    id: 'self-refund-original',
    type: 'expense',
    amountMinor: 100,
    accountId: 'account-bank',
    currencyCode: 'SAR',
    categoryId: 'food'
  });
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: [original]
    })
  );

  await expect(
    service.updateTransaction(original.id, {
      ...transactionInput(original),
      type: 'refund',
      originalTransactionId: original.id
    })
  ).rejects.toMatchObject({ code: 'validation' });
});

it('rejects refunds of reversed expenses and restores capacity after a refund reversal', async () => {
  const original = makeTransaction(406, {
    id: 'reversal-original',
    type: 'expense',
    amountMinor: 100,
    accountId: 'account-bank',
    currencyCode: 'SAR',
    categoryId: 'food'
  });
  const refund = makeTransaction(407, {
    id: 'reversed-refund',
    type: 'refund',
    amountMinor: 100,
    accountId: original.accountId,
    currencyCode: original.currencyCode,
    categoryId: original.categoryId,
    originalTransactionId: original.id
  });
  const refundReversal = makeTransaction(408, {
    id: 'refund-reversal',
    type: 'reversal',
    amountMinor: refund.amountMinor,
    accountId: refund.accountId,
    currencyCode: refund.currencyCode,
    categoryId: refund.categoryId,
    originalTransactionId: refund.id
  });
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: [original, refund, refundReversal]
    })
  );

  await expect(service.getRemainingRefundableMinor(original.id)).resolves.toBe(
    100
  );
  await expect(
    service.createTransaction({
      type: 'refund',
      amountMinor: 100,
      currencyCode: original.currencyCode,
      accountId: original.accountId,
      categoryId: original.categoryId,
      title: 'Replacement refund',
      occurredAt: at,
      originalTransactionId: original.id
    })
  ).resolves.toMatchObject({ value: { type: 'refund', amountMinor: 100 } });

  const expenseReversal = makeTransaction(409, {
    id: 'expense-reversal',
    type: 'reversal',
    amountMinor: original.amountMinor,
    accountId: original.accountId,
    currencyCode: original.currencyCode,
    categoryId: original.categoryId,
    originalTransactionId: original.id
  });
  const reversedService = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: [original, expenseReversal]
    })
  );
  await expect(
    reversedService.getRemainingRefundableMinor(original.id)
  ).resolves.toBe(0);
  await expect(
    reversedService.createTransaction({
      type: 'refund',
      amountMinor: 1,
      currencyCode: original.currencyCode,
      accountId: original.accountId,
      categoryId: original.categoryId,
      title: 'Invalid reversed refund',
      occurredAt: at,
      originalTransactionId: original.id
    })
  ).rejects.toMatchObject({ code: 'validation' });
});

it.each([
  ['categoryless', null, fixtureCategories],
  [
    'archived-category',
    'food',
    fixtureCategories.map((category) =>
      category.id === 'food'
        ? { ...category, status: 'archived' as const }
        : category
    )
  ]
] as const)(
  'allows a bounded refund of an eligible %s original',
  async (_case, categoryId, categories) => {
    const original = makeTransaction(410, {
      id: `eligible-${_case}-original`,
      type: 'expense',
      amountMinor: 100,
      accountId: 'account-bank',
      currencyCode: 'SAR',
      categoryId
    });
    const service = createMockCoreFinanceService(
      new CoreFinanceRepository({
        accounts: fixtureAccounts,
        categories: [...categories],
        transactions: [original]
      })
    );

    await expect(
      service.createTransaction({
        type: 'refund',
        amountMinor: 50,
        currencyCode: original.currencyCode,
        accountId: original.accountId,
        categoryId,
        title: 'Eligible refund',
        occurredAt: at,
        originalTransactionId: original.id
      })
    ).resolves.toMatchObject({
      value: { type: 'refund', categoryId, amountMinor: 50 }
    });
  }
);

it('rejects a missing payoff operation identity without writing', async () => {
  const service = payoffService();
  await expect(
    service.createCardPayoff(
      {
        fundingAccountId: bank.id,
        cardAccountId: card.id,
        amountMinor: 1_000,
        currencyCode: 'SAR',
        occurredAt: at,
        title: 'Invalid payoff'
      },
      ''
    )
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    service.listTransactions(emptyTransactionFilters)
  ).resolves.toMatchObject({ total: 0 });
});

it('rejects replay of an operation owned by a non-payoff transaction', async () => {
  const service = payoffService();
  await service.createTransaction(
    {
      type: 'expense',
      amountMinor: 100,
      currencyCode: 'SAR',
      accountId: bank.id,
      categoryId: 'food',
      title: 'Expense',
      occurredAt: at
    },
    'shared-operation'
  );

  await expect(
    service.createCardPayoff(
      {
        fundingAccountId: bank.id,
        cardAccountId: card.id,
        amountMinor: 1_000,
        currencyCode: 'SAR',
        occurredAt: at,
        title: 'Invalid replay'
      },
      'shared-operation'
    )
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    service.listTransactions(emptyTransactionFilters)
  ).resolves.toMatchObject({ total: 1 });
});

it.each([
  ['account mismatch', { accountId: 'account-wallet', currencyCode: 'SAR' }],
  ['currency mismatch', { accountId: 'account-bank', currencyCode: 'AED' }]
])(
  'rejects a refund with an original %s without mutation',
  async (_case, patch) => {
    const original = makeTransaction(402, {
      id: 'refund-boundary-original',
      type: 'expense',
      amountMinor: 10_000,
      accountId: 'account-bank',
      currencyCode: 'SAR',
      categoryId: 'food',
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'synced'
    });
    const service = createMockCoreFinanceService(
      new CoreFinanceRepository({
        accounts: fixtureAccounts,
        categories: fixtureCategories,
        transactions: [original]
      })
    );

    await expect(
      service.createTransaction({
        type: 'refund',
        amountMinor: 100,
        categoryId: original.categoryId,
        title: 'Invalid refund',
        occurredAt: at,
        originalTransactionId: original.id,
        ...patch
      })
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      service.listTransactions(emptyTransactionFilters)
    ).resolves.toMatchObject({ total: 1 });
  }
);

it('creates one balanced retry-safe card payoff with no income or expense', async () => {
  const service = payoffService();
  const input = {
    fundingAccountId: bank.id,
    cardAccountId: card.id,
    amountMinor: 20_000,
    currencyCode: 'SAR',
    occurredAt: at,
    title: 'Card payoff'
  };
  const first = await service.createCardPayoff(input, 'payoff-operation');
  const replay = await service.createCardPayoff(input, 'payoff-operation');
  const balances = new Map(
    (await service.listAccountBalances()).map((item) => [
      item.accountId,
      item.balanceMinor
    ])
  );
  const summary = await service.getHomeSummary('SAR');

  expect(first.value).toMatchObject({
    type: 'transfer',
    transferPurpose: 'card_payoff',
    categoryId: null,
    amountMinor: 20_000
  });
  expect(replay.value.id).toBe(first.value.id);
  expect(first.affectedScopes).toEqual(
    expect.arrayContaining([
      `accounts.detail.${bank.id}`,
      `accounts.detail.${card.id}`,
      `transactions.detail.${first.value.id}`,
      'reports.live',
      'assistant.context'
    ])
  );
  expect(balances.get(bank.id)).toBe(80_000);
  expect(balances.get(card.id)).toBe(-12_000);
  expect(summary).toMatchObject({
    periodIncomeMinor: 0,
    periodExpenseMinor: 0
  });
});

it('rejects a payoff when a persisted funding balance is unsafe', async () => {
  const unsafeBank = {
    ...bank,
    openingBalanceMinor: Number.MAX_SAFE_INTEGER
  };
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: [unsafeBank, card],
      categories: fixtureCategories,
      transactions: [
        makeTransaction(999, {
          id: 'unsafe-balance-income',
          type: 'income',
          accountId: unsafeBank.id,
          categoryId: 'salary',
          amountMinor: 1
        })
      ]
    })
  );

  await expect(
    service.createCardPayoff(
      {
        fundingAccountId: unsafeBank.id,
        cardAccountId: card.id,
        amountMinor: 1,
        currencyCode: 'SAR',
        occurredAt: at,
        title: 'Unsafe balance payoff'
      },
      'unsafe-balance-payoff'
    )
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    service.listTransactions(emptyTransactionFilters)
  ).resolves.toMatchObject({ total: 1 });
});

it.each([
  ['funding account', { fundingAccountId: 'other-funding' }],
  ['card account', { cardAccountId: 'other-card' }],
  ['amount', { amountMinor: 19_999 }],
  ['currency', { currencyCode: 'AED' }],
  ['occurrence time', { occurredAt: at + 1 }],
  ['title', { title: 'Different payoff' }],
  ['notes', { notes: 'Different notes' }]
])(
  'rejects a reused payoff operation with different %s',
  async (_case, patch) => {
    const service = payoffService();
    const input = {
      fundingAccountId: bank.id,
      cardAccountId: card.id,
      amountMinor: 20_000,
      currencyCode: 'SAR',
      occurredAt: at,
      title: 'Card payoff',
      notes: null
    };
    await service.createCardPayoff(input, `mismatch-${_case}`);

    await expect(
      service.createCardPayoff({ ...input, ...patch }, `mismatch-${_case}`)
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      service.listTransactions(emptyTransactionFilters)
    ).resolves.toMatchObject({ total: 1 });
  }
);

it.each([
  ['zero', { amountMinor: 0 }],
  ['negative', { amountMinor: -1 }],
  ['unsafe amount', { amountMinor: Number.MAX_SAFE_INTEGER + 1 }],
  ['same account', { cardAccountId: bank.id }],
  ['currency mismatch', { currencyCode: 'AED' }],
  ['above funding balance', { amountMinor: 100_001 }],
  ['above card debt', { amountMinor: 32_001 }]
])('rejects an invalid %s payoff without writing', async (_case, patch) => {
  const service = payoffService();
  await expect(
    service.createCardPayoff(
      {
        fundingAccountId: bank.id,
        cardAccountId: card.id,
        amountMinor: 1_000,
        currencyCode: 'SAR',
        occurredAt: at,
        title: 'Invalid payoff',
        ...patch
      },
      `invalid-${_case}`
    )
  ).rejects.toMatchObject({ code: 'validation' });
  await expect(
    service.listTransactions(emptyTransactionFilters)
  ).resolves.toMatchObject({ total: 0 });
});

it.each([
  {
    caseName: 'non-card destination',
    cardAccount: { ...card, type: 'bank' as const },
    fundingAccount: bank
  },
  {
    caseName: 'zero card balance',
    cardAccount: { ...card, openingBalanceMinor: 0 },
    fundingAccount: bank
  },
  {
    caseName: 'positive card balance',
    cardAccount: { ...card, openingBalanceMinor: 1 },
    fundingAccount: bank
  },
  {
    caseName: 'inactive funding account',
    cardAccount: card,
    fundingAccount: { ...bank, status: 'archived' as const }
  },
  {
    caseName: 'inactive card account',
    cardAccount: { ...card, status: 'archived' as const },
    fundingAccount: bank
  }
])(
  'rejects a payoff with a $caseName without writing',
  async ({ caseName, cardAccount, fundingAccount }) => {
    const service = payoffService([fundingAccount, cardAccount]);
    await expect(
      service.createCardPayoff(
        {
          fundingAccountId: fundingAccount.id,
          cardAccountId: cardAccount.id,
          amountMinor: 1_000,
          currencyCode: 'SAR',
          occurredAt: at,
          title: 'Invalid payoff'
        },
        `invalid-account-${caseName}`
      )
    ).rejects.toMatchObject({
      code: expect.stringMatching(/validation|archived/)
    });
    await expect(
      service.listTransactions(emptyTransactionFilters)
    ).resolves.toMatchObject({ total: 0 });
  }
);
