import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import { changeLocale } from '@/localization/i18n';
import { elevation } from '@/design-system/tokens';
import { renderWithProviders } from '@/test-utils/render';
import { usePreferenceStore } from '@/state/preferences';
import { CycleStartDaySelectionScreen } from './CycleStartDaySelectionScreen';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn()
  }
}));

describe('CycleStartDaySelectionScreen', () => {
  beforeEach(() => {
    changeLocale('en');
    usePreferenceStore.setState({
      monthStartDay: 1,
      locale: 'en',
      direction: 'ltr'
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders days 1st through 28th in a grid', () => {
    renderWithProviders(<CycleStartDaySelectionScreen />);

    expect(screen.getByText('Month starts on')).toBeTruthy();
    expect(screen.getByText('1st')).toBeTruthy();
    expect(screen.getByText('2nd')).toBeTruthy();
    expect(screen.getByText('15th')).toBeTruthy();
    expect(screen.getByText('28th')).toBeTruthy();
    expect(screen.queryByText('29th')).toBeNull();
    expect(screen.getByTestId('cycle-start-day-1')).toHaveStyle({
      shadowOpacity: elevation.card.shadowOpacity
    });
  });

  it('updates global monthStartDay preference when used in settings mode', () => {
    renderWithProviders(<CycleStartDaySelectionScreen />);

    fireEvent.press(screen.getByText('15th'));
    expect(usePreferenceStore.getState().monthStartDay).toBe(15);
  });

  it('calls onSelectDay without updating global preference when in form mode', () => {
    const onSelectDay = jest.fn();
    renderWithProviders(
      <CycleStartDaySelectionScreen
        selectedDay={1}
        onSelectDay={onSelectDay}
      />
    );

    fireEvent.press(screen.getByText('8th'));
    expect(onSelectDay).toHaveBeenCalledWith(8);
    // Global monthStartDay remains untouched
    expect(usePreferenceStore.getState().monthStartDay).toBe(1);
  });

  it.each(['ar', 'en'] as const)(
    'uses two columns and wrapping ranges at 200%% text in %s',
    (locale) => {
      jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
      changeLocale(locale);
      renderWithProviders(<CycleStartDaySelectionScreen />);

      expect(screen.getByTestId('selection-grid-row-0').props.children).toHaveLength(2);
      expect(
        screen.getByTestId('cycle-start-range-1').props.numberOfLines
      ).toBeUndefined();
    }
  );
});
