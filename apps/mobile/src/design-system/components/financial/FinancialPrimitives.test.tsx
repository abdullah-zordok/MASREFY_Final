import React from 'react';
import { render } from '@testing-library/react-native';

import { renderWithProviders } from '@/test-utils/render';
import { changeLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { ThemeContext } from '@/state/theme-context';
import { resolveTheme } from '@/design-system/theme';
import {
  darkThemeColors,
  lightThemeColors
} from '@/design-system/tokens';
import {
  AmountText,
  CategoryIcon,
  FinancialBadge
} from './FinancialPrimitives';

describe('financial primitives', () => {
  beforeEach(() => {
    changeLocale('ar');
    usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
  });

  it('renders signed stable-width amounts with currency', () => {
    const screen = renderWithProviders(
      <AmountText
        value={1250}
        currency="EGP"
        meaning="income"
        sign="positive"
        size="home"
      />
    );

    expect(screen.getByText('+1,250.00 EGP')).toHaveStyle({
      fontFamily: 'MasarifiLatin-700',
      fontSize: 16.5,
      writingDirection: 'ltr',
      fontVariant: ['tabular-nums']
    });
  });

  it('keeps Arabic hero amounts in the financial numeral family', () => {
    const screen = renderWithProviders(
      <AmountText
        value={1250}
        currency="EGP"
        meaning="income"
        sign="positive"
        size="hero"
      />
    );

    expect(screen.getByText('+1,250.00 EGP')).toHaveStyle({
      fontFamily: 'MasarifiLatin-900',
      writingDirection: 'ltr',
      fontVariant: ['tabular-nums']
    });
  });

  it('does not derive visible sign from financial tone when explicit sign is supplied', () => {
    const screen = renderWithProviders(
      <AmountText
        value={1250}
        currency="EGP"
        meaning="expense"
        sign="positive"
      />
    );

    expect(screen.getByText('+1,250.00 EGP')).toBeTruthy();
  });

  it('uses a layout-stable masking slot', () => {
    const screen = renderWithProviders(
      <AmountText
        value={1250}
        currency="EGP"
        meaning="expense"
        state="hidden"
      />
    );

    expect(screen.getByText('•••• EGP')).toBeTruthy();
    expect(
      screen.getByLabelText(translate('designSystem.privacy.hidden'))
    ).toBeTruthy();
  });

  it('keeps unknown and absent amounts distinct from confirmed zero', () => {
    const screen = renderWithProviders(
      <>
        <AmountText currency="EGP" meaning="income" state="unknown" />
        <AmountText currency="EGP" meaning="income" state="absent" />
      </>
    );

    expect(screen.getByText('— EGP')).toBeTruthy();
    expect(screen.getByText('Not available')).toBeTruthy();
    expect(screen.queryByText('0 EGP')).toBeNull();
  });

  it('renders financial badge text separate from operational state', () => {
    const screen = renderWithProviders(
      <FinancialBadge meaning="debt" label="Debt" />
    );

    expect(screen.getByText('Debt')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('renders category icons with accessible labels', () => {
    const screen = renderWithProviders(<CategoryIcon label="Groceries" />);

    expect(screen.getByLabelText('Groceries')).toBeTruthy();
    expect(screen.queryByText('GR')).toBeNull();
  });

  it('accepts category-specific foreground and background colors', () => {
    const foreground = lightThemeColors.financial.transfer;
    const background = lightThemeColors.iconBadges.transfer.background;
    const screen = renderWithProviders(
      <CategoryIcon
        label="Groceries"
        icon="shopping"
        color={foreground}
        backgroundColor={background}
      />
    );

    expect(
      screen.getByTestId('transaction-category-icon-shopping')
    ).toHaveStyle({
      backgroundColor: background,
      borderColor: foreground
    });
    expect(
      screen.getByTestId('transaction-category-icon-shopping-mark-symbol', {
        includeHiddenElements: true
      })
    ).toHaveProp('tintColor', foreground);
  });

  it('renders a deterministic colored category visual at a named size', () => {
    const screen = renderWithProviders(
      <CategoryIcon label="Food" visualKey="food" size="sm" />
    );

    expect(screen.getByTestId('category-visual-openmoji-food')).toBeTruthy();
    expect(screen.getByTestId('transaction-category-icon-food')).toHaveStyle({
      height: 36,
      width: 36
    });
  });

  it.each([
    ['light' as const, lightThemeColors.iconBadges.category[1]],
    ['dark' as const, darkThemeColors.iconBadges.category[1]]
  ])(
    'keeps category backgrounds visibly tinted in %s mode',
    (mode, colors) => {
      const screen = render(
        <ThemeContext.Provider value={{ theme: resolveTheme(mode, mode) }}>
          <CategoryIcon label="Food" visualKey="food" />
        </ThemeContext.Provider>
      );

      expect(screen.getByTestId('transaction-category-icon-food')).toHaveStyle({
        backgroundColor: colors.background,
        borderColor: colors.border
      });
    }
  );

  it('uses the soft blue category background for transportation', () => {
    const screen = renderWithProviders(
      <CategoryIcon label="Transportation" visualKey="transportation" />
    );

    expect(
      screen.getByTestId('transaction-category-icon-transportation')
    ).toHaveStyle({
      backgroundColor: lightThemeColors.iconBadges.category[2].background,
      borderColor: lightThemeColors.iconBadges.category[2].border
    });
  });

  it('falls back to the existing category mark for unknown custom visuals', () => {
    const screen = renderWithProviders(
      <CategoryIcon
        label="Custom category"
        visualKey="unknown-custom-key"
        icon="shopping"
      />
    );

    expect(screen.queryByTestId(/category-visual-openmoji-/)).toBeNull();
    expect(
      screen.getByTestId('transaction-category-icon-shopping-mark', {
        includeHiddenElements: true
      })
    ).toBeTruthy();
  });

  it('never leaves an uncategorized visual empty', () => {
    const screen = renderWithProviders(
      <CategoryIcon label="Uncategorized" visualKey={null} />
    );

    expect(
      screen.getByTestId('category-visual-openmoji-generic-finance')
    ).toBeTruthy();
  });
});
