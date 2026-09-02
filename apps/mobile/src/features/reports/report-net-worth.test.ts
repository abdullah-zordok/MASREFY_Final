import {
  fixtureAccounts,
  makeTransaction
} from '@/test-utils/core-finance-fixtures';
import { buildNetWorthTrend } from './report-net-worth';

test('2026-08-23 net worth trend projects real account effects at each point', () => {
  const day1 = Date.UTC(2026, 7, 1, 12);
  const day2 = Date.UTC(2026, 7, 2, 12);
  const day3 = Date.UTC(2026, 7, 3, 12);
  const account = {
    ...fixtureAccounts[0],
    currencyCode: 'SAR',
    openingBalanceMinor: 1_000
  };
  const transactions = [
    makeTransaction(1, {
      accountId: account.id,
      amountMinor: 100,
      occurredAt: day2,
      type: 'expense'
    }),
    makeTransaction(2, {
      accountId: account.id,
      amountMinor: 300,
      occurredAt: day3,
      type: 'income'
    })
  ];

  expect(
    buildNetWorthTrend({
      accounts: [account],
      accountIds: [account.id],
      currencyCode: 'SAR',
      pointInstants: [day1, day2, day3],
      ratesByAccount: new Map(),
      transactions
    })
  ).toEqual([
    { at: day1, minorUnits: 1_000 },
    { at: day2, minorUnits: 900 },
    { at: day3, minorUnits: 1_200 }
  ]);
});

test('signed card liability reduces net worth and payoff reduces both account balances equally', () => {
  const at = Date.UTC(2026, 7, 9, 12);
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
  const payoff = makeTransaction(20, {
    type: 'transfer',
    transferPurpose: 'card_payoff',
    accountId: bank.id,
    destinationAccountId: card.id,
    categoryId: null,
    amountMinor: 20_000,
    occurredAt: at
  });

  expect(
    buildNetWorthTrend({
      accounts: [bank, card],
      accountIds: [],
      currencyCode: 'SAR',
      pointInstants: [at],
      ratesByAccount: new Map(),
      transactions: [payoff]
    })
  ).toEqual([{ at, minorUnits: 68_000 }]);
});

test('positive credit-card value remains an asset instead of being inferred as debt', () => {
  const at = Date.UTC(2026, 7, 9, 12);
  const card = {
    ...fixtureAccounts[0],
    id: 'card-credit',
    type: 'credit_card' as const,
    currencyCode: 'SAR',
    openingBalanceMinor: 5_000
  };

  expect(
    buildNetWorthTrend({
      accounts: [card],
      accountIds: [],
      currencyCode: 'SAR',
      pointInstants: [at],
      ratesByAccount: new Map(),
      transactions: []
    })
  ).toEqual([{ at, minorUnits: 5_000 }]);
});
