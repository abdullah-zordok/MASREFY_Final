import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import {
  formatAmount,
  formatFinancialDisplayValue,
  formatMinorAmount,
  type FinancialDisplaySign,
  type FinancialDisplayState
} from '@/utils/format-financial-value';
import type { Locale } from '@/domain/foundation';
import { useTheme } from '@/state/theme-context';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { financialFontFamily } from '@/design-system/typography';
import { AppIcon, type AppIconName } from '@/design-system/icons';
import {
  categoryVisualSizes,
  resolveCategoryVisual,
  type CategoryVisualSize
} from './category-visuals';

export type FinancialMeaning =
  'income' | 'expense' | 'transfer' | 'refund' | 'savings' | 'debt';

// ponytail: character-count proxy; use measured text width if supported formats expand.
const inlineAmountCharacterLimit = 16;

export function financialAmountNeedsFullWidth(
  value: number,
  currency: string,
  locale: Locale
): boolean {
  return (
    formatAmount(Math.abs(value), currency, locale).length >=
    inlineAmountCharacterLimit
  );
}

export function financialMinorAmountNeedsFullWidth(
  minorUnits: number,
  currency: string,
  locale: Locale
): boolean {
  return (
    formatMinorAmount(Math.abs(minorUnits), currency, locale).length >=
    inlineAmountCharacterLimit
  );
}

export function AmountText({
  value,
  minorUnits,
  currency,
  meaning,
  color,
  masked = false,
  sign,
  size = 'default',
  state = masked ? 'hidden' : 'confirmed'
}: {
  value?: number;
  minorUnits?: number;
  currency: string;
  meaning: FinancialMeaning;
  color?: string;
  masked?: boolean;
  sign?: FinancialDisplaySign;
  size?: 'compact' | 'default' | 'home' | 'row' | 'hero';
  state?: FinancialDisplayState;
}) {
  const theme = useTheme();
  const locale = usePreferenceStore((store) => store.locale);
  const display = formatFinancialDisplayValue({
    value,
    minorUnits,
    currencyCode: currency,
    locale,
    sign:
      sign ??
      (meaning === 'expense' || meaning === 'debt' ? 'negative' : 'positive'),
    state
  });
  const text = display.text.replace(/[\u2066\u2069]/g, '');

  return (
    <Text
      accessibilityLabel={
        state === 'hidden'
          ? translate('designSystem.privacy.hidden')
          : display.accessibilityLabel.replace(/[\u2066\u2069]/g, '')
      }
      style={[
        styles.amount,
        size === 'compact' && styles.compactAmount,
        size === 'home' && styles.homeAmount,
        size === 'row' && styles.rowAmount,
        size === 'hero' && styles.heroAmount,
        {
          color: color ?? theme.colors.financial[meaning],
          fontFamily: financialFontFamily(size === 'hero' ? 900 : 700),
          fontVariant: ['tabular-nums'],
          writingDirection: 'ltr'
        }
      ]}
    >
      {text}
    </Text>
  );
}

export function FinancialBadge({
  meaning,
  label
}: {
  meaning: FinancialMeaning;
  label: string;
}) {
  const theme = useTheme();
  const color = theme.colors.financial[meaning];

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeCue, { color }]}>
        {meaning[0].toUpperCase()}
      </Text>
      <Text style={[styles.badgeLabel, { color: theme.colors.textPrimary }]}>
        {label}
      </Text>
    </View>
  );
}

export function CategoryIcon({
  label,
  icon = 'category',
  size = 44,
  visualKey,
  color,
  backgroundColor
}: {
  label: string;
  icon?: AppIconName;
  size?: number | CategoryVisualSize;
  visualKey?: string | null;
  color?: string;
  backgroundColor?: string;
}) {
  const theme = useTheme();
  const visual = resolveCategoryVisual(visualKey, icon);
  const resolvedSize =
    typeof size === 'number' ? size : categoryVisualSizes[size];
  const palette = theme.colors.iconBadges.category;
  const badgeColors = visual
    ? palette[visual.tone % palette.length]
    : theme.colors.iconBadges.primary;
  const iconColor = color ?? badgeColors.foreground;
  const identity = visual?.key ?? icon;

  return (
    <View
      testID={`transaction-category-icon-${identity}`}
      accessibilityLabel={label}
      accessibilityRole="image"
      style={[
        styles.categoryIcon,
        {
          backgroundColor: backgroundColor ?? badgeColors.background,
          borderColor: color ?? badgeColors.border,
          height: resolvedSize,
          width: resolvedSize
        }
      ]}
    >
      {visual ? (
        <Image
          accessible={false}
          resizeMode="contain"
          source={visual.asset}
          testID={`category-visual-openmoji-${visual.key}`}
          style={{ height: resolvedSize * 0.72, width: resolvedSize * 0.72 }}
        />
      ) : (
        <AppIcon
          name={icon}
          label={label}
          color={iconColor}
          testID={`transaction-category-icon-${icon}-mark`}
          decorative
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 22,
    fontWeight: '700'
  },
  compactAmount: { fontSize: 13, lineHeight: 18 },
  homeAmount: {
    fontSize: 16.5
  },
  rowAmount: {
    fontSize: 16
  },
  heroAmount: {
    fontSize: 46,
    lineHeight: 58,
    letterSpacing: -1
  },
  badge: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  badgeCue: {
    fontWeight: '700'
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center'
  }
});
