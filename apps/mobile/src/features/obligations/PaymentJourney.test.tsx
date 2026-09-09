import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { changeLocale } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { renderWithProviders } from '@/test-utils/render';
import { ObligationDetailScreen } from './ObligationDetailScreen';
import { ObligationPaymentScreen } from './ObligationPaymentScreen';
import { PaymentMatchReviewScreen } from './PaymentMatchReviewScreen';

it('previews and confirms a payment, then resolves a detected match', async () => {
  changeLocale('en');
  const payment = renderWithProviders(
    <ObligationPaymentScreen obligationId="obligation-car" />
  );
  expect(
    await payment.findByLabelText(/Funding account Masarifi/)
  ).toBeTruthy();
  fireEvent.changeText(await payment.findByLabelText('Payment amount'), '100');
  fireEvent.press(payment.getByText('Review payment'));
  expect(await payment.findByText('Full payment')).toBeTruthy();
  fireEvent.press(payment.getByText('Confirm payment'));
  expect(await payment.findByText('Saved')).toBeTruthy();
  payment.unmount();

  const match = renderWithProviders(
    <PaymentMatchReviewScreen matchId="match-payment-car" />
  );
  expect(await match.findByText('Clear match')).toBeTruthy();
  fireEvent.press(match.getByText('Match payment: Car installment'));
  expect(await match.findByText('Resolved')).toBeTruthy();
  match.unmount();
});

it('does not offer unsupported live payment or match-confirmation actions', async () => {
  changeLocale('en');
  Object.assign(financialPlanningService.metadata, { kind: 'live' });
  try {
    const detail = renderWithProviders(
      <ObligationDetailScreen obligationId="obligation-car" />
    );
    expect(await detail.findByText('Unavailable')).toBeTruthy();
    expect(detail.queryByText('Record payment')).toBeNull();
    detail.unmount();

    const payment = renderWithProviders(
      <ObligationPaymentScreen obligationId="obligation-car" />
    );
    expect(await payment.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(payment.queryByText('Review payment')).toBeNull();
    payment.unmount();

    const match = renderWithProviders(
      <PaymentMatchReviewScreen matchId="match-payment-car" />
    );
    expect(await match.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(match.queryByText(/Match payment:/)).toBeNull();
    expect(match.getByText('Ignore match')).toBeTruthy();
    match.unmount();
  } finally {
    Object.assign(financialPlanningService.metadata, { kind: 'mock' });
  }
});
