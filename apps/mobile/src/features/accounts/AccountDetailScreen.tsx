import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { FinancialPulse } from '@/design-system/components/financial/FinancialPulse';
import { TransactionRow } from '@/design-system/components/financial/TransactionRow';
import { GroupedList } from '@/design-system/components/navigation/GroupedList';
import {
  emptyTransactionFilters,
  supportsAutomaticTrackingAccountType,
  type Category,
  type Transaction
} from '@/domain/core-finance';
import {
  invalidateCoreFinanceScopes,
  useAccount,
  useAccountBalances,
  useCategories,
  useTransactions
} from '@/features/core-finance/core-finance-queries';
import {
  currentLocale,
  translate,
  translateDynamic
} from '@/localization/i18n';
import type { AccountBalanceProjection } from '@/services/contracts/core-finance-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { formatFinancialDisplayValue } from '@/utils/format-financial-value';
import { AccountRow } from './AccountRow';
import { projectAccount } from './account-presentation';
import { projectTransaction } from '@/features/transactions/transaction-presentation';

export function AccountDetailScreen({ id }: { id: string }) {
  const client = useQueryClient();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const account = useAccount(id);
  const balances = useAccountBalances(true);
  const activity = useTransactions({
    ...emptyTransactionFilters,
    accountIds: [id]
  });
  const categories = useCategories(true);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const locale = usePreferenceStore((state) => state.locale);
  const { revealed } = useSensitiveVisibility();
  if (account.isLoading || balances.isLoading)
    return (
      <StateView
        state="loading"
        title={translate('coreFinance.state.loading')}
      />
    );
  if (account.isError || balances.isError)
    return (
      <StateView
        state="error"
        title={translate('coreFinance.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => {
          void account.refetch();
          void balances.refetch();
        }}
      />
    );
  if (!account.data)
    return (
      <StateView
        state="error"
        title={translate('coreFinance.accounts.missing')}
        actionLabel={translate('appShell.navigation.back')}
        onAction={() => router.back()}
      />
    );
  const value = account.data;
  const balance = ((balances.data ?? []) as AccountBalanceProjection[]).find(
    (item) => item.accountId === id
  );
  const hidden = hideBalances && !revealed;
  const presentation = projectAccount(value, balance, hidden);
  const balanceDisplay = formatFinancialDisplayValue({
    minorUnits:
      presentation.balanceMinor === null
        ? undefined
        : presentation.balanceMinor,
    currencyCode: value.currencyCode,
    locale,
    sign: 'none',
    state: presentation.balanceState
  });
  const archiveLabel =
    value.status === 'archived'
      ? translate('coreFinance.accounts.restore')
      : translate('coreFinance.accounts.archive');
  const runArchiveAction = () => {
    Alert.alert(
      archiveLabel,
      translateDynamic('coreFinance.accounts.archiveConfirmNamed', {
        name: value.name
      }),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: archiveLabel,
          style: value.status === 'archived' ? 'default' : 'destructive',
          onPress: () => {
            void (async () => {
              setWorking(true);
              setActionError(undefined);
              try {
                const result =
                  value.status === 'archived'
                    ? await coreFinanceService.restoreAccount(id)
                    : await coreFinanceService.archiveAccount(id);
                await invalidateCoreFinanceScopes(
                  client,
                  result.affectedScopes
                );
                router.replace('/accounts');
              } catch {
                setActionError(translate('coreFinance.state.error'));
              } finally {
                setWorking(false);
              }
            })();
          }
        }
      ]
    );
  };
  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <FinancialPulse
        accessibilityLabel={balanceDisplay.accessibilityLabel}
        scope={translate('coreFinance.accounts.balanceAvailable')}
        statement={balanceDisplay.text.replace(/[\u2066\u2069]/g, '')}
        supportingValue={value.name}
      />
      <GroupedList label={value.name}>
        <AccountRow presentation={presentation} />
      </GroupedList>
      {supportsAutomaticTrackingAccountType(value.type) ? (
        <StyledText variant="caption">
          {translate(
            value.automaticTrackingEnabled
              ? 'coreFinance.accounts.automaticTrackingEnabled'
              : 'coreFinance.accounts.automaticTrackingDisabled'
          )}
        </StyledText>
      ) : null}
      <View style={styles.stack}>
        <StyledText variant="subtitle">
          {translate('coreFinance.accounts.recentActivity')}
        </StyledText>
        {activity.isLoading ? (
          <StateView
            state="loading"
            title={translate('coreFinance.state.loading')}
          />
        ) : activity.isError ? (
          <StateView
            state="error"
            title={translate('coreFinance.state.error')}
            actionLabel={translate('coreFinance.action.retry')}
            onAction={() => void activity.refetch()}
          />
        ) : (activity.data?.items ?? []).length ? (
          ((activity.data?.items ?? []) as Transaction[])
            .slice(0, 3)
            .map((transaction) => {
              const category = categories.data?.find(
                (item: Category) => item.id === transaction.categoryId
              );
              const projected = projectTransaction(
                transaction,
                currentLocale(),
                value,
                category
              );
              return (
                <TransactionRow
                  key={transaction.id}
                  title={projected.title}
                  category={
                    projected.categoryName ??
                    translate('coreFinance.ledger.uncategorized')
                  }
                  date={projected.dateLabel}
                  account={value.name}
                  source={translate(projected.sourceLabelKey as never)}
                  meaning={projected.meaning}
                  statusLabel={
                    projected.syncLabelKey
                      ? translate(projected.syncLabelKey as never)
                      : undefined
                  }
                  amountMinor={transaction.amountMinor}
                  currency={transaction.currencyCode}
                  onPress={() =>
                    router.push(`/transactions/${transaction.id}/edit`)
                  }
                />
              );
            })
        ) : (
          <StateView
            state="empty"
            title={translate('coreFinance.accounts.noRecentActivity')}
          />
        )}
      </View>
      {actionError ? (
        <StyledText variant="caption">{actionError}</StyledText>
      ) : null}
      <ActionButton
        label={translate('coreFinance.accounts.edit')}
        variant="secondary"
        onPress={() => router.push(`/accounts/${id}/edit`)}
      />
      <ActionButton
        label={archiveLabel}
        loading={working}
        variant={value.status === 'archived' ? 'secondary' : 'destructive'}
        onPress={runArchiveAction}
      />
      <ActionButton
        label={translate('coreFinance.action.transfer')}
        variant="secondary"
        onPress={() => router.push(`/(tabs)/add?type=transfer&accountId=${id}`)}
      />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 }
});
