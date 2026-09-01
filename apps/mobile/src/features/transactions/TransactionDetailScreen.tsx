import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { AmountText } from '@/design-system/components/financial/FinancialPrimitives';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import type { Account, Category } from '@/domain/core-finance';
import {
  useAccounts,
  useCategories,
  useRemainingRefundableMinor,
  useTransaction
} from '@/features/core-finance/core-finance-queries';
import { currentLocale, translate } from '@/localization/i18n';
import { useTheme } from '@/state/theme-context';
import { formatDate } from '@/utils/format-financial-value';
import { usePreferenceStore } from '@/state/preferences';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { TransactionActions } from './TransactionActions';

export function TransactionDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const query = useTransaction(id);
  const originalQuery = useTransaction(query.data?.originalTransactionId ?? '');
  const refundCandidate =
    query.data?.type === 'expense' &&
    query.data.status === 'posted' &&
    query.data.reviewStatus !== 'required' &&
    query.data.syncStatus !== 'conflict';
  const refundable = useRemainingRefundableMinor(id, refundCandidate);
  const accounts = useAccounts(true);
  const categories = useCategories(true);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  if (query.isLoading)
    return (
      <StateView
        state="loading"
        title={translate('coreFinance.state.loading')}
      />
    );
  if (query.isError)
    return (
      <StateView
        state="error"
        title={translate('coreFinance.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => void query.refetch()}
      />
    );
  if (!query.data)
    return (
      <StateView
        state="error"
        title={translate('coreFinance.transaction.missing')}
        actionLabel={translate('appShell.navigation.back')}
        onAction={() => router.back()}
      />
    );
  const item = query.data;
  const locale = currentLocale();
  const accountName = accounts.data?.find(
    (account: Account) => account.id === item.accountId
  )?.name;
  const destinationAccountName = accounts.data?.find(
    (account: Account) => account.id === item.destinationAccountId
  )?.name;
  const category = categories.data?.find(
    (candidate: Category) => candidate.id === item.categoryId
  );
  const meaning =
    item.type === 'income'
      ? 'income'
      : item.type === 'transfer'
        ? 'transfer'
        : item.type === 'refund'
          ? 'refund'
          : 'expense';
  const refundEligible = refundCandidate && (refundable.data ?? 0) > 0;
  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <SurfaceCard>
        <View style={styles.stack}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {item.title}
          </Text>
          <AmountText
            minorUnits={item.amountMinor}
            currency={item.currencyCode}
            meaning={meaning}
            masked={hideBalances && !revealed}
          />
        </View>
      </SurfaceCard>
      <GroupedList label={translate('coreFinance.transaction.details')}>
        <NavigationRow
          label={translate('coreFinance.transaction.type')}
          value={translate(`coreFinance.type.${item.type}` as never)}
        />
        <NavigationRow
          label={translate('coreFinance.transaction.date')}
          value={formatDate(item.occurredAt, locale)}
        />
        <NavigationRow
          label={translate('coreFinance.transaction.account')}
          value={accountName ?? translate('coreFinance.accounts.missing')}
        />
        {destinationAccountName ? (
          <NavigationRow
            label={translate('coreFinance.form.destination')}
            value={destinationAccountName}
          />
        ) : null}
        <NavigationRow
          label={translate('coreFinance.transaction.category')}
          value={
            category
              ? locale === 'ar'
                ? category.labelAr
                : category.labelEn
              : translate('coreFinance.ledger.uncategorized')
          }
        />
        <NavigationRow
          label={translate('coreFinance.transaction.source')}
          value={translate(`coreFinance.source.${item.source}` as never)}
        />
        <NavigationRow
          label={translate('coreFinance.transaction.status')}
          value={translate(`coreFinance.sync.${item.syncStatus}` as never)}
        />
        {item.originalTransactionId ? (
          <NavigationRow
            label={translate('coreFinance.transaction.original')}
            value={originalQuery.data?.title ?? item.originalTransactionId}
            onPress={() =>
              router.push(`/transactions/${item.originalTransactionId}`)
            }
          />
        ) : null}
        {item.obligationId ? (
          <NavigationRow
            label={translate('coreFinance.transaction.obligation')}
            value={item.obligationId}
          />
        ) : null}
      </GroupedList>
      <ActionButton
        label={translate('coreFinance.transaction.edit')}
        variant="secondary"
        onPress={() => router.push(`/transactions/${id}/edit`)}
      />
      {refundEligible ? (
        <ActionButton
          label={translate('coreFinance.type.refund')}
          variant="secondary"
          onPress={() =>
            router.push(`/(tabs)/add?type=refund&originalTransactionId=${id}`)
          }
        />
      ) : null}
      <TransactionActions transaction={item} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: '700' }
});
