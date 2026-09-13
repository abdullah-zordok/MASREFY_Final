import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { changeLocale, translate } from '@/localization/i18n';
import { useCoreFinanceViewState } from '@/state/core-finance-view-state';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';
import { renderWithQueryData } from '@/test-utils/render';
import { AccountScopeSheet } from './AccountScopeSheet';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const seed = [
  [coreFinanceKeys.accounts(true), fixtureAccounts],
  [coreFinanceKeys.accountBalances(true), []]
] as const;

beforeEach(() => {
  changeLocale('en');
  useCoreFinanceViewState.getState().clearFilters();
  useCoreFinanceViewState.getState().selectAccount(null);
  jest.mocked(router.push).mockClear();
});

it('offers All Accounts plus active accounts and hides archived ones', () => {
  renderWithQueryData(
    <AccountScopeSheet visible onDismiss={jest.fn()} />,
    seed
  );

  expect(screen.getByTestId('account-scope-sheet')).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.home.allAccounts'))
  ).toBeTruthy();
  expect(screen.getAllByText('Wallet')).toHaveLength(2);
  expect(screen.getByText('Daily account')).toBeTruthy();
  expect(screen.queryByText('Archived credit card')).toBeNull();
});

it('uses a grouped account list without search and with quiet footer actions', () => {
  renderWithQueryData(
    <AccountScopeSheet visible onDismiss={jest.fn()} />,
    seed
  );

  expect(screen.queryByTestId('account-search-field')).toBeNull();
  expect(screen.queryByTestId('account-search-input')).toBeNull();
  expect(screen.getByTestId('account-scope-all')).toHaveStyle({
    minHeight: 56
  });
  const rows = screen.getAllByTestId('account-row');
  expect(rows[0]).toHaveStyle({
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0
  });
  expect(rows.at(-1)).toHaveStyle({
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0
  });
  expect(screen.getByTestId('account-scope-manage-accounts')).toHaveStyle({
    backgroundColor: 'transparent',
    borderWidth: 0,
    minHeight: 44
  });
  expect(screen.getByTestId('account-scope-cancel-button')).toHaveStyle({
    backgroundColor: 'transparent',
    minHeight: 44
  });
});

it('picks a specific account into the shared store and dismisses', () => {
  const onDismiss = jest.fn();
  renderWithQueryData(
    <AccountScopeSheet visible onDismiss={onDismiss} />,
    seed
  );

  fireEvent.press(
    screen.getByLabelText('Wallet, Wallet, Balance unavailable')
  );

  expect(useCoreFinanceViewState.getState().selectedAccountId).toBe(
    'account-wallet'
  );
  expect(onDismiss).toHaveBeenCalled();
});

it('selecting All Accounts clears the shared scope and dismisses', () => {
  useCoreFinanceViewState.getState().selectAccount('account-wallet');
  const onDismiss = jest.fn();
  renderWithQueryData(
    <AccountScopeSheet visible onDismiss={onDismiss} />,
    seed
  );

  fireEvent.press(screen.getByTestId('account-scope-all'));

  expect(useCoreFinanceViewState.getState().selectedAccountId).toBe(null);
  expect(onDismiss).toHaveBeenCalled();
});

it('marks the current selection and allows manage accounts navigation and cancel', () => {
  useCoreFinanceViewState.getState().selectAccount('account-wallet');
  const onDismiss = jest.fn();
  renderWithQueryData(
    <AccountScopeSheet visible onDismiss={onDismiss} />,
    seed
  );

  const walletRow = screen
    .getAllByTestId('account-row')
    .find((row) => within(row).queryAllByText('Wallet').length > 0)!;
  expect(walletRow).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ selected: true })
  );

  // Manage accounts navigation
  fireEvent.press(
    screen.getByText(translate('coreFinance.home.manageAccounts'))
  );
  expect(router.push).toHaveBeenCalledWith('/accounts');
  expect(onDismiss).toHaveBeenCalled();

  // Verify Add Account and How balances work are removed from picker
  expect(screen.queryByText(translate('coreFinance.accounts.add'))).toBeNull();
  expect(
    screen.queryByText(translate('coreFinance.home.howBalancesWork'))
  ).toBeNull();
});

it('cancel button dismisses the sheet without changing selection', () => {
  const onDismiss = jest.fn();
  renderWithQueryData(
    <AccountScopeSheet visible onDismiss={onDismiss} />,
    seed
  );

  fireEvent.press(screen.getByTestId('account-scope-cancel-button'));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('renders nothing when hidden', () => {
  renderWithQueryData(
    <AccountScopeSheet visible={false} onDismiss={jest.fn()} />,
    seed
  );

  expect(screen.queryByTestId('account-scope-sheet')).toBeNull();
});
