import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { emptyTransactionFilters } from '@/domain/core-finance';
import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { translate, translateDynamic } from '@/localization/i18n';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { AccountDetailScreen } from './AccountDetailScreen';
import { usePreferenceStore } from '@/state/preferences';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }
}));

it('hides the saved minimum payment when financial privacy is enabled', () => {
  usePreferenceStore.setState({ hideBalances: true });
  const account = { ...fixtureAccounts[3], minimumPaymentMinor: 12_345 };
  const rendered = renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []]
  ]);
  expect(screen.queryByText(/123[.,]45/)).toBeNull();
  rendered.unmount();
  usePreferenceStore.setState({ hideBalances: false });
});

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

it('shows card terms and calculates an integer-safe payoff offline', () => {
  const account = {
    ...fixtureAccounts[3],
    statementDay: 7,
    paymentDueDay: 21,
    monthlyInterestRateBasisPoints: 100,
    minimumPaymentMinor: 3_000,
  };
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []],
  ]);

  expect(screen.getByText(translate('coreFinance.accounts.setup.statementDay'))).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.accounts.setup.dueDay'))).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText(translate('coreFinance.accounts.payoff.balance')), '100');
  fireEvent.changeText(screen.getByLabelText(translate('coreFinance.accounts.payoff.rateBasisPoints')), '100');
  fireEvent.changeText(screen.getByLabelText(translate('coreFinance.accounts.payoff.payment')), '30');
  fireEvent.press(screen.getByText(translate('coreFinance.accounts.payoff.calculate')));

  expect(
    screen.getByText(
      translateDynamic('coreFinance.accounts.payoff.months', { months: 4 }),
    ),
  ).toBeTruthy();
});
