import React, { useState } from 'react';
import {
  Alert,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { StateView } from '@/design-system/components/feedback/StateView';
import { BrandedScreenHeader } from '@/design-system/components/navigation/AppNavigation';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, spacing } from '@/design-system/tokens';
import { editorialFontFamilyForLocale } from '@/design-system/typography';
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
import { useTheme } from '@/state/theme-context';
import { formatFinancialDisplayValue } from '@/utils/format-financial-value';
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
  const direction = usePreferenceStore((state) => state.direction);
  const theme = useTheme();
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
    sign:
      presentation.balanceMinor !== null && presentation.balanceMinor < 0
        ? 'negative'
        : 'none',
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
  const isRtl = direction === 'rtl';
  const recentTransactions = (activity.data?.items ?? []) as Transaction[];
  const trackingLabel = supportsAutomaticTrackingAccountType(value.type)
    ? translate(
        value.automaticTrackingEnabled
          ? 'coreFinance.accounts.automaticTrackingEnabled'
          : 'coreFinance.accounts.automaticTrackingDisabled'
      )
    : null;
  const accountIdentity = `${translate(
    `coreFinance.accountType.${value.type}` as never
  )} · ${presentation.identityLine}`;
  return (
    <ScrollView
      contentContainerStyle={{
        backgroundColor: colorTokens.raw.F3F5F3,
        minHeight: '100%'
      }}
    >
      <BrandedScreenHeader
        compact
        direction={direction}
        subtitle={accountIdentity}
        testID="account-detail-masthead"
        title={value.name}
        titleTestID="account-detail-masthead-title"
      />
      <View style={styles.content}>
        <View
          testID="account-detail-hero"
          accessibilityLabel={[balanceDisplay.accessibilityLabel, trackingLabel]
            .filter(Boolean)
            .join(', ')}
          style={styles.hero}
        >
          <View style={styles.heroOrbit} />
          <Text
            style={[
              styles.heroLabel,
              {
                fontFamily: editorialFontFamilyForLocale(locale, 400),
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {translate('coreFinance.accounts.balanceCurrent')}
          </Text>
          <Text
            testID="financial-pulse-statement"
            adjustsFontSizeToFit={!largeText}
            minimumFontScale={0.72}
            numberOfLines={largeText ? 2 : 1}
            style={[
              styles.heroAmount,
              {
                fontFamily: editorialFontFamilyForLocale('en', 700),
                textAlign: isRtl ? 'right' : 'left'
              }
            ]}
          >
            {balanceDisplay.text.replace(/[\u2066\u2069]/g, '')}
          </Text>
          <Text
            style={[
              styles.heroNote,
              {
                fontFamily: editorialFontFamilyForLocale(locale, 400),
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {translate('coreFinance.accounts.balanceCalculated')}
          </Text>
        </View>
        {value.type === 'credit_card' ? (
          <View style={styles.creditCardPanel}>
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
        <View
          testID="account-detail-activity-header"
          style={[
            styles.sectionHeader,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          <StyledText
            style={[
              styles.sectionTitle,
              { fontFamily: editorialFontFamilyForLocale(locale, 700) }
            ]}
          >
            {translate('coreFinance.home.details')}
          </StyledText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('coreFinance.home.viewAll')}
            onPress={() => router.push(`/(tabs)/transactions?accountId=${id}`)}
            style={styles.viewAll}
          >
            <StyledText
              style={[
                styles.sectionLink,
                {
                  color: theme.colors.content.link,
                  fontFamily: editorialFontFamilyForLocale(locale, 700)
                }
              ]}
            >
              {translate('coreFinance.home.viewAll')}
            </StyledText>
          </Pressable>
        </View>
        <View
          testID="account-detail-activity-card"
          style={[
            styles.activityCard,
            {
              backgroundColor: colorTokens.surface.white,
              borderColor: colorTokens.raw.E2E7E3
            }
          ]}
        >
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
          ) : recentTransactions.length ? (
            recentTransactions
              .slice(0, 3)
              .map((transaction, index, items) => (
                <TransactionCard
                  key={transaction.id}
                  accountName={value.name}
                  groupedPosition={
                    items.length === 1
                      ? 'only'
                      : index === 0
                        ? 'first'
                        : index === items.length - 1
                          ? 'last'
                          : 'middle'
                  }
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
          <View style={styles.actions}>
            <ReferenceAction
              label={translate('coreFinance.accounts.edit')}
              kind="primary"
              onPress={() => router.push(`/accounts/${id}/edit`)}
            />
            <ReferenceAction
              label={translate('coreFinance.action.transfer')}
              kind="secondary"
              onPress={() =>
                router.push(`/(tabs)/add?type=transfer&accountId=${id}`)
              }
            />
            <ReferenceAction
              label={archiveLabel}
              kind="tertiary"
              loading={working}
              onPress={runArchiveAction}
            />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function ReferenceAction({
  kind,
  label,
  loading = false,
  onPress
}: {
  kind: 'primary' | 'secondary' | 'tertiary';
  label: string;
  loading?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const locale = usePreferenceStore((state) => state.locale);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: loading }}
      disabled={loading}
      onPress={onPress}
      style={[
        styles.action,
        kind === 'primary' && {
          backgroundColor: colorTokens.raw['1C3934']
        },
        kind === 'secondary' && {
          backgroundColor: colorTokens.surface.white,
          borderColor: colorTokens.raw.E2E7E3,
          borderWidth: 1
        },
        kind === 'tertiary' && styles.tertiaryAction
      ]}
    >
      {kind === 'primary' ? (
        <DesignIcon
          name="check"
          label={label}
          color={colorTokens.surface.white}
          size="sm"
          decorative
        />
      ) : null}
      <StyledText
        style={[
          styles.actionText,
          {
            color:
              kind === 'primary'
                ? colorTokens.surface.white
                : kind === 'tertiary'
                  ? theme.colors.status.danger
                  : colorTokens.raw['1C3934'],
            fontFamily: editorialFontFamilyForLocale(locale, 700)
          }
        ]}
      >
        {label}
      </StyledText>
    </Pressable>
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
  content: { paddingBottom: 34, paddingHorizontal: 18, paddingTop: 16 },
  hero: {
    backgroundColor: colorTokens.raw['1C3934'],
    borderRadius: 16,
    marginBottom: 14,
    minHeight: 129,
    overflow: 'hidden',
    padding: 20,
    shadowColor: colorTokens.raw['102723'],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 14
  },
  heroOrbit: {
    borderColor: 'rgba(226, 206, 183, 0.3)',
    borderRadius: 80,
    borderWidth: 1,
    bottom: -82,
    height: 160,
    position: 'absolute',
    right: -56,
    width: 160
  },
  heroLabel: { color: colorTokens.raw.CFE0DA, fontSize: 12, lineHeight: 17 },
  heroAmount: {
    color: colorTokens.surface.white,
    fontSize: 31,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.775,
    lineHeight: 35,
    marginTop: 6,
    writingDirection: 'ltr'
  },
  heroNote: {
    color: colorTokens.raw.E1ECE8,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8
  },
  creditCardPanel: { gap: spacing.md, marginBottom: 14 },
  sectionHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
    marginHorizontal: 2,
    marginTop: 20
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  sectionLink: { fontSize: 11, fontWeight: '700', lineHeight: 16 },
  viewAll: { justifyContent: 'center', minHeight: 44 },
  activityCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  actions: { gap: 8, marginTop: 15 },
  action: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 50
  },
  tertiaryAction: { backgroundColor: 'transparent' },
  actionText: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  }
});
