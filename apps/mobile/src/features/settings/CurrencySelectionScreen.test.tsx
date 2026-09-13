import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { changeLocale } from '@/localization/i18n';
import { elevation } from '@/design-system/tokens';
import { renderWithProviders } from '@/test-utils/render';
import { usePreferenceStore } from '@/state/preferences';
import { CurrencySelectionScreen } from './CurrencySelectionScreen';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn()
  }
}));

describe('CurrencySelectionScreen', () => {
  beforeEach(() => {
    changeLocale('en');
    usePreferenceStore.setState({
      baseCurrencyCode: 'SAR',
      locale: 'en',
      direction: 'ltr'
    });
  });

  it('renders all supported currencies with active currency selected', () => {
    renderWithProviders(<CurrencySelectionScreen />);

    expect(screen.getByText('Change Currency')).toBeTruthy();
    expect(screen.getByText('Saudi Riyal')).toBeTruthy();
    expect(screen.getByText('Egyptian Pound')).toBeTruthy();
    expect(screen.getByText('US Dollar')).toBeTruthy();
    expect(screen.getByText('Euro')).toBeTruthy();
    expect(screen.getByTestId('currency-selection-row-SAR')).toHaveStyle({
      shadowOpacity: elevation.raised.shadowOpacity
    });
  });

  it('lays out Arabic content from right to left', () => {
    changeLocale('ar');
    usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });

    renderWithProviders(<CurrencySelectionScreen />);

    expect(screen.getByTestId('selection-title-section')).toHaveStyle({
      alignItems: 'flex-start',
      direction: 'rtl'
    });
    expect(screen.getByTestId('selection-title')).toHaveStyle({
      textAlign: 'right',
      writingDirection: 'rtl'
    });
    expect(screen.getByTestId('selection-subtitle')).toHaveStyle({
      textAlign: 'right',
      writingDirection: 'rtl'
    });
    expect(screen.getByTestId('currency-selection-row-SAR')).toHaveStyle({
      direction: 'rtl'
    });
  });

  it('searches currencies by code, english name, and arabic name', () => {
    renderWithProviders(<CurrencySelectionScreen />);

    const searchInput = screen.getByTestId('selection-search-input');

    // Search by code
    fireEvent.changeText(searchInput, 'EGP');
    expect(screen.getByText('Egyptian Pound')).toBeTruthy();
    expect(screen.queryByText('US Dollar')).toBeNull();

    // Search by name
    fireEvent.changeText(searchInput, 'Dollar');
    expect(screen.getByText('US Dollar')).toBeTruthy();
    expect(screen.queryByText('Egyptian Pound')).toBeNull();

    // Search by Arabic name
    fireEvent.changeText(searchInput, 'كويتي');
    expect(screen.getByText('Kuwaiti Dinar')).toBeTruthy();
    expect(screen.queryByText('US Dollar')).toBeNull();
  });

  it('updates global baseCurrencyCode preference when used in settings mode', () => {
    renderWithProviders(<CurrencySelectionScreen />);

    fireEvent.press(screen.getByText('Egyptian Pound'));
    expect(usePreferenceStore.getState().baseCurrencyCode).toBe('EGP');
  });

  it('calls onSelectCurrency without updating global preference when in form mode', () => {
    const onSelectCurrency = jest.fn();
    renderWithProviders(
      <CurrencySelectionScreen
        selectedCurrencyCode="USD"
        onSelectCurrency={onSelectCurrency}
      />
    );

    fireEvent.press(screen.getByText('UAE Dirham'));
    expect(onSelectCurrency).toHaveBeenCalledWith('AED');
    // Global base currency remains untouched
    expect(usePreferenceStore.getState().baseCurrencyCode).toBe('SAR');
  });
});
