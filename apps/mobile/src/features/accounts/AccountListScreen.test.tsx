import React from 'react';
import { PixelRatio } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

import { lightThemeColors } from '@/design-system/tokens';
import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { changeLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { AccountListScreen } from './AccountListScreen';

it('renders active, archived, duplicate, and add-account states', () => {
  const accounts = [
    ...fixtureAccounts,
    {
      ...fixtureAccounts[0],
      id: 'closed-account',
      name: 'Closed account',
      status: 'closed' as const
    }
  ];
  renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), accounts],
    [
      coreFinanceKeys.accountBalances(true),
      accounts.map((account) => ({
        accountId: account.id,
        balanceMinor: account.openingBalanceMinor,
        currencyCode: account.currencyCode
      }))
    ]
  ]);
  expect(screen.getByText(fixtureAccounts[0].name)).toBeTruthy();
  expect(screen.getByText(translate('appShell.shell.accounts'))).toHaveStyle({
    textAlign: 'right',
    width: '100%'
  });
  expect(
    screen.queryByLabelText(translate('appShell.navigation.back'))
  ).toBeNull();
  expect(screen.getByText('Closed account')).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.accounts.archivedSection'))
  ).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.accounts.closedSection'))
  ).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.accounts.add'))).toBeTruthy();
  const rows = screen.getAllByTestId('account-row');
  expect(rows[0]).toHaveStyle({
    borderRadius: 20,
    minHeight: 84
  });
  expect(screen.getByTestId('accounts-screen-masthead')).toHaveStyle({
    backgroundColor: '#FFFFFF',
    flexDirection: 'row-reverse',
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 8
  });
  expect(screen.queryByTestId('accounts-balance-summary')).toBeNull();
  expect(screen.getByTestId('accounts-total-card')).toBeTruthy();
  expect(screen.getByTestId('accounts-list-search')).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.accounts.activeSection'))
  ).toBeTruthy();
});

it('aligns account search input for Arabic RTL', () => {
  usePreferenceStore.setState({ direction: 'rtl', locale: 'ar' });
  const rendered = renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.accountBalances(true), []]
  ]);

  expect(screen.getByTestId('accounts-list-search')).toHaveStyle({
    textAlign: 'right',
    writingDirection: 'rtl'
  });

  rendered.unmount();
  usePreferenceStore.setState({ direction: 'ltr', locale: 'en' });
});

it('keeps the total and search controls above the active account cards', () => {
  changeLocale('en');
  usePreferenceStore.setState({
    baseCurrencyCode: 'SAR',
    direction: 'ltr',
    locale: 'en'
  });
  renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.accountBalances(true), []],
    [
      coreFinanceKeys.home('SAR'),
      {
        totalBalanceMinor: 4_146_924,
        currencyCode: 'SAR',
        isEstimated: false,
        components: [],
        excludedAccountIds: [],
        periodIncomeMinor: 0,
        periodExpenseMinor: 0,
        activeAccountCount: 3,
        recentTransactions: [],
        reviewCount: 0,
        pendingSyncCount: 0,
        dataState: 'ready'
      }
    ]
  ]);

  expect(screen.getByTestId('accounts-total-card')).toHaveStyle({
    backgroundColor: lightThemeColors.surfaces.financialHero,
    borderRadius: 20,
    minHeight: 129
  });
  expect(screen.getByText('Total balances')).toBeTruthy();
  expect(screen.getByText('Other currencies are not included')).toBeTruthy();
  expect(screen.getByTestId('accounts-list-search')).toHaveStyle({
    minHeight: 52
  });
});

it('keeps add account available for an empty list and empty search result', () => {
  const empty = renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), []],
    [coreFinanceKeys.accountBalances(true), []]
  ]);

  expect(
    screen.getByLabelText(translate('coreFinance.accounts.add'))
  ).toBeTruthy();
  empty.unmount();

  renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.accountBalances(true), []]
  ]);
  fireEvent.changeText(screen.getByTestId('accounts-list-search'), 'missing');

  expect(
    screen.getByText(translate('coreFinance.accounts.noSearchResults'))
  ).toBeTruthy();
  expect(
    screen.getByLabelText(translate('coreFinance.accounts.add'))
  ).toBeTruthy();
});

it('clears account search without manual text deletion', () => {
  renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.accountBalances(true), []]
  ]);
  fireEvent.changeText(screen.getByTestId('accounts-list-search'), 'missing');

  fireEvent.press(screen.getByLabelText(translate('common.clearSearch')));

  expect(screen.getByText(fixtureAccounts[0].name)).toBeTruthy();
});

it('stacks the total card at large text sizes', () => {
  const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
  renderWithQueryData(<AccountListScreen />, [
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.accountBalances(true), []]
  ]);

  expect(screen.getByTestId('accounts-total-card')).toHaveStyle({
    flexDirection: 'column'
  });
  fontScale.mockRestore();
});
