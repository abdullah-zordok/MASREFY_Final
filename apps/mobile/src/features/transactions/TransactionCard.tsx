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

export function TransactionCard({
  accountName,
  hidden,
  largeText,
  testIDPrefix,
  transaction
}: {
  accountName?: string;
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
        largeText
          ? styles.stacked
          : { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' },
        {
          backgroundColor: theme.colors.surfaces.card,
          borderColor: theme.colors.horizon.sheetBorder
        },
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
        <CategoryIcon label={categoryLabel} size="md" visualKey={visualKey} />
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
              {
                color: theme.colors.content.primary,
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
              {
                color: theme.colors.content.secondary,
                textAlign: direction === 'rtl' ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {categoryLabel}
          </Text>
          {accountName ? (
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
          size="home"
        />
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
  stacked: { alignItems: 'stretch', flexDirection: 'column' },
  info: { alignItems: 'center', flex: 1, gap: spacing.md, minWidth: 0 },
  text: { flex: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  meta: { fontSize: 12, lineHeight: 17 },
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
