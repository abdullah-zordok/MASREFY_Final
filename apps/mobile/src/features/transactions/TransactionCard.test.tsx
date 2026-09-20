import React from 'react';

import { elevation } from '@/design-system/tokens';
import { renderWithProviders } from '@/test-utils/render';
import { fixtureTransactions } from '@/test-utils/core-finance-fixtures';
import { TransactionCard } from './TransactionCard';

const transaction = fixtureTransactions[0];

function renderTransactionCard(groupedPosition?: 'only') {
  return renderWithProviders(
    <TransactionCard
      accountName="Main account"
      groupedPosition={groupedPosition}
      hidden={false}
      largeText={false}
      testIDPrefix="home"
      transaction={transaction}
    />
  );
}

describe('TransactionCard surface hierarchy', () => {
  it('elevates a standalone home transaction card', () => {
    const screen = renderTransactionCard();

    expect(
      screen.getByTestId(`home-transaction-row-${transaction.id}`)
    ).toHaveStyle({ shadowOpacity: elevation.card.shadowOpacity });
  });

  it('keeps a grouped transaction row flat', () => {
    const screen = renderTransactionCard('only');

    expect(
      screen.getByTestId(`home-transaction-row-${transaction.id}`)
    ).not.toHaveStyle({ shadowOpacity: elevation.card.shadowOpacity });
  });
});
