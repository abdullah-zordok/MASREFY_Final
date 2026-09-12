import React from 'react';
import { ScrollView } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { router } from 'expo-router';

import { lightThemeColors } from '@/design-system/tokens';
import { changeLocale } from '@/localization/i18n';
import { financialPlanningService } from '@/services/mocks/financial-planning-service';
import { useReportsViewState } from '@/state/reports-view-state';
import { renderWithProviders } from '@/test-utils/render';
import { ReportsScreen } from './ReportsScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() }
}));

beforeAll(() => {
  notifyManager.setNotifyFunction((callback) => act(callback));
});

afterAll(() => {
  notifyManager.setNotifyFunction((callback) => callback());
});

test('2026-08-23 approved analytics screen exposes the reference hierarchy in Arabic', async () => {
  changeLocale('ar');
  useReportsViewState.setState({
    anchorDate: '2026-08-09',
    selectedKind: 'monthly',
    scrollOffset: 0
  });
  const screen = renderWithProviders(<ReportsScreen onBack={jest.fn()} />);

  expect(await screen.findByText('صافي الثروة')).toBeTruthy();
  expect(screen.UNSAFE_getByType(ScrollView).props.style).toEqual({
    backgroundColor: lightThemeColors.surfaces.page
  });
  expect(screen.getByText('التحليلات')).toBeTruthy();
  expect(screen.getByLabelText('كل الحسابات')).toBeTruthy();
  expect(screen.getByText('كل الحسابات').props.numberOfLines).toBeUndefined();
  expect(screen.getByLabelText('أغسطس 2026')).toBeTruthy();
  expect(screen.getByText('التدفق المالي')).toBeTruthy();
  expect(screen.getByText('نسبة التوفير')).toBeTruthy();
  expect(screen.getByText('الميزانية')).toBeTruthy();
  expect(screen.getByText('تعيين الميزانية الشهرية')).toBeTruthy();
  expect(screen.getByTestId('reports-assistant-card')).toBeTruthy();
  expect(screen.getByText('المساعد الذكي')).toBeTruthy();
  expect(
    screen.getByText('مساعدك المالي الذكي للإجابة على أسئلتك المالية بسرعة.')
  ).toBeTruthy();
  expect(
    screen.getByTestId('reports-assistant-icon', {
      includeHiddenElements: true
    })
  ).toBeTruthy();
  expect(screen.getByText('اشرح هذا التقرير')).toBeTruthy();
  for (const suggestion of [
    'لماذا زادت المصروفات؟',
    'أين يمكنني التوفير؟',
    'قارن هذه الفترة',
    'أنشئ خطة ادخار'
  ]) {
    expect(screen.getByText(suggestion)).toHaveStyle({ textAlign: 'center' });
  }
  for (const timeframe of ['1W', '1M', '3M', '1Y', 'All']) {
    expect(screen.getByRole('button', { name: timeframe })).toBeTruthy();
  }
});

test('report AI action opens the assistant with the current report context', async () => {
  changeLocale('ar');
  useReportsViewState.setState({ anchorDate: '2026-08-09' });
  const screen = renderWithProviders(<ReportsScreen />);

  fireEvent.press(
    await screen.findByRole('button', { name: 'اشرح هذا التقرير' })
  );

  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/assistant',
    params: {
      action: 'explain',
      reportKey: 'monthly:2026-08-09:SAR:Asia/Riyadh',
      returnTo: '/(tabs)/reports'
    }
  });
});

test('approved analytics screen exposes the equivalent hierarchy in English', async () => {
  changeLocale('en');
  const screen = renderWithProviders(<ReportsScreen />);

  expect(await screen.findByText('Net worth')).toBeTruthy();
  expect(screen.getByText('Analytics')).toBeTruthy();
  expect(screen.getByLabelText('All Accounts')).toBeTruthy();
  expect(screen.getByText('All Accounts').props.numberOfLines).toBeUndefined();
  expect(screen.getByText('Cash flow')).toBeTruthy();
  expect(screen.getByText('Savings rate')).toBeTruthy();
  expect(screen.getByText('Budget')).toBeTruthy();
  expect(screen.getByText('Explain this report')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '3M' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '3M' }).props.accessibilityState
    ).toEqual({ selected: true })
  );
});

test('budget card shows the aggregate remaining value when the month has budgets', async () => {
  changeLocale('en');
  useReportsViewState.setState({
    anchorDate: '2033-08-09',
    selectedKind: 'monthly',
    scrollOffset: 0
  });
  await financialPlanningService.saveBudget(
    {
      name: 'Client presentation',
      periodKey: '2033-08',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 1_000_00,
      incomeTargetMinor: 0,
      savingsTargetMinor: 0,
      categories: []
    },
    'report-budget-card-2033-08'
  );

  const screen = renderWithProviders(<ReportsScreen />);

  expect(await screen.findByText('Budget remaining')).toBeTruthy();
  expect(screen.getByText(/1,000\.00/)).toBeTruthy();
});

test('2026-08-10 native regression preserves report scroll context after drill-down navigation', async () => {
  changeLocale('en');
  useReportsViewState.setState({ scrollOffset: 0 });
  const first = renderWithProviders(<ReportsScreen />);
  await first.findByText('Explain this report');

  fireEvent(first.UNSAFE_getByType(ScrollView), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: 0, y: 640 } }
  });
  expect(useReportsViewState.getState().scrollOffset).toBe(640);
  first.unmount();

  const returned = renderWithProviders(<ReportsScreen />);
  await returned.findByText('Explain this report');
  expect(returned.UNSAFE_getByType(ScrollView).props.contentOffset).toEqual({
    x: 0,
    y: 640
  });
});
