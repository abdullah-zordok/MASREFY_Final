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
  expect(payment.getByText('Balance before payment')).toBeTruthy();
  expect(payment.getByText('Balance after payment')).toBeTruthy();
  expect(payment.getByText('Payment date')).toBeTruthy();
  fireEvent.press(payment.getByText('Confirm payment'));
  expect(await payment.findByText('Saved')).toBeTruthy();
  payment.unmount();

  const detail = renderWithProviders(
    <ObligationDetailScreen obligationId="obligation-car" />
  );
  expect(await detail.findByLabelText(/Installment 1.*Paid/)).toBeTruthy();
  expect(detail.queryByText('Payment history')).toBeNull();
  detail.unmount();

  const match = renderWithProviders(
    <PaymentMatchReviewScreen matchId="match-payment-car" />
  );
  expect(await match.findByText('Clear match')).toBeTruthy();
  expect(match.getByText('Strong match')).toBeTruthy();
  expect(match.getAllByText('Demo Auto').length).toBeGreaterThan(0);
  expect(match.getByText('Remaining now')).toBeTruthy();
  expect(match.getByText('After matching')).toBeTruthy();
  fireEvent.press(match.getByText('Match payment'));
  expect(await match.findByText('Resolved')).toBeTruthy();
  match.unmount();
});

it('keeps payment available and resolved matches terminal with the live provider', async () => {
  changeLocale('en');
  Object.assign(financialPlanningService.metadata, { kind: 'live' });
  try {
    const detail = renderWithProviders(
      <ObligationDetailScreen obligationId="obligation-car" />
    );
    expect(await detail.findByText('Record payment')).toBeTruthy();
    detail.unmount();

    const payment = renderWithProviders(
      <ObligationPaymentScreen obligationId="obligation-car" />
    );
    expect(await payment.findByText('Review payment')).toBeTruthy();
    payment.unmount();

    const match = renderWithProviders(
      <PaymentMatchReviewScreen matchId="match-payment-car" />
    );
    expect(await match.findByText('Resolved')).toBeTruthy();
    expect(match.queryByText('Match payment')).toBeNull();
    expect(match.queryByText('Ignore match')).toBeNull();
    match.unmount();
  } finally {
    Object.assign(financialPlanningService.metadata, { kind: 'mock' });
  }
});
