import { emptyTransactionFilters } from '@/domain/core-finance';
import { todayPeriod } from '@/features/filters/date-period';
import { CoreFinanceRepository } from '@/storage/core-finance-repository';
import {
  fixtureAccounts,
  fixtureCategories,
  makeTransaction
} from '@/test-utils/core-finance-fixtures';
import { createMockCoreFinanceService } from './mocks/core-finance-service';
import { readHomeTodayActivity } from './home-today-activity';
import type { TransactionPage } from './contracts/core-finance-service';

const now = Date.parse('2026-10-08T20:59:00Z');
const day = todayPeriod(now, { timeZone: 'Asia/Riyadh', monthStartDay: 1 });
const filters = {
  ...emptyTransactionFilters,
  periodStart: day.periodStart,
  periodEnd: day.periodEnd
};

it.each([
  [
    'Asia/Riyadh',
    '2026-10-08T21:30:00Z',
    '2026-10-08T21:00:00Z',
    '2026-10-09T20:59:59.999Z'
  ],
  [
    'America/New_York',
    '2026-03-08T15:00:00Z',
    '2026-03-08T05:00:00Z',
    '2026-03-09T03:59:59.999Z'
  ],
  [
    'America/New_York',
    '2026-11-01T15:00:00Z',
    '2026-11-01T04:00:00Z',
    '2026-11-02T04:59:59.999Z'
  ]
])(
  'uses occurredAt at %s midnight/DST boundaries, independent of delivery time',
  async (timeZone, anchor, start, end) => {
    const period = todayPeriod(Date.parse(anchor), {
      timeZone,
      monthStartDay: 1
    });
    expect(period.periodStart).toBe(Date.parse(start));
    expect(period.periodEnd).toBe(Date.parse(end));
    const transactions = [-1, 0, 1, 2].map((offset, index) =>
      makeTransaction(index + 1, {
        type: 'expense',
        occurredAt:
          offset < 1
            ? Date.parse(start) + offset
            : Date.parse(end) + offset - 1,
        createdAt: Date.parse(anchor),
        status: 'posted',
        reviewStatus: 'none',
        syncStatus: 'synced'
      })
    );
    const service = createMockCoreFinanceService(
      new CoreFinanceRepository({
        accounts: fixtureAccounts,
        categories: fixtureCategories,
        transactions
      })
    );
    const activity = await service.getHomeTodayActivity({
      ...emptyTransactionFilters,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd
    });
    expect(activity.map(({ transaction }) => transaction.id)).toEqual([
      'transaction-3',
      'transaction-2'
    ]);
  }
);

it('returns all committed daily income and expenses across sources without leaking older or pending records', async () => {
  const sources = [
    'manual',
    'voice',
    'automatic',
    'platform_assisted'
  ] as const;
  const transactions = sources.flatMap((source, index) => [
    makeTransaction(index + 1, {
      source,
      type: 'expense',
      occurredAt: now - index,
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'synced'
    }),
    makeTransaction(index + 11, {
      source,
      type: 'income',
      occurredAt: now - index,
      status: 'posted',
      reviewStatus: 'none',
      syncStatus: 'synced'
    })
  ]);
  transactions.push(
    makeTransaction(30, { occurredAt: day.periodStart - 1, createdAt: now }),
    makeTransaction(31, { occurredAt: day.periodEnd + 1 }),
    makeTransaction(32, { occurredAt: now, status: 'pending' }),
    makeTransaction(33, { occurredAt: now, status: 'failed' }),
    makeTransaction(34, { occurredAt: now, status: 'deleted' }),
    makeTransaction(35, {
      occurredAt: now,
      type: 'transfer',
      destinationAccountId: 'account-wallet'
    })
  );
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions
    })
  );
  const activity = await service.getHomeTodayActivity(filters);
  expect(activity).toHaveLength(8);
  expect(activity.filter(({ group }) => group === 'expense')).toHaveLength(4);
  expect(activity.filter(({ group }) => group === 'income')).toHaveLength(4);
  expect(new Set(activity.map(({ transaction }) => transaction.id)).size).toBe(
    8
  );
  expect(activity.map(({ transaction }) => transaction.source)).toEqual(
    expect.arrayContaining(sources)
  );
});

it('reads beyond a hundred daily transactions and preserves distinct repeated statements', async () => {
  const transactions = Array.from({ length: 123 }, (_, index) =>
    makeTransaction(index + 1, {
      title: 'Same statement',
      type: index % 2 ? 'income' : 'expense',
      occurredAt: now - index,
      status: 'posted',
      syncStatus: 'synced',
      reviewStatus: 'none'
    })
  );
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions
    })
  );
  const activity = await service.getHomeTodayActivity(filters);
  expect(activity).toHaveLength(123);
  expect(activity[0].transaction.id).toBe('transaction-1');
  expect(activity[122].transaction.id).toBe('transaction-123');
});

