import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { lightThemeColors, radius } from '@/design-system/tokens';
import { changeLocale } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { renderWithProviders } from '@/test-utils/render';
import { DateRangeSheet } from './DateRangeSheet';
import { customPeriod, thisWeekPeriod, todayPeriod } from './date-period';

const riyadh = { timeZone: 'Asia/Riyadh', monthStartDay: 1 } as const;

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() }
}));

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(DateTimePickerAndroid.open).mockReset();
  changeLocale('en');
  usePreferenceStore.setState({ locale: 'en', direction: 'ltr', ...riyadh });
  // Saturday, 22 August 2026
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 7, 22, 12));
});

afterEach(() => jest.restoreAllMocks());

it('renders the 7 date range options in Arabic RTL with instruction text', () => {
  changeLocale('ar');
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.UTC(2026, 7, 22, 12), riyadh)}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />
  );

  expect(screen.getByText('اختر نطاق التاريخ')).toBeTruthy();
  expect(
    screen.getByText('اختر واحدًا من النطاقات المحددة أدناه')
  ).toHaveStyle({ textAlign: 'right', writingDirection: 'rtl' });
  expect(screen.getByTestId('date-period-option-custom')).toHaveStyle({
    flexDirection: 'row-reverse'
  });

  // 1. Custom Range
  expect(screen.getByText('نطاق مخصص')).toBeTruthy();
  expect(screen.getByText('اختر تاريخ البداية والنهاية المحددة')).toBeTruthy();
  expect(screen.getByText('نطاق مخصص').props.numberOfLines).toBeUndefined();
  expect(
    screen.getByText('اختر تاريخ البداية والنهاية المحددة').props.numberOfLines
  ).toBeUndefined();

  // 2. Today
  expect(screen.getByText('اليوم')).toBeTruthy();
  expect(screen.getByText('22 أغسطس 2026')).toBeTruthy();

  // 3. Yesterday
  expect(screen.getByText('أمس')).toBeTruthy();
  expect(screen.getByText('21 أغسطس 2026')).toBeTruthy();

  // 4. This Week
  expect(screen.getByText('هذا الأسبوع')).toBeTruthy();
  expect(screen.getByText('17 – 22 أغسطس 2026')).toBeTruthy();

  // 5. Last Week
  expect(screen.getByText('الأسبوع الماضي')).toBeTruthy();
  expect(screen.getByText('10 – 16 أغسطس 2026')).toBeTruthy();

  // 6. This Month
  expect(screen.getByText('هذا الشهر')).toBeTruthy();
  expect(screen.getByText('1 – 22 أغسطس 2026')).toBeTruthy();

  // 7. Last Month
  expect(screen.getByText('الشهر الماضي')).toBeTruthy();
  expect(screen.getByText('1 – 31 يوليو 2026')).toBeTruthy();

  // Today is selected
  expect(
    screen.getByTestId('date-period-option-today')
  ).toHaveAccessibilityState({
    selected: true
  });
  expect(
    screen.getByTestId('date-period-option-custom')
  ).toHaveAccessibilityState({
    selected: false
  });

  fireEvent.press(screen.getByTestId('date-period-option-custom'));
  expect(screen.getByLabelText('رجوع')).toHaveStyle({
    alignSelf: 'flex-end'
  });
});

it('renders the 7 date range options in English LTR with instruction text', () => {
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.UTC(2026, 7, 22, 12), riyadh)}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />
  );

  expect(screen.getByText('Choose Date Range')).toBeTruthy();
  expect(
    screen.getByText('Choose one of the specified ranges below')
  ).toBeTruthy();

  expect(screen.getByText('Custom Range')).toBeTruthy();
  expect(screen.getByText('Choose a specific start and end date')).toBeTruthy();
  expect(screen.getByText('Custom Range').props.numberOfLines).toBeUndefined();
  expect(
    screen.getByText('Choose a specific start and end date').props.numberOfLines
  ).toBeUndefined();
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('Yesterday')).toBeTruthy();
  expect(screen.getByText('This Week')).toBeTruthy();
  expect(screen.getByText('Last Week')).toBeTruthy();
  expect(screen.getByText('This Month')).toBeTruthy();
  expect(screen.getByText('Last Month')).toBeTruthy();
});

