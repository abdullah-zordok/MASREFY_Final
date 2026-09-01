import React from 'react';

import { changeLocale } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useReportsViewState } from '@/state/reports-view-state';
import { renderWithProviders } from '@/test-utils/render';
import { ReportsScreen } from './ReportsScreen';

beforeEach(() => {
  useReportsViewState.setState({
    anchorDate: '2026-08-08',
    selectedKind: 'monthly'
  });
});

test('report primary controls expose button roles', async () => {
  changeLocale('en');
  usePreferenceStore.setState({ hideBalances: true });
  const screen = renderWithProviders(<ReportsScreen />);

  expect(await screen.findByText('Net worth')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'All Accounts' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /August 2026/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: '1M' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Set monthly budget' })
  ).toBeTruthy();
  expect(screen.queryByText(/416545/)).toBeNull();
  expect(screen.queryByLabelText(/416545/)).toBeNull();
});
