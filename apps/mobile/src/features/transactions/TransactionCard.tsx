import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { layoutDirectionStyle } from '@/design-system/direction';
import {
  AmountText,
  CategoryIcon
} from '@/design-system/components/financial/FinancialPrimitives';
import { resolveCategoryVisual } from '@/design-system/components/financial/category-visuals';
import { borderWidth, radius, spacing } from '@/design-system/tokens';
import type { Transaction } from '@/domain/core-finance';
import { translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { projectTransaction } from './transaction-presentation';
import { editorialFontFamilyForLocale } from '@/design-system/typography';
import { colorTokens } from '@/design-system/tokens';

export function TransactionCard({
  accountName,
  groupedPosition,
  hidden,
  largeText,
  testIDPrefix,
  transaction
}: {
  accountName?: string;
  groupedPosition?: 'first' | 'middle' | 'last' | 'only';
  hidden: boolean;
  largeText: boolean;
  testIDPrefix: 'account' | 'home';
  transaction: Transaction;
}) {
  const theme = useTheme();
  const locale = usePreferenceStore((state) => state.locale);
  const direction = usePreferenceStore((state) => state.direction);
  const presentation = projectTransaction(transaction, locale);
  const visualKey =
    transaction.categoryId ?? (transaction.type === 'income' ? 'salary' : null);
  const category = resolveCategoryVisual(visualKey, 'category');
  const categoryLabel = translateDynamic(
    category?.labelKey ??
      (transaction.categoryId
        ? `coreFinance.meaning.${presentation.meaning}`
        : 'coreFinance.ledger.uncategorized'),
    {},
    locale
  );

  return (
    <Pressable
      testID={`${testIDPrefix}-transaction-row-${transaction.id}`}
      accessibilityLabel={[
        presentation.title,
        categoryLabel,
        accountName,
        presentation.dateLabel
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityRole="button"
      onPress={() => router.push(`/transactions/${transaction.id}/edit`)}
      style={({ pressed }) => [
        styles.card,
        groupedPosition && styles.grouped,
        largeText
          ? styles.stacked
          : { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
        {
          backgroundColor: groupedPosition
            ? colorTokens.surface.white
            : theme.colors.surfaces.card,
          borderColor: groupedPosition
            ? colorTokens.raw.E2E7E3
            : theme.colors.horizon.sheetBorder
        },
        groupedPosition === 'first' && styles.groupedFirst,
        groupedPosition === 'middle' && styles.groupedMiddle,
        groupedPosition === 'last' && styles.groupedLast,
        groupedPosition === 'only' && styles.groupedOnly,
        pressed && { backgroundColor: theme.colors.interactions.quietPressed }
      ]}
    >
      <View
        testID={`${testIDPrefix}-transaction-info-${transaction.id}`}
        style={[
          styles.info,
          { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }
        ]}
      >
        <CategoryIcon
          label={categoryLabel}
          size={groupedPosition ? 38 : 'md'}
          visualKey={visualKey}
        />
        <View
          testID={`${testIDPrefix}-transaction-text-${transaction.id}`}
          style={[
            styles.text,
            { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }
          ]}
        >
          <Text
            numberOfLines={largeText ? undefined : 2}
            style={[
              styles.title,
              groupedPosition && styles.groupedTitle,
              {
                color: theme.colors.content.primary,
                fontFamily: groupedPosition
                  ? editorialFontFamilyForLocale(locale, 700)
                  : undefined,
                textAlign: direction === 'rtl' ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {presentation.title}
          </Text>
          <Text
            numberOfLines={largeText ? undefined : 1}
            style={[
              styles.meta,
              groupedPosition && styles.groupedMeta,
              {
                color: theme.colors.content.secondary,
                fontFamily: groupedPosition
                  ? editorialFontFamilyForLocale(locale, 400)
                  : undefined,
                textAlign: direction === 'rtl' ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {groupedPosition && accountName
              ? `${categoryLabel} · ${accountName}`
              : categoryLabel}
          </Text>
          {accountName && !groupedPosition ? (
            <View style={styles.account}>
              <View
                style={[
                  styles.accountDot,
                  { backgroundColor: theme.colors.content.link }
                ]}
              />
              <Text
                numberOfLines={largeText ? undefined : 1}
                style={[
                  styles.accountText,
                  { color: theme.colors.content.secondary }
                ]}
              >
                {accountName}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View
        testID={`${testIDPrefix}-transaction-amount-${transaction.id}`}
        style={[
          styles.amount,
          largeText && styles.amountStacked,
          {
            alignItems: direction === 'rtl' ? 'flex-start' : 'flex-end',
            alignSelf: largeText
              ? direction === 'rtl'
                ? 'flex-start'
                : 'flex-end'
              : 'auto'
          }
        ]}
      >
        <AmountText
          currency={transaction.currencyCode}
          masked={hidden}
          meaning={presentation.meaning}
          minorUnits={transaction.amountMinor}
          size={groupedPosition ? 'compact' : 'home'}
        />
        {!groupedPosition ? (
          <Text
            style={[
              styles.date,
              {
                color: theme.colors.content.muted,
                textAlign: direction === 'rtl' ? 'left' : 'right',
                writingDirection: direction
              }
            ]}
          >
            {presentation.dateLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: radius.group,
    borderWidth: borderWidth.default,
    ...layoutDirectionStyle('ltr'),
    gap: spacing.md,
    minHeight: 80,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    writingDirection: 'ltr'
  },
  grouped: {
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  groupedFirst: { borderTopWidth: 0 },
  groupedMiddle: { borderTopColor: colorTokens.raw.EDF0ED, borderTopWidth: 1 },
  groupedLast: { borderTopColor: colorTokens.raw.EDF0ED, borderTopWidth: 1 },
  groupedOnly: { borderTopWidth: 0 },
  stacked: { alignItems: 'stretch', flexDirection: 'column' },
  info: { alignItems: 'center', flex: 1, gap: spacing.md, minWidth: 0 },
  text: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  groupedTitle: { fontSize: 14, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 17 },
  groupedMeta: {
    color: colorTokens.raw['68716C'],
    fontSize: 11,
    lineHeight: 15
  },
  account: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    maxWidth: '100%'
  },
  accountText: { fontSize: 11, lineHeight: 15, writingDirection: 'auto' },
  accountDot: { borderRadius: radius.pill, height: 6, width: 6 },
  amount: { flexShrink: 0, gap: 2, maxWidth: '45%' },
  amountStacked: { maxWidth: '100%' },
  date: { fontSize: 11, lineHeight: 15, textAlign: 'right' }
});
