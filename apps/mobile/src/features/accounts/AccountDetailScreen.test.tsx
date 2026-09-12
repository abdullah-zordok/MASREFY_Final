import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
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
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { CoreFinanceError } from '@/services/contracts/core-finance-service';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() }
}));

afterEach(() => jest.restoreAllMocks());

it('shows a safe error when the live payoff request is offline', async () => {
  jest
    .spyOn(coreFinanceService, 'calculateCreditCardPayoff')
    .mockRejectedValue(new CoreFinanceError('offline'));
  const account = fixtureAccounts[3];
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []]
  ]);
  fireEvent.changeText(
    screen.getByLabelText(translate('coreFinance.accounts.payoff.balance')),
    '100'
  );
  fireEvent.changeText(
    screen.getByLabelText(
      translate('coreFinance.accounts.payoff.rateBasisPoints')
    ),
    '100'
  );
  fireEvent.changeText(
    screen.getByLabelText(translate('coreFinance.accounts.payoff.payment')),
    '30'
  );
  fireEvent.press(
    screen.getByText(translate('coreFinance.accounts.payoff.calculate'))
  );

  expect(
    await screen.findByText(translate('coreFinance.state.error'))
  ).toBeTruthy();
});

it('hides the saved minimum payment when financial privacy is enabled', () => {
  usePreferenceStore.setState({ hideBalances: true });
  const account = { ...fixtureAccounts[3], minimumPaymentMinor: 12_345 };
  const rendered = renderWithQueryData(
    <AccountDetailScreen id={account.id} />,
    [
      [coreFinanceKeys.account(account.id), account],
      [coreFinanceKeys.accountBalances(true), []]
    ]
  );
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
    screen.getByText(translate('coreFinance.accounts.balanceCurrent'))
  ).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.accounts.edit'))).toBeTruthy();
  expect(
    screen.getByTestId('account-detail-hero').props.accessibilityLabel
  ).toContain(translate('coreFinance.accounts.automaticTrackingEnabled'));
  expect(
    screen.getByText(translate('coreFinance.action.transfer'))
  ).toBeTruthy();
  expect(screen.getByTestId('account-detail-masthead-title')).toHaveTextContent(
    account.name
  );
  expect(
    screen.queryByLabelText(translate('appShell.navigation.back'))
  ).toBeNull();
  expect(screen.getByTestId('account-detail-masthead')).toHaveStyle({
    paddingBottom: 8,
    paddingTop: 8
  });
  expect(screen.getByTestId('account-detail-hero')).toHaveStyle({
    borderRadius: 16,
    marginBottom: 14,
    minHeight: 129,
    padding: 20
  });
  expect(screen.queryByTestId('account-detail-metadata')).toBeNull();
  expect(screen.queryByTestId('account-row')).toBeNull();
});

it('keeps the minus sign on a negative account balance', () => {
  const account = fixtureAccounts[0];
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [
      coreFinanceKeys.accountBalances(true),
      [
        {
          accountId: account.id,
          balanceMinor: -12_345,
          currencyCode: account.currencyCode
        }
      ]
    ]
  ]);

  expect(screen.getByTestId('financial-pulse-statement')).toHaveTextContent(
    '-123.45 SAR'
  );
});

it('shows when automatic tracking is disabled for the account', () => {
  const account = { ...fixtureAccounts[0], automaticTrackingEnabled: false };
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []]
  ]);
  expect(
    screen.getByTestId('account-detail-hero').props.accessibilityLabel
  ).toContain(translate('coreFinance.accounts.automaticTrackingDisabled'));
});

it('keeps closed accounts read-only', () => {
  const account = { ...fixtureAccounts[0], status: 'closed' as const };
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []]
  ]);

  expect(screen.queryByText(translate('coreFinance.accounts.edit'))).toBeNull();
  expect(
    screen.queryByText(translate('coreFinance.accounts.archive'))
  ).toBeNull();
  expect(
    screen.queryByText(translate('coreFinance.accounts.restore'))
  ).toBeNull();
  expect(
    screen.queryByText(translate('coreFinance.action.transfer'))
  ).toBeNull();
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

it('reuses the RTL transaction card for recent account activity', () => {
  jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
  usePreferenceStore.setState({ direction: 'rtl', locale: 'ar' });
  const account = fixtureAccounts[0];
  const transaction = fixtureTransactions[0];
  const rendered = renderWithQueryData(
    <AccountDetailScreen id={account.id} />,
    [
      [coreFinanceKeys.account(account.id), account],
      [coreFinanceKeys.accountBalances(true), []],
      [
        coreFinanceKeys.transactions({
          ...emptyTransactionFilters,
          accountIds: [account.id]
        }),
        { items: [transaction], nextCursor: null, total: 1 }
      ]
    ]
  );

  expect(
    screen.getByTestId(`account-transaction-row-${transaction.id}`)
  ).toHaveStyle({ direction: 'ltr', flexDirection: 'row-reverse' });
  expect(
    screen.getByTestId(`account-transaction-amount-${transaction.id}`)
  ).toHaveStyle({
    alignItems: 'flex-start',
    flexShrink: 0,
    maxWidth: '45%'
  });
  expect(screen.getByTestId('account-detail-activity-header')).toHaveStyle({
    direction: 'ltr',
    flexDirection: 'row-reverse'
  });
  expect(screen.getByTestId('account-detail-activity-card')).toHaveStyle({
    borderRadius: 16,
    overflow: 'hidden'
  });

  rendered.unmount();
  usePreferenceStore.setState({ direction: 'ltr', locale: 'en' });
});

it('shows card terms and calculates an integer-safe payoff', async () => {
  const account = {
    ...fixtureAccounts[3],
    statementDay: 7,
    paymentDueDay: 21,
    monthlyInterestRateBasisPoints: 100,
    minimumPaymentMinor: 3_000
  };
  renderWithQueryData(<AccountDetailScreen id={account.id} />, [
    [coreFinanceKeys.account(account.id), account],
    [coreFinanceKeys.accountBalances(true), []]
  ]);

  expect(
    screen.getByText(translate('coreFinance.accounts.setup.statementDay'))
  ).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.accounts.setup.dueDay'))
  ).toBeTruthy();
  fireEvent.changeText(
    screen.getByLabelText(translate('coreFinance.accounts.payoff.balance')),
    '100'
  );
  fireEvent.changeText(
    screen.getByLabelText(
      translate('coreFinance.accounts.payoff.rateBasisPoints')
    ),
    '100'
  );
  fireEvent.changeText(
    screen.getByLabelText(translate('coreFinance.accounts.payoff.payment')),
    '30'
  );
  fireEvent.press(
    screen.getByText(translate('coreFinance.accounts.payoff.calculate'))
  );

  await screen.findByText(
    translateDynamic('coreFinance.accounts.payoff.months', { months: 4 })
  );
});
