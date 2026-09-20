import React from 'react';
import { render } from '@testing-library/react-native';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { AppIcon, DesignIcon, IconBadge, directionalIconNames } from './icons';
import { iconSize, lightThemeColors } from './tokens';

jest.mock('expo-symbols', () => ({
  SymbolView: ({
    name,
    testID,
    accessibilityLabel,
    size,
    style,
    tintColor
  }: {
    name: { ios: string; android: string; web: string };
    testID?: string;
    accessibilityLabel?: string;
    size?: number;
    style?: StyleProp<ViewStyle>;
    tintColor?: ColorValue;
  }) => {
    const ReactActual = jest.requireActual('react') as typeof React;
    const { Text } = jest.requireActual(
      'react-native'
    ) as typeof import('react-native');
    return ReactActual.createElement(
      Text,
      { testID, accessibilityLabel, style: [style, { color: tintColor }] },
      `${name.ios}|${name.android}|${name.web}:${size}`
    );
  }
}));

describe('SPEC-002 icons', () => {
  it('maps a semantic icon across platforms with approved sizing and labeling', () => {
    const screen = render(
      <AppIcon name="search" label="Search transactions" size="md" />
    );

    expect(screen.getByLabelText('Search transactions')).toHaveTextContent(
      `magnifyingglass|search|search:${iconSize.md}`
    );
  });

  it('uses logical start direction for RTL material symbols', () => {
    const screen = render(
      <AppIcon name="back" label="Back" direction="rtl" testID="back-icon" />
    );

    expect(screen.getByTestId('back-icon')).toHaveTextContent(
      `chevron.backward|arrow_forward|arrow_forward:${iconSize.md}`
    );
  });

  it('keeps non-directional mappings unchanged in RTL', () => {
    const screen = render(
      <AppIcon
        name="settings"
        label="Settings"
        direction="rtl"
        testID="settings-icon"
      />
    );

    expect(screen.getByTestId('settings-icon')).toHaveTextContent(
      `gearshape|settings|settings:${iconSize.md}`
    );
  });

  it('uses a visible fallback for an unknown runtime icon name', () => {
    const screen = render(
      <AppIcon
        name={'missing-runtime-icon' as never}
        label="Unknown icon"
        testID="unknown-icon"
      />
    );

    expect(screen.getByTestId('unknown-icon')).toHaveTextContent(
      `tag|category|category:${iconSize.md}`
    );
  });

  it('declares the directional icon set explicitly', () => {
    expect(directionalIconNames).toEqual([
      'back',
      'forward',
      'chevronStart',
      'chevronEnd'
    ]);
  });

  it('maps financial trend icons through the shared icon system', () => {
    const screen = render(
      <>
        <DesignIcon name="trendUp" label="Income trend" />
        <DesignIcon name="trendDown" label="Expense trend" />
      </>
    );

    expect(screen.getByLabelText('Income trend')).toHaveTextContent(
      `chart.line.uptrend.xyaxis|trending_up|trending_up:${iconSize.md}`
    );
    expect(screen.getByLabelText('Expense trend')).toHaveTextContent(
      `chart.line.downtrend.xyaxis|trending_down|trending_down:${iconSize.md}`
    );
  });

  it('resolves semantic tones without screen-local colors', () => {
    const screen = render(
      <AppIcon
        name="income"
        label="Income"
        tone="income"
        testID="income-icon"
      />
    );

    expect(screen.getByTestId('income-icon-symbol')).toHaveStyle({
      color: lightThemeColors.financial.income
    });
  });

  it('renders a reusable rounded icon badge from semantic colors', () => {
    const screen = render(
      <IconBadge
        icon="wallet"
        label="Wallet"
        tone="transfer"
        testID="wallet-badge"
      />
    );

    expect(screen.getByTestId('wallet-badge')).toHaveStyle({
      backgroundColor: lightThemeColors.iconBadges.transfer.background,
      borderColor: lightThemeColors.iconBadges.transfer.border,
      height: 44,
      width: 44
    });
    expect(screen.getByLabelText('Wallet')).toBeTruthy();
  });
});
