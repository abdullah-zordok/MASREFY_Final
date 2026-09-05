import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';

import type { Account } from '@/domain/core-finance';
import { translate } from '@/localization/i18n';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';
import { renderWithProviders } from '@/test-utils/render';
import { AccountForm } from './AccountForm';
import { usePreferenceStore } from '@/state/preferences';
import { coreFinanceService } from '@/services/mocks/core-finance-service';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() }
}));

afterEach(() => jest.restoreAllMocks());

describe('AccountForm', () => {
  it('validates required name and shows hero card with currency', () => {
    renderWithProviders(<AccountForm initialType="bank" />);

    // Step 2 indicator and title
    expect(screen.getByText(translate('coreFinance.accounts.step2Of2'))).toBeTruthy();
    expect(screen.getByText(translate('coreFinance.accounts.setup.introTitle'))).toBeTruthy();

    // Bank hero card title is present
    expect(screen.getByText(translate('coreFinance.accounts.typeSelect.bank'))).toBeTruthy();

    // Attempt save with empty name
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.create')));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('renders credit card specific fields for credit_card type', () => {
    renderWithProviders(<AccountForm initialType="credit_card" />);

    expect(screen.getByText(translate('coreFinance.accounts.typeSelect.credit_card'))).toBeTruthy();
    expect(screen.getByText(translate('coreFinance.accounts.setup.creditLimit'))).toBeTruthy();
    expect(screen.queryByText(translate('coreFinance.accounts.setup.dueDay'))).toBeNull();
  });

  it('defaults automatic tracking on and submits an explicit opt-out', async () => {
    const create = jest.spyOn(coreFinanceService, 'createAccount').mockResolvedValue({
      value: { ...fixtureAccounts[0], id: 'created-account' },
      affectedScopes: []
    });
    renderWithProviders(<AccountForm initialType="bank" />);

    const toggle = screen.getByLabelText(
      translate('coreFinance.accounts.automaticTracking')
    );
    expect(toggle).toHaveProp('value', true);
    fireEvent(toggle, 'valueChange', false);
    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.name')),
      'Private account'
    );
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.create')));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ automaticTrackingEnabled: false })
      )
    );
  });

  it.each(['SAR', 'AED'] as const)(
    'defaults a new account to the configured %s preference',
    (baseCurrencyCode) => {
      usePreferenceStore.setState({ baseCurrencyCode });
      const rendered = renderWithProviders(<AccountForm initialType="bank" />);

      expect(screen.getByText(baseCurrencyCode)).toBeTruthy();
      rendered.unmount();
      usePreferenceStore.setState({ baseCurrencyCode: 'SAR' });
    }
  );

  it.each([
    ['bank', 'مثال: مصرف الراجحي، حساب الراتب'],
    ['credit_card', 'مثال: بطاقة الأهلي الائتمانية، بطاقة المشتريات'],
    ['cash', 'مثال: المحفظة النقدية، مصروف المنزل']
  ] as const)(
    'exposes the Gulf-neutral %s account example through the labeled field',
    (initialType, placeholder) => {
      usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
      renderWithProviders(<AccountForm initialType={initialType} />);

      expect(
        screen.getByLabelText(translate('coreFinance.accounts.name', 'ar'))
      ).toHaveProp('placeholder', placeholder);
    }
  );

  it('renders streamlined fields for cash type', () => {
    renderWithProviders(<AccountForm initialType="cash" />);

    expect(screen.getByText(translate('coreFinance.accounts.typeSelect.cash'))).toBeTruthy();
    expect(screen.getByText(translate('coreFinance.accounts.name'))).toBeTruthy();
    expect(screen.getByText(translate('coreFinance.accounts.openingBalance'))).toBeTruthy();
    // Bank education tip should not appear in cash flow
    expect(screen.queryByText(translate('coreFinance.accounts.setup.educationTitle'))).toBeNull();
  });

  it('fills edit fields when account data arrives after the first render', async () => {
    function Harness() {
      const [account, setAccount] = useState<Account | undefined>();
      useEffect(() => setAccount(fixtureAccounts[0]), []);
      return <AccountForm account={account} />;
    }

    renderWithProviders(<Harness />);

    await waitFor(() =>
      expect(screen.getByDisplayValue('Daily account')).toBeTruthy()
    );
    expect(screen.getByText('SAR')).toBeTruthy();
    expect(screen.getByDisplayValue('8500')).toBeTruthy();
  });

  it('confirms before discarding a dirty account draft', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    renderWithProviders(<AccountForm initialType="bank" />);

    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.name')),
      'Cash box'
    );
    fireEvent.press(screen.getByLabelText(translate('common.back')));

    expect(alert).toHaveBeenCalledWith(
      translate('coreFinance.accounts.discardChanges'),
      translate('coreFinance.accounts.discardChangesBody'),
      expect.any(Array)
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('confirms before discarding a credit-limit-only edit', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    renderWithProviders(<AccountForm account={fixtureAccounts[3]} />);

    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.setup.creditLimit')),
      '4000'
    );
    fireEvent.press(screen.getByLabelText(translate('common.back')));

    expect(alert).toHaveBeenCalledWith(
      translate('coreFinance.accounts.discardChanges'),
      translate('coreFinance.accounts.discardChangesBody'),
      expect.any(Array)
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not show the discard alert after a new account is saved', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const dispatch = jest.fn();
    jest.mocked(useNavigation).mockReturnValue({ dispatch } as never);
    jest.spyOn(coreFinanceService, 'createAccount').mockResolvedValue({
      value: { ...fixtureAccounts[0], id: 'created-account' },
      affectedScopes: []
    });
    renderWithProviders(<AccountForm initialType="bank" />);

    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.name')),
      'Saved account'
    );
    const preventRemove = jest.mocked(usePreventRemove).mock.calls.at(-1)?.[1];
    jest.mocked(router.replace).mockImplementation(() =>
      preventRemove?.({ data: { action: { type: 'REPLACE' } } })
    );
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.create')));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/accounts'));
    expect(alert).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'REPLACE' });
  });
});
