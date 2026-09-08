import React from 'react';
import { screen } from '@testing-library/react-native';

import { radius } from '@/design-system/tokens';
import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
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
  expect(screen.getByText('Closed account')).toBeTruthy();
  expect(
    screen.getByText(translate('coreFinance.accounts.closedSection'))
  ).toBeTruthy();
  expect(screen.getByText(translate('coreFinance.accounts.add'))).toBeTruthy();
  const rows = screen.getAllByTestId('account-row');
  expect(rows[0]).toHaveStyle({ borderTopLeftRadius: radius.lg });
  expect(rows[1]).toHaveStyle({ borderTopLeftRadius: 0 });
});
