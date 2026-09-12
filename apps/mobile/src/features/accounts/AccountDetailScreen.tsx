import React, { useState } from 'react';
import { Alert, PixelRatio, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { StateView } from '@/design-system/components/feedback/StateView';
import { FinancialPulse } from '@/design-system/components/financial/FinancialPulse';
import { GroupedList } from '@/design-system/components/navigation/GroupedList';
import {
  emptyTransactionFilters,
  parseAmountToMinor,
  supportsAutomaticTrackingAccountType,
  type Transaction
} from '@/domain/core-finance';
import { calculateCreditCardPayoff } from '@/domain/credit-card-payoff';
import {
  invalidateCoreFinanceScopes,
  useAccount,
  useAccountBalances,
  useTransactions
} from '@/features/core-finance/core-finance-queries';
import { TransactionCard } from '@/features/transactions/TransactionCard';
import { translate, translateDynamic } from '@/localization/i18n';
import type { AccountBalanceProjection } from '@/services/contracts/core-finance-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { formatFinancialDisplayValue } from '@/utils/format-financial-value';
import { AccountRow } from './AccountRow';
import { projectAccount } from './account-presentation';

export function AccountDetailScreen({ id }: { id: string }) {
  const client = useQueryClient();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [payoffBalance, setPayoffBalance] = useState('');
  const [payoffRate, setPayoffRate] = useState('');
  const [payoffPayment, setPayoffPayment] = useState('');
  const [payoffResult, setPayoffResult] = useState<string>();
  const account = useAccount(id);
  const balances = useAccountBalances(true);
  const activity = useTransactions({
    ...emptyTransactionFilters,
    accountIds: [id]
  });
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const locale = usePreferenceStore((state) => state.locale);
  const { revealed } = useSensitiveVisibility();
  const largeText = PixelRatio.getFontScale() >= 1.5;
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
  const calculatePayoff = async () => {
    const balanceMinor = parseAmountToMinor(payoffBalance, value.currencyCode);
    const paymentMinor = parseAmountToMinor(payoffPayment, value.currencyCode);
    const rate = /^\d+$/.test(payoffRate.trim()) ? Number(payoffRate) : NaN;
    if (
      balanceMinor === null ||
      balanceMinor < 0 ||
      paymentMinor === null ||
      paymentMinor <= 0 ||
      !Number.isSafeInteger(rate) ||
      rate < 0 ||
      rate > 10_000
    ) {
      setPayoffResult(translate('coreFinance.validation.invalid'));
      return;
    }
    const input = {
      balanceMinor: BigInt(balanceMinor),
      monthlyInterestRateBasisPoints: BigInt(rate),
      paymentMinor: BigInt(paymentMinor)
    };
    try {
      const result = coreFinanceService.calculateCreditCardPayoff
        ? await coreFinanceService.calculateCreditCardPayoff(input)
        : calculateCreditCardPayoff(input);
      setPayoffResult(
        result.status === 'payoff'
          ? translateDynamic('coreFinance.accounts.payoff.months', {
              months: result.months
            })
          : translate(
              result.reason === 'payment_not_above_interest'
                ? 'coreFinance.accounts.payoff.paymentNotAboveInterest'
                : 'coreFinance.accounts.payoff.monthLimitExceeded'
            )
      );
    } catch {
      setPayoffResult(translate('coreFinance.state.error'));
    }
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
      {value.type === 'credit_card' ? (
        <View style={styles.stack}>
          {value.statementDay !== null ? (
            <TermRow
              label={translate('coreFinance.accounts.setup.statementDay')}
              value={String(value.statementDay)}
            />
          ) : null}
          {value.paymentDueDay !== null ? (
            <TermRow
              label={translate('coreFinance.accounts.setup.dueDay')}
              value={String(value.paymentDueDay)}
            />
          ) : null}
          {value.monthlyInterestRateBasisPoints !== null ? (
            <TermRow
              label={translate(
                'coreFinance.accounts.setup.monthlyInterestBasisPoints'
              )}
              value={String(value.monthlyInterestRateBasisPoints)}
            />
          ) : null}
          {value.minimumPaymentMinor !== null ? (
            <TermRow
              label={translate('coreFinance.accounts.setup.minimumPayment')}
              value={
                formatFinancialDisplayValue({
                  minorUnits: value.minimumPaymentMinor,
                  currencyCode: value.currencyCode,
                  locale,
                  sign: 'none',
                  state: hidden ? 'hidden' : 'confirmed'
                }).text
              }
            />
          ) : null}
          <StyledText variant="subtitle">
            {translate('coreFinance.accounts.payoff.title')}
          </StyledText>
          <FormField
            label={translate('coreFinance.accounts.payoff.balance')}
            value={payoffBalance}
            onChangeText={setPayoffBalance}
            variant="amount"
          />
          <FormField
            label={translate('coreFinance.accounts.payoff.rateBasisPoints')}
            value={payoffRate}
            onChangeText={setPayoffRate}
            keyboardType="number-pad"
          />
          <FormField
            label={translate('coreFinance.accounts.payoff.payment')}
            value={payoffPayment}
            onChangeText={setPayoffPayment}
            variant="amount"
          />
          <ActionButton
            label={translate('coreFinance.accounts.payoff.calculate')}
            variant="secondary"
            onPress={() => void calculatePayoff()}
          />
          {payoffResult ? <StyledText>{payoffResult}</StyledText> : null}
        </View>
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
            .map((transaction) => (
              <TransactionCard
                key={transaction.id}
                accountName={value.name}
                hidden={hidden}
                largeText={largeText}
                testIDPrefix="account"
                transaction={transaction}
              />
            ))
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
      {value.status !== 'closed' ? (
        <>
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
            onPress={() =>
              router.push(`/(tabs)/add?type=transfer&accountId=${id}`)
            }
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <StyledText variant="caption">{label}</StyledText>
      <StyledText>{value}</StyledText>
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 }
});
