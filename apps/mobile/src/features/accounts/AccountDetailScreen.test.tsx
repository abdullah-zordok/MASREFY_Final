import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { emptyTransactionFilters } from '@/domain/core-finance';
import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { AccountDetailScreen } from './AccountDetailScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }
}));

it('shows derived balance and account management actions', () => {
  const account = fixtureAccounts[0];
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [
      coreFinanceKeys.accountBalances(true),
      [
        {
          accountId: account.id,
          balanceMinor: account.openingBalanceMinor,
          currencyCode: account.currencyCode
        }
      ]
    ]
  ]);
  expect(screen.getAllByText(account.name).length).toBeGreaterThan(0);
  expect(
    screen.getByText(translate('coreFinance.accounts.balanceAvailable'))
  ).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.accounts.edit'))).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.accounts.automaticTrackingEnabled'))
  ).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.action.transfer'))
  ).toBeTruthy();
});

it('shows when automatic tracking is disabled for the account', () => {
  const account = { ...fixtureAccounts[0], automaticTrackingEnabled: false };
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []]
  ]);
  expect(
    screen.getByText(translate('coreFinance.accounts.automaticTrackingDisabled'))
  ).toBeTruthy();
});

it('opens account activity directly in edit mode', () => {
  const account = fixtureAccounts[0];
  const transaction = fixtureTransactions[0];
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [
      coreFinanceKeys.accountBalances(true),
      [
        {
          accountId: account.id,
          balanceMinor: account.openingBalanceMinor,
          currencyCode: account.currencyCode
        }
      ]
    ],
    [
      coreFinanceKeys.transactions({
        ...emptyTransactionFilters,
        accountIds: [account.id]
      }),
      { items: [transaction], nextCursor: null, total: 1 }
    ],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);

  fireEvent.press(screen.getByText(transaction.title));
  expect(router.push).toHaveBeenCalledWith(
    `/transactions/${transaction.id}/edit`
  );
});
