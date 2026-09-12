import React, { type ReactNode } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';

import type { Locale } from '@/domain/foundation';
import { typography } from './tokens';

export const FONT_ASSETS = {
  'MasarifiArabic-400': require('../../assets/fonts/NotoSansArabicUI-Regular.ttf'),
  'MasarifiArabic-500': require('../../assets/fonts/NotoSansArabicUI-Medium.ttf'),
  'MasarifiArabic-600': require('../../assets/fonts/NotoSansArabicUI-SemiBold.ttf'),
  'MasarifiArabic-700': require('../../assets/fonts/NotoSansArabicUI-Bold.ttf'),
  'MasarifiArabic-800': require('../../assets/fonts/NotoSansArabicUI-ExtraBold.ttf'),
  'MasarifiLatin-400': require('../../assets/fonts/Roboto-Regular.ttf'),
  'MasarifiLatin-500': require('../../assets/fonts/Roboto-Medium.ttf'),
  'MasarifiLatin-600': require('../../assets/fonts/Roboto-SemiBold.ttf'),
  'MasarifiLatin-700': require('../../assets/fonts/Roboto-Bold.ttf'),
  'MasarifiLatin-900': require('../../assets/fonts/Roboto-Black.ttf'),
  'MasarifiEditorialArabic-400': require('../../assets/fonts/IBMPlexSansArabic-Regular.ttf'),
  'MasarifiEditorialArabic-600': require('../../assets/fonts/IBMPlexSansArabic-SemiBold.ttf'),
  'MasarifiEditorialArabic-700': require('../../assets/fonts/IBMPlexSansArabic-Bold.ttf'),
  'MasarifiEditorialLatin-400': require('../../assets/fonts/IBMPlexSans-Regular.ttf'),
  'MasarifiEditorialLatin-600': require('../../assets/fonts/IBMPlexSans-SemiBold.ttf'),
  'MasarifiEditorialLatin-700': require('../../assets/fonts/IBMPlexSans-Bold.ttf')
} as const;

export type SemanticFontWeight = 400 | 500 | 600 | 700 | 800 | 900;

export const typographyStyles = {
  heading: typography.title,
  body: typography.body,
  helper: typography.caption,
  label: typography.subtitle,
  amount: typography.amount
} as const;

export function fontFamilyForLocale(
  locale: Locale,
  weight: SemanticFontWeight | 'regular' | 'bold'
): string {
  const family = locale === 'ar' ? 'MasarifiArabic' : 'MasarifiLatin';
  const semanticWeight =
    weight === 'regular' ? 400 : weight === 'bold' ? 700 : weight;
  const supported =
    locale === 'ar' && semanticWeight === 900 ? 800 : semanticWeight;
  return `${family}-${supported}`;
}

export function financialFontFamily(weight: 400 | 500 | 600 | 700 | 900) {
  return `MasarifiLatin-${weight}`;
}

export function editorialFontFamilyForLocale(
  locale: Locale,
  weight: 400 | 600 | 700
) {
  return `MasarifiEditorial${locale === 'ar' ? 'Arabic' : 'Latin'}-${weight}`;
}

export function FontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts(FONT_ASSETS);

  if (!loaded && !error) {
    return React.createElement(View, {
      testID: 'font-loading',
      style: { flex: 1 }
    });
  }

  return React.createElement(React.Fragment, null, children);
}
