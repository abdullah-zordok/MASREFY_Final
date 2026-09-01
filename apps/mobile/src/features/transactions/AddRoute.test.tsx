import React from 'react';
import { screen } from '@testing-library/react-native';

import AddRoute from '../../../app/(tabs)/add';
import { translate } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';

const mockParams: {
  type?: string;
  accountId?: string;
  originalTransactionId?: string;
} = {
  type: 'transfer',
  accountId: 'account-1',
  originalTransactionId: undefined
};
const mockTransactionForm = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams
}));

jest.mock('@/features/transactions/TransactionForm', () => ({
  TransactionForm: (props: unknown) => mockTransactionForm(props)
}));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockParams, {
    type: 'transfer',
    accountId: 'account-1',
    originalTransactionId: undefined
  });
});

it('exports the add tab route', () => {
  expect(typeof AddRoute).toBe('function');
});

it('renders only the manual transaction form and preserves supported prefills', () => {
  renderWithProviders(<AddRoute />);

  expect(screen.queryByText(translate('voice.mode.voice'))).toBeNull();
  expect(mockTransactionForm).toHaveBeenCalledWith({
    initialAccountId: 'account-1',
    initialType: 'transfer'
  });
});

it('falls back to expense for transaction types hidden from Add', () => {
  Object.assign(mockParams, { type: 'obligation_payment' });

  renderWithProviders(<AddRoute />);

  expect(mockTransactionForm).toHaveBeenCalledWith({
    initialAccountId: 'account-1',
    initialType: 'expense'
  });
});

it('accepts refund only when an original transaction id is present', () => {
  Object.assign(mockParams, {
    type: 'refund',
    originalTransactionId: 'transaction-1'
  });

  renderWithProviders(<AddRoute />);

  expect(mockTransactionForm).toHaveBeenCalledWith({
    initialAccountId: 'account-1',
    initialType: 'refund',
    originalTransactionId: 'transaction-1'
  });
});

it('falls back to expense when refund is missing its original transaction id', () => {
  Object.assign(mockParams, {
    type: 'refund',
    originalTransactionId: undefined
  });

  renderWithProviders(<AddRoute />);

  expect(mockTransactionForm).toHaveBeenCalledWith({
    initialAccountId: 'account-1',
    initialType: 'expense',
    originalTransactionId: undefined
  });
});
