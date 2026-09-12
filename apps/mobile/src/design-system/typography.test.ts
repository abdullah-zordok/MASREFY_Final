import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import {
  FONT_ASSETS,
  editorialFontFamilyForLocale,
  FontGate,
  financialFontFamily,
  fontFamilyForLocale,
  typographyStyles
} from './typography';

jest.mock('expo-font', () => ({
  useFonts: jest.fn()
}));

const { useFonts } = jest.requireMock('expo-font') as {
  useFonts: jest.Mock;
};

describe('SPEC-002 typography', () => {
  it('registers approved local Arabic and Latin font assets', () => {
    expect(Object.keys(FONT_ASSETS)).toEqual([
      'MasarifiArabic-400',
      'MasarifiArabic-500',
      'MasarifiArabic-600',
      'MasarifiArabic-700',
      'MasarifiArabic-800',
      'MasarifiLatin-400',
      'MasarifiLatin-500',
      'MasarifiLatin-600',
      'MasarifiLatin-700',
      'MasarifiLatin-900',
      'MasarifiEditorialArabic-400',
      'MasarifiEditorialArabic-600',
      'MasarifiEditorialArabic-700',
      'MasarifiEditorialLatin-400',
      'MasarifiEditorialLatin-600',
      'MasarifiEditorialLatin-700'
    ]);
  });

  it('exposes the approved editorial families used by visual mockups', () => {
    expect(editorialFontFamilyForLocale('ar', 700)).toBe(
      'MasarifiEditorialArabic-700'
    );
    expect(editorialFontFamilyForLocale('en', 600)).toBe(
      'MasarifiEditorialLatin-600'
    );
  });

  it('selects approved Arabic and English font families', () => {
    expect(fontFamilyForLocale('ar', 400)).toBe('MasarifiArabic-400');
    expect(fontFamilyForLocale('ar', 800)).toBe('MasarifiArabic-800');
    expect(fontFamilyForLocale('ar', 900)).toBe('MasarifiArabic-800');
    expect(fontFamilyForLocale('en', 600)).toBe('MasarifiLatin-600');
    expect(fontFamilyForLocale('en', 900)).toBe('MasarifiLatin-900');
  });

  it('keeps existing text weights compatible with the new font families', () => {
    expect(fontFamilyForLocale('ar', 'regular')).toBe('MasarifiArabic-400');
    expect(fontFamilyForLocale('en', 'bold')).toBe('MasarifiLatin-700');
  });

  it('uses Latin fonts for financial values', () => {
    expect(financialFontFamily(700)).toBe('MasarifiLatin-700');
    expect(financialFontFamily(900)).toBe('MasarifiLatin-900');
  });

  it('exports hierarchy and tabular amount styles', () => {
    expect(typographyStyles.heading.fontWeight).toBe('700');
    expect(typographyStyles.body.fontWeight).toBe('400');
    expect(typographyStyles.helper.fontSize).toBeLessThan(
      typographyStyles.body.fontSize
    );
    expect(typographyStyles.label.fontWeight).toBe('600');
    expect(typographyStyles.amount.fontVariant).toEqual(['tabular-nums']);
  });

  it('holds product text until local fonts are loaded', () => {
    useFonts.mockReturnValue([false, null]);

    const screen = render(
      React.createElement(
        FontGate,
        null,
        React.createElement(Text, null, 'Visible product text')
      )
    );

    expect(screen.queryByText('Visible product text')).toBeNull();
    expect(screen.getByTestId('font-loading')).toBeTruthy();
  });

  it('renders children after local fonts load', () => {
    useFonts.mockReturnValue([true, null]);

    const screen = render(
      React.createElement(
        FontGate,
        null,
        React.createElement(Text, null, 'Visible product text')
      )
    );

    expect(screen.getByText('Visible product text')).toBeTruthy();
  });

  it('keeps the app usable when native font loading fails', () => {
    useFonts.mockReturnValue([false, new Error('font load failed')]);

    const screen = render(
      React.createElement(
        FontGate,
        null,
        React.createElement(Text, null, 'Visible product text')
      )
    );

    expect(screen.getByText('Visible product text')).toBeTruthy();
  });
});