it('features custom range and groups presets without repeated calendar icons', () => {
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.UTC(2026, 7, 22, 12), riyadh)}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />
  );

  expect(screen.getByTestId('date-period-presets')).toHaveStyle({
    backgroundColor: lightThemeColors.surfaces.card,
    borderRadius: radius.card
  });
  expect(screen.getByTestId('date-period-option-custom')).toHaveStyle({
    minHeight: 64
  });
  expect(screen.getByTestId('date-period-option-today')).toHaveStyle({
    minHeight: 56
  });
  expect(screen.getByTestId('date-period-icon-custom')).toBeTruthy();
  expect(screen.queryByTestId('date-period-icon-today')).toBeNull();
});

it('applies preset date periods immediately upon clicking', () => {
  const onApply = jest.fn();
  const onDismiss = jest.fn();
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.UTC(2026, 7, 22, 12), riyadh)}
      onApply={onApply}
      onDismiss={onDismiss}
    />
  );

  fireEvent.press(screen.getByTestId('date-period-option-thisWeek'));
  expect(onApply).toHaveBeenCalledWith(
    thisWeekPeriod(Date.UTC(2026, 7, 22, 12), riyadh)
  );
  expect(onDismiss).toHaveBeenCalled();
});

it('opens custom range picker and applies custom date range', () => {
  const onApply = jest.fn();
  const onDismiss = jest.fn();
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.UTC(2026, 7, 22, 12), riyadh)}
      onApply={onApply}
      onDismiss={onDismiss}
    />
  );

  fireEvent.press(screen.getByTestId('date-period-option-custom'));
  expect(screen.getByLabelText('Start date')).toBeTruthy();
  expect(screen.getByLabelText('End date')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Start date'));
  act(() => {
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls[0][0].onChange?.(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: 0 } },
        new Date(2026, 7, 2)
      );
  });
  fireEvent.press(screen.getByLabelText('End date'));
  act(() => {
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls[1][0].onChange?.(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: 0 } },
        new Date(2026, 7, 17)
      );
  });
  expect(screen.getByText('16 days selected')).toBeTruthy();
  fireEvent.press(screen.getByText('Apply range'));

  expect(onApply).toHaveBeenCalledWith(
    customPeriod(Date.UTC(2026, 7, 2), Date.UTC(2026, 7, 17), riyadh)
  );
  expect(onDismiss).toHaveBeenCalled();
});

it('round-trips New York picker dates without shifting them backward', () => {
  const newYork = {
    timeZone: 'America/New_York',
    monthStartDay: 1
  } as const;
  usePreferenceStore.setState(newYork);
  const onApply = jest.fn();
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.parse('2026-08-02T16:00:00.000Z'), newYork)}
      onApply={onApply}
      onDismiss={jest.fn()}
    />
  );

  fireEvent.press(screen.getByTestId('date-period-option-custom'));
  fireEvent.press(screen.getByLabelText('Start date'));
  act(() => {
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls[0][0].onChange?.(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: -240 } },
        new Date(2026, 7, 2)
      );
  });
  fireEvent.press(screen.getByLabelText('End date'));
  act(() => {
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls[1][0].onChange?.(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: -240 } },
        new Date(2026, 7, 17)
      );
  });
  fireEvent.press(screen.getByText('Apply range'));

  expect(onApply).toHaveBeenCalledWith({
    kind: 'custom',
    periodStart: Date.parse('2026-08-02T04:00:00.000Z'),
    periodEnd: Date.parse('2026-08-18T03:59:59.999Z')
  });
});

it('counts selected New York dates inclusively across daylight saving time', () => {
  const newYork = {
    timeZone: 'America/New_York',
    monthStartDay: 1
  } as const;
  usePreferenceStore.setState(newYork);
  renderWithProviders(
    <DateRangeSheet
      visible
      period={todayPeriod(Date.parse('2026-03-07T17:00:00.000Z'), newYork)}
      onApply={jest.fn()}
      onDismiss={jest.fn()}
    />
  );

  fireEvent.press(screen.getByTestId('date-period-option-custom'));
  fireEvent.press(screen.getByLabelText('Start date'));
  act(() => {
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls[0][0].onChange?.(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: -300 } },
        new Date(2026, 2, 7)
      );
  });
  fireEvent.press(screen.getByLabelText('End date'));
  act(() => {
    jest
      .mocked(DateTimePickerAndroid.open)
      .mock.calls[1][0].onChange?.(
        { type: 'set', nativeEvent: { timestamp: 0, utcOffset: -240 } },
        new Date(2026, 2, 9)
      );
  });

  expect(screen.getByText('3 days selected')).toBeTruthy();
});
