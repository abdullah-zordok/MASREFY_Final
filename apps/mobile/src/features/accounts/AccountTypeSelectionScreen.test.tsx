import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { translate } from '@/localization/i18n';
import { elevation } from '@/design-system/tokens';
import { renderWithProviders } from '@/test-utils/render';
import { AccountTypeSelectionScreen } from './AccountTypeSelectionScreen';
import NewAccountRoute from '../../../app/accounts/new';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn()
  },
  useLocalSearchParams: jest.fn(() => ({}))
}));

describe('AccountTypeSelectionScreen', () => {
  it('renders all account type cards and triggers onSelectType', () => {
    const onSelectType = jest.fn();
    const onClose = jest.fn();

    renderWithProviders(
      <AccountTypeSelectionScreen
        onSelectType={onSelectType}
        onClose={onClose}
      />
    );

    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.title'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.subtitle'))
    ).toBeTruthy();

    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.bank'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.credit_card'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.cash'))
    ).toBeTruthy();
    expect(
      screen.queryByText(translate('coreFinance.accounts.typeSelect.wallet'))
    ).toBeNull();
    expect(
      screen.queryByText(translate('coreFinance.accounts.typeSelect.savings'))
    ).toBeNull();
    expect(screen.getByTestId('account-type-card-bank')).toHaveStyle({
      shadowOpacity: elevation.card.shadowOpacity
    });

    fireEvent.press(
      screen.getByText(translate('coreFinance.accounts.typeSelect.credit_card'))
    );
    expect(onSelectType).toHaveBeenCalledWith('credit_card');

    fireEvent.press(
      screen.getByLabelText(translate('common.close'))
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates from type selection to account form in NewAccountRoute', () => {
    renderWithProviders(<NewAccountRoute />);

    // Step 1: Account Type Selection is shown first
    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.title'))
    ).toBeTruthy();
    expect(screen.queryByLabelText(translate('coreFinance.accounts.name'))).toBeNull();

    // Step 2: User taps 'Cash' card
    fireEvent.press(
      screen.getByText(translate('coreFinance.accounts.typeSelect.cash'))
    );

    // Form is now shown with Cash preselected
    expect(
      screen.getByLabelText(translate('coreFinance.accounts.name'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.create'))
    ).toBeTruthy();

    // User taps Back to go back to Type Selection
    fireEvent.press(screen.getByLabelText(translate('common.back')));
    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.title'))
    ).toBeTruthy();
  });
});