it('continues after an empty filtered API page and keeps only the newest version in the selected account', async () => {
  const committed = makeTransaction(50, {
    amountMinor: 5000,
    title: 'Existing manual expense',
    accountId: 'account-wallet',
    occurredAt: now,
    status: 'posted',
    syncStatus: 'synced',
    reviewStatus: 'none',
    version: 2
  });
  const pages: Record<string, TransactionPage> = {
    first: { items: [], nextCursor: 'second' },
    second: { items: [{ ...committed, version: 1 }, makeTransaction(51, {
      accountId: 'account-bank', occurredAt: now, status: 'posted',
      syncStatus: 'synced', reviewStatus: 'none'
    })], nextCursor: 'third' },
    third: { items: [committed], nextCursor: null }
  };
  const activity = await readHomeTodayActivity({
    filters: { ...filters, accountIds: ['account-wallet'] },
    listTransactions: async (_filters, cursor, pageSize) => {
      if (pageSize !== 100) throw new Error('Unexpected API page size');
      return pages[cursor ?? 'first'];
    },
    readSignedEffect: async () => { throw new Error('Expense needs no detail read'); }
  });
  expect(activity).toHaveLength(1);
  expect(activity[0]).toMatchObject({
    transaction: { id: 'transaction-50', amountMinor: 5000, version: 2 },
    group: 'expense', sign: 'negative'
  });
});

it('rejects a repeated pagination cursor instead of returning an incomplete Today group', async () => {
  await expect(readHomeTodayActivity({
    filters,
    listTransactions: async () => ({ items: [], nextCursor: 'repeated' }),
    readSignedEffect: async () => null
  })).rejects.toMatchObject({ code: 'unknown' });
});

it('does not turn a later-page error into successful partial Today activity', async () => {
  await expect(readHomeTodayActivity({
    filters,
    listTransactions: async (_filters, cursor) => {
      if (cursor) throw new Error('Second page unavailable');
      return { items: [makeTransaction(50, {
        amountMinor: 5000, occurredAt: now, status: 'posted',
        syncStatus: 'synced', reviewStatus: 'none'
      })], nextCursor: 'next-page' };
    },
    readSignedEffect: async () => null
  })).rejects.toThrow('Second page unavailable');
});

it.each([
  ['2026-10-10T20:59:00Z', 1],
  ['2026-10-10T21:01:00Z', 0]
] as const)('places the retained 50 SAR Manual expense on its actual Riyadh day at %s', async (anchor, expectedCount) => {
  // Retained 91213b4 receipt: hash8cda91ee19c3e064, not a new financial write.
  const existingManual = makeTransaction(50, {
    amountMinor: 5000,
    occurredAt: Date.parse('2026-10-10T20:51:01.901+00:00'),
    source: 'manual', type: 'expense', status: 'posted',
    syncStatus: 'synced', reviewStatus: 'none'
  });
  const period = todayPeriod(Date.parse(anchor), {
    timeZone: 'Asia/Riyadh', monthStartDay: 1
  });
  const activity = await readHomeTodayActivity({
    filters: { ...emptyTransactionFilters, periodStart: period.periodStart, periodEnd: period.periodEnd },
    listTransactions: async () => ({ items: [existingManual], nextCursor: null }),
    readSignedEffect: async () => null
  });
  expect(activity).toHaveLength(expectedCount);
  if (expectedCount) expect(activity[0]).toMatchObject({
    transaction: { amountMinor: 5000, occurredAt: 1791665461901 },
    group: 'expense', sign: 'negative'
  });
});

it('classifies refunds and reversals from their financial effect without adding the older original to today', async () => {
  const original = makeTransaction(1, {
    type: 'income',
    occurredAt: day.periodStart - 1,
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced'
  });
  const reversal = makeTransaction(2, {
    type: 'reversal',
    amountMinor: original.amountMinor,
    originalTransactionId: original.id,
    occurredAt: now,
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced'
  });
  const expense = makeTransaction(3, {
    type: 'expense',
    occurredAt: day.periodStart - 2,
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced'
  });
  const refund = makeTransaction(4, {
    type: 'refund',
    amountMinor: 100,
    originalTransactionId: expense.id,
    occurredAt: now,
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced'
  });
  const service = createMockCoreFinanceService(
    new CoreFinanceRepository({
      accounts: fixtureAccounts,
      categories: fixtureCategories,
      transactions: [original, reversal, expense, refund]
    })
  );
  const activity = await service.getHomeTodayActivity(filters);
  expect(activity).toHaveLength(2);
  expect(
    activity.find(({ transaction }) => transaction.id === reversal.id)
  ).toMatchObject({ group: 'expense', sign: 'negative' });
  expect(
    activity.find(({ transaction }) => transaction.id === refund.id)
  ).toMatchObject({ group: 'income', sign: 'positive' });
});
