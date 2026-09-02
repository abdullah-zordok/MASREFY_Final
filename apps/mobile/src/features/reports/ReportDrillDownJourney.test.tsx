import React from 'react';
import { PixelRatio } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { changeLocale } from '@/localization/i18n';
import { useCoreFinanceViewState } from '@/state/core-finance-view-state';
import { useReportsViewState } from '@/state/reports-view-state';
import { renderWithProviders } from '@/test-utils/render';
import { ReportDrillDownScreen } from './ReportDrillDownScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() }
}));

beforeEach(() => {
  useReportsViewState.setState({
    anchorDate: '2026-08-08',
    selectedKind: 'monthly'
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('drill-down applies visible report filters before opening transactions', async () => {
  changeLocale('en');
  useCoreFinanceViewState.getState().clearFilters();
  const screen = renderWithProviders(<ReportDrillDownScreen />);

  expect(await screen.findByText('Report records')).toBeTruthy();
  expect(await screen.findByText('2026-08-01 - 2026-08-31')).toBeTruthy();
  fireEvent.press(await screen.findByLabelText(/Charity/));
  expect(useCoreFinanceViewState.getState().filters.categoryIds).toEqual([
    'charity'
  ]);
  expect(useCoreFinanceViewState.getState().filters.periodStart).not.toBeNull();
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(tabs)/transactions',
    params: { returnTo: '/(tabs)/reports' }
  });
});

test('drill-down localizes Arabic category rows', async () => {
  changeLocale('ar');
  const screen = renderWithProviders(<ReportDrillDownScreen />);

  expect(await screen.findByText('سجلات التقرير')).toBeTruthy();
  expect(await screen.findByText('الصدقة')).toBeTruthy();
  expect(screen.queryByText('Charity')).toBeNull();
  expect(screen.getAllByText(/سجلًا مساهمًا/).length).toBeGreaterThan(0);
});

test.each(['ar', 'en'] as const)(
  'stacks drill-down rows and wraps labels at 200%% text in %s',
  async (locale) => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
    changeLocale(locale);
    const screen = renderWithProviders(<ReportDrillDownScreen />);
    const label = locale === 'ar' ? 'الصدقة' : 'Charity';

    expect(await screen.findByTestId('report-drill-down-row-0')).toHaveStyle({
      alignItems: 'stretch',
      flexDirection: 'column'
    });
    expect(screen.getByTestId('report-drill-down-amount-0')).toHaveStyle({
      alignItems: locale === 'ar' ? 'flex-start' : 'flex-end'
    });
    expect(screen.getByText(label).props.numberOfLines).toBeUndefined();
  }
);
