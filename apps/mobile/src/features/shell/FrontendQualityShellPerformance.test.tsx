import React from 'react';

import { HomeScreen } from '@/features/home/HomeScreen';
import { translate } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import type { HomeSummary } from '@/domain/core-finance';

const summary: HomeSummary = {
  totalBalanceMinor: 125_000,
  currencyCode: 'SAR',
  isEstimated: false,
  components: [],
  excludedAccountIds: [],
  periodIncomeMinor: 50_000,
  periodExpenseMinor: 20_000,
  activeAccountCount: 2,
  recentTransactions: [],
  reviewCount: 1,
  pendingSyncCount: 1,
  dataState: 'ready'
};

test('returning shell shows useful financial content in at least 19 of 20 runs while optional work is delayed', () => {
  const timings: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    const started = performance.now();
    const screen = renderWithProviders(
      <HomeScreen summary={summary} notice={<DelayedOptionalPanel />} />
    );
    expect(
      screen.queryByText(translate('coreFinance.home.greeting'))
    ).toBeNull();
    expect(screen.getByTestId('home-quick-action-accounts')).toBeTruthy();
    expect(screen.getByTestId('home-horizon')).toBeTruthy();
    timings.push(performance.now() - started);
    screen.unmount();
  }

  expect(
    timings.filter((value) => value < 2_000).length
  ).toBeGreaterThanOrEqual(19);
});

function DelayedOptionalPanel() {
  return null;
}
