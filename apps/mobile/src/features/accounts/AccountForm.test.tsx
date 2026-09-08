import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';

import type { Account } from '@/domain/core-finance';
import { translate } from '@/localization/i18n';
import { fixtureAccounts } from '@/test-utils/core-finance-fixtures';
import { renderWithProviders, renderWithQueryData } from '@/test-utils/render';
import { coreFinanceKeys } from '@/features/core-finance/core-finance-queries';
import EditAccountRoute from '../../../app/accounts/[id]/edit';
import { registerLiveClerkBridge } from '@/services/live/auth-service';
import { AccountForm } from './AccountForm';
import { usePreferenceStore } from '@/state/preferences';
import {
  coreFinanceService,
  createLiveCoreFinanceService
} from '@/services/mocks/core-finance-service';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: 'closed-edit-account' })
}));

beforeEach(() => {
  registerLiveClerkBridge({
    getSession: async () => ({
      id: 'session-owner',
      userId: 'user_owner',
      method: 'google',
      issuedAt: 1,
      expiresAt: 9999999999999
    }),
    getToken: async () => 'owner-token',
    startPhone: jest.fn(),
    verifyPhone: jest.fn(),
    resendPhone: jest.fn(),
    signInWithGoogle: jest.fn(),
    reverifyConflict: jest.fn(),
    signOut: jest.fn()
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(router.back).mockClear();
});

describe('AccountForm', () => {
  it.each(['form', 'route'] as const)(
    'blocks the direct closed-account %s with a read-only Back state',
    (surface) => {
      const closed: Account = {
        ...fixtureAccounts[0],
        id: 'closed-edit-account',
        status: 'closed'
      };
      const update = jest.spyOn(coreFinanceService, 'updateAccount');
      const onBack = jest.fn();
      jest.mocked(router.back).mockClear();
      renderWithQueryData(
        surface === 'form' ? (
          <AccountForm account={closed} onBack={onBack} />
        ) : (
          <EditAccountRoute />
        ),
        [[coreFinanceKeys.account(closed.id), closed]]
      );
      expect(
        screen.queryByLabelText(translate('coreFinance.accounts.name'))
      ).toBeNull();
      expect(
        screen.queryByText(translate('coreFinance.accounts.save'))
      ).toBeNull();
      expect(
        screen.getByText(translate('coreFinance.accounts.closed'))
      ).toBeTruthy();
      fireEvent.press(screen.getByText(translate('appShell.navigation.back')));
      expect(surface === 'form' ? onBack : router.back).toHaveBeenCalledTimes(
        1
      );
      expect(update).not.toHaveBeenCalled();
    }
  );
  it('hides the absent historical opening balance on live edits and never patches it', async () => {
    jest
      .spyOn(Crypto, 'randomUUID')
      .mockReturnValue('30000000-0000-4000-8000-000000000001');
    const serverAccount = {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Historical account',
      type: 'bank',
      currency: 'SAR',
      isDefault: false,
      status: 'active',
      sortOrder: 0,
      includeInTotals: true,
      automaticTrackingEnabled: true,
      statementDay: null,
      paymentDueDay: null,
      monthlyInterestRateBasisPoints: null,
      minimumPaymentMinor: null,
      version: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-09-08T00:00:00Z'
    };
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ account: serverAccount }), {
          status: 201
        })
      )
      .mockImplementation(
        async () => new Response(JSON.stringify(serverAccount))
      );
    const live = createLiveCoreFinanceService({
      baseUrl: 'https://api.test',
      token: async () => 'owner-token',
      request
    });
    await live.createAccount({
      name: serverAccount.name,
      type: 'bank',
      currencyCode: 'SAR',
      openingBalanceMinor: 850_000
    });
    expect(
      JSON.parse(String(request.mock.calls[0]?.[1]?.body)).openingBalanceMinor
    ).toBe(850_000);
    const historical = await live.getAccount(serverAccount.id);
    jest
      .spyOn(coreFinanceService, 'updateAccount')
      .mockImplementation(live.updateAccount);
    renderWithProviders(<AccountForm account={historical} />);

    expect(
      screen.queryByLabelText(translate('coreFinance.accounts.openingBalance'))
    ).toBeNull();
    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.name')),
      'Renamed'
    );
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.save')));
    await waitFor(() =>
      expect(
        request.mock.calls.some(([, init]) => init?.method === 'PATCH')
      ).toBe(true)
    );
    const patch = request.mock.calls.find(
      ([, init]) => init?.method === 'PATCH'
    );
    expect(JSON.parse(String(patch?.[1]?.body))).not.toHaveProperty(
      'openingBalanceMinor'
    );
  });

  it('validates required name and shows hero card with currency', () => {
    renderWithProviders(<AccountForm initialType="bank" />);

    // Step 2 indicator and title
    expect(
      screen.getByText(translate('coreFinance.accounts.step2Of2'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.setup.introTitle'))
    ).toBeTruthy();

    // Bank hero card title is present
    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.bank'))
    ).toBeTruthy();

    // Attempt save with empty name
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.create')));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('renders credit card specific fields for credit_card type', () => {
    renderWithProviders(<AccountForm initialType="credit_card" />);

    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.credit_card'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.setup.creditLimit'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.setup.statementDay'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.setup.dueDay'))
    ).toBeTruthy();
    expect(
      screen.getByText(
        translate('coreFinance.accounts.setup.monthlyInterestBasisPoints')
      )
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.setup.minimumPayment'))
    ).toBeTruthy();
  });

  it('submits validated credit-card terms in their explicit units', async () => {
    const create = jest
      .spyOn(coreFinanceService, 'createAccount')
      .mockResolvedValue({
        value: { ...fixtureAccounts[3], id: 'created-card' },
        affectedScopes: []
      });
    renderWithProviders(<AccountForm initialType="credit_card" />);

    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.name')),
      'Travel card'
    );
    fireEvent.changeText(
      screen.getByLabelText(
        translate('coreFinance.accounts.setup.statementDay')
      ),
      '7'
    );
    fireEvent.changeText(
      screen.getByLabelText(translate('coreFinance.accounts.setup.dueDay')),
      '21'
    );
    fireEvent.changeText(
      screen.getByLabelText(
        translate('coreFinance.accounts.setup.monthlyInterestBasisPoints')
      ),
      '125'
    );
    fireEvent.changeText(
      screen.getByLabelText(
        translate('coreFinance.accounts.setup.minimumPayment')
      ),
      '50'
    );
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.create')));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          statementDay: 7,
          paymentDueDay: 21,
          monthlyInterestRateBasisPoints: 125,
          minimumPaymentMinor: 5_000
        })
      )
    );
  });

  it('defaults automatic tracking on and submits an explicit opt-out', async () => {
    const create = jest
      .spyOn(coreFinanceService, 'createAccount')
      .mockResolvedValue({
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

    expect(
      screen.getByText(translate('coreFinance.accounts.typeSelect.cash'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.name'))
    ).toBeTruthy();
    expect(
      screen.getByText(translate('coreFinance.accounts.openingBalance'))
    ).toBeTruthy();
    // Bank education tip should not appear in cash flow
    expect(
      screen.queryByText(translate('coreFinance.accounts.setup.educationTitle'))
    ).toBeNull();
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
    expect(screen.queryByDisplayValue('8500')).toBeNull();
    expect(
      screen.queryByLabelText(translate('coreFinance.accounts.openingBalance'))
    ).toBeNull();
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
      screen.getByLabelText(
        translate('coreFinance.accounts.setup.creditLimit')
      ),
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
    jest
      .mocked(router.replace)
      .mockImplementation(() =>
        preventRemove?.({ data: { action: { type: 'REPLACE' } } })
      );
    fireEvent.press(screen.getByText(translate('coreFinance.accounts.create')));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/accounts')
    );
    expect(alert).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'REPLACE' });
  });
});
