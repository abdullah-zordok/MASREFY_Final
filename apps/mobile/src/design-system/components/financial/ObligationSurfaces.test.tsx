import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { lightThemeColors } from '@/design-system/tokens';
import { renderWithProviders } from '@/test-utils/render';
import { FinancialTransition } from './FinancialTransition';
import { InstallmentTimeline } from './InstallmentTimeline';

it('describes installment rows by stable id and expands the bounded timeline', () => {
  const items = Array.from({ length: 6 }, (_, index) => ({
    id: `schedule-${index}`,
    label: `Installment ${index + 1}`,
    date: `Jan ${index + 1}, 2026`,
    amount: '2,000.00 SAR',
    status: index === 0 ? ('success' as const) : ('neutral' as const),
    statusLabel: index === 0 ? 'Paid' : 'Upcoming'
  }));
  const screen = renderWithProviders(
    <InstallmentTimeline title="Installment schedule" items={items} initialCount={4} showAllLabel="Show all" />
  );

  expect(screen.getByLabelText(/Installment 1.*Paid/)).toBeTruthy();
  expect(screen.getByTestId('installment-timeline-row-schedule-0')).toHaveStyle({
    minHeight: 64
  });
  expect(screen.getByTestId('installment-timeline-status-schedule-0')).toHaveStyle({
    width: 66
  });
  expect(screen.getByTestId('installment-timeline-marker-schedule-0')).toHaveStyle({
    borderColor: lightThemeColors.status.danger
  });
  expect(screen.getByTestId('installment-timeline-line-schedule-0')).toHaveStyle({
    backgroundColor: lightThemeColors.status.danger
  });
  expect(screen.queryByText('Installment 5')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Show all' }));
  expect(screen.getByText('Installment 6')).toBeTruthy();
});

it('renders one coherent before and after financial transition', () => {
  const screen = renderWithProviders(
    <FinancialTransition beforeLabel="Balance before" before="50,000.00 SAR" afterLabel="Balance after" after="48,000.00 SAR" />
  );

  expect(screen.getByLabelText(/Balance before.*50,000.00 SAR.*Balance after.*48,000.00 SAR/)).toBeTruthy();
});
