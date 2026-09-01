import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import {
  fixtureAccounts,
  fixtureCategories,
  fixtureTransactions
} from '@/test-utils/core-finance-fixtures';
import { renderWithProviders, renderWithQueryData } from '@/test-utils/render';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() }
}));

beforeEach(() => usePreferenceStore.setState({ hideBalances: false }));

it('offers retry when loading the transaction fails', async () => {
  jest
    .spyOn(coreFinanceService, 'getTransaction')
    .mockRejectedValueOnce(new Error('offline'));

  renderWithProviders(<TransactionDetailScreen id="missing" />);

  expect(
    await screen.findByText(translate('coreFinance.state.error'))
  ).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.action.retry'))).toBeTruthy();
});

it('shows financial fields, source, status, and eligible actions', () => {
  usePreferenceStore.setState({ hideBalances: true });
  const item = fixtureTransactions[0];
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);
  expect(screen.getByText(item.title)).toBeTruthy();
  expect(
    screen.getByText(translate(`coreFinance.source.${item.source}` as never))
  ).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.transaction.delete'))
  ).toBeTruthy();
  expect(
    screen.getByText(
      fixtureAccounts.find((account) => account.id === item.accountId)!.name
    )
  ).toBeTruthy();
  expect(screen.queryByText(item.accountId)).toBeNull();
  expect(screen.getByText('•••• SAR')).toBeTruthy();
  expect(
    screen.getByText(translate('support.report.transaction'))
  ).toBeTruthy();
  expect(screen.queryByText('support.report.transaction')).toBeNull();
  expect(
    screen.getByLabelText(translate('coreFinance.transaction.details'))
  ).toBeTruthy();
});

it('requires named confirmation before deleting a transaction', () => {
  const item = fixtureTransactions[0];
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  const remove = jest.spyOn(coreFinanceService, 'deleteTransaction');
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);

  fireEvent.press(
    screen.getByText(translate('coreFinance.transaction.delete'))
  );
  expect(alert).toHaveBeenCalledWith(
    translate('coreFinance.transaction.delete'),
    expect.stringContaining(item.title),
    expect.any(Array)
  );
  expect(remove).not.toHaveBeenCalled();
});

it('restores the undo window from a persisted deleted transaction', () => {
  const item = {
    ...fixtureTransactions[0],
    status: 'deleted' as const,
    deletedAt: Date.now(),
    undoExpiresAt: Date.now() + 20_000
  };
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);
  expect(
    screen.getByText(translate('coreFinance.transaction.deleted'))
  ).toBeTruthy();
  expect(screen.getByLabelText(translate('coreFinance.undo'))).toBeTruthy();
  expect(
    screen.queryByText(translate('coreFinance.transaction.delete'))
  ).toBeNull();
});

it('opens the linked refund flow for an eligible expense', () => {
  const item = {
    ...fixtureTransactions[0],
    id: 'eligible-expense',
    type: 'expense' as const,
    status: 'posted' as const,
    reviewStatus: 'none' as const,
    syncStatus: 'pending' as const,
    originalTransactionId: null
  };
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.refundable(item.id), item.amountMinor],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);

  fireEvent.press(screen.getByLabelText(translate('coreFinance.type.refund')));
  expect(router.push).toHaveBeenCalledWith(
    `/(tabs)/add?type=refund&originalTransactionId=${item.id}`
  );
});

it('hides the refund action when the expense is fully refunded', () => {
  const item = {
    ...fixtureTransactions[0],
    id: 'fully-refunded-expense',
    type: 'expense' as const,
    status: 'posted' as const,
    reviewStatus: 'none' as const,
    syncStatus: 'synced' as const
  };
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.refundable(item.id), 0],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);

  expect(
    screen.queryByLabelText(translate('coreFinance.type.refund'))
  ).toBeNull();
});

it('opens the original transaction from a refund relationship row', () => {
  const original = {
    ...fixtureTransactions[1],
    id: 'transaction-9',
    title: 'Original card purchase'
  };
  const item = {
    ...fixtureTransactions[0],
    id: 'linked-refund',
    type: 'refund' as const,
    originalTransactionId: 'transaction-9'
  };
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.transaction(original.id), original],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);

  fireEvent.press(screen.getByText(original.title));
  expect(router.push).toHaveBeenCalledWith(
    `/transactions/${item.originalTransactionId}`
  );
});

it.each([
  ['non-expense', { type: 'income' as const }],
  ['non-posted', { status: 'deleted' as const, deletedAt: Date.now() }],
  ['review-required', { reviewStatus: 'required' as const }],
  ['conflicted', { syncStatus: 'conflict' as const }]
])('hides the refund action for a %s transaction', (_case, override) => {
  const item = {
    ...fixtureTransactions[0],
    type: 'expense' as const,
    status: 'posted' as const,
    reviewStatus: 'none' as const,
    syncStatus: 'synced' as const,
    ...override
  };
  renderWithQueryData(<TransactionDetailScreen id={item.id} />, [
    [coreFinanceKeys.transaction(item.id), item],
    [coreFinanceKeys.accounts(true), fixtureAccounts],
    [coreFinanceKeys.categories(true), fixtureCategories]
  ]);

  expect(
    screen.queryByLabelText(translate('coreFinance.type.refund'))
  ).toBeNull();
});
