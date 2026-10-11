import React, { useEffect, useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import { layoutDirectionStyle } from '@/design-system/direction';
import { StateView } from '@/design-system/components/feedback/StateView';
import { FinancialHorizonSurface } from '@/design-system/components/financial/FinancialHorizonSurface';
import { DesignIcon } from '@/design-system/icons';
import { minTouchTarget, radius, spacing } from '@/design-system/tokens';
import type {
  Account,
  Category,
  HomeSummary as HomeSummaryValue
} from '@/domain/core-finance';
import {
  useAccounts,
  useCategories,
  useHomeSummary
} from '@/features/core-finance/core-finance-queries';
import { DateRangeSheet } from '@/features/filters/DateRangeSheet';
import {
  formatPeriodLabel,
  currentFinancialCyclePeriod,
  periodFilters,
  type DatePeriod
} from '@/features/filters/date-period';
import { PrimaryShellHeader } from '@/features/shell/PrimaryShellHeader';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import {
  applyAccountScope,
  useCoreFinanceViewState
} from '@/state/core-finance-view-state';
import { useTheme } from '@/state/theme-context';
import { HomeSummary } from './HomeSummary';
import type { HomeTodayActivity } from '@/services/contracts/core-finance-service';
import { useHomeTodayActivity } from './useHomeTodayActivity';
import { HomeActivityScrollView } from './HomeActivityViewport';

export function HomeScreen({
  accounts,
  categories,
  summary,
  todayActivity = [],
  notice
}: {
  accounts?: Account[];
  categories?: Category[];
  summary?: HomeSummaryValue;
  todayActivity?: HomeTodayActivity[];
  notice?: React.ReactNode;
}) {
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const monthStartDay = usePreferenceStore((state) => state.monthStartDay);
  const [period, setPeriod] = useState<DatePeriod>(() =>
    currentFinancialCyclePeriod(Date.now(), { timeZone, monthStartDay })
  );
  const selectedAccountId = useCoreFinanceViewState(
    (state) => state.selectedAccountId
  );
  const selectedAccount =
    accounts?.find(({ id }) => id === selectedAccountId) ?? null;
  if (summary) {
    return (
      <HomeLayout period={period} onPeriodChange={setPeriod}>
        <HomeSummary
          accounts={accounts}
          categories={categories}
          notice={summary.dataState === 'empty' ? undefined : notice}
          selectedAccount={selectedAccount}
          summary={summary}
          todayActivity={todayActivity}
        />
      </HomeLayout>
    );
  }

  return (
    <QueriedHomeScreen
      notice={notice}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}

function QueriedHomeScreen({
  notice,
  period,
  onPeriodChange
}: {
  notice?: React.ReactNode;
  period: DatePeriod;
  onPeriodChange: (period: DatePeriod) => void;
}) {
  const selectedAccountId = useCoreFinanceViewState(
    (state) => state.selectedAccountId
  );
  const reconcileSelectedAccount = useCoreFinanceViewState(
    (state) => state.reconcileSelectedAccount
  );
  const scopedFilters = useMemo(
    () => applyAccountScope(periodFilters(period), selectedAccountId),
    [period, selectedAccountId]
  );
  const baseCurrencyCode = usePreferenceStore(
    (state) => state.baseCurrencyCode
  );
  const query = useHomeSummary(baseCurrencyCode, scopedFilters);
  const activity = useHomeTodayActivity(selectedAccountId);
  const accounts = useAccounts(true);
  const categories = useCategories();
  const homeSummary = query.data;
  const activeAccountIds = useMemo(
    () =>
      ((accounts.data ?? []) as Account[])
        .filter((account) => account.status === 'active')
        .map((account) => account.id),
    [accounts.data]
  );

  useEffect(() => {
    if (accounts.data) reconcileSelectedAccount(activeAccountIds);
  }, [accounts.data, activeAccountIds, reconcileSelectedAccount]);

  const selectedAccount =
    ((accounts.data ?? []) as Account[]).find(
      ({ id }) => id === selectedAccountId
    ) ?? null;

  return (
    <HomeLayout period={period} onPeriodChange={onPeriodChange}>
      {query.isLoading ? (
        <StateView
          state="loading"
          title={translate('coreFinance.state.loading')}
        />
      ) : query.isError ? (
        <StateView
          state="error"
          title={translate('coreFinance.state.error')}
          actionLabel={translate('coreFinance.action.retry')}
          onAction={() => void query.refetch()}
        />
      ) : homeSummary ? (
        <HomeSummary
          accounts={accounts.data}
          categories={categories.data}
          notice={homeSummary.dataState === 'empty' ? undefined : notice}
          selectedAccount={selectedAccount}
          summary={homeSummary}
          todayActivity={activity.isError ? [] : activity.data ?? []}
          activityStatus={activity.isPending || activity.isError ? (
            <StateView
              state={activity.isError ? 'error' : 'loading'}
              title={translate(activity.isError ? 'coreFinance.state.error' : 'coreFinance.state.loading')}
              actionLabel={activity.isError ? translate('coreFinance.action.retry') : undefined}
              onAction={activity.isError ? () => void activity.refetch() : undefined}
            />
          ) : undefined}
        />
      ) : null}
    </HomeLayout>
  );
}

function HomeLayout({
  children,
  period,
  onPeriodChange
}: {
  children: React.ReactNode;
  period: DatePeriod;
  onPeriodChange: (period: DatePeriod) => void;
}) {
  const theme = useTheme();
  return (
    <HomeActivityScrollView
      style={{ backgroundColor: theme.colors.surfaces.page }}
      contentContainerStyle={styles.stack}
    >
      <FinancialHorizonSurface style={styles.horizon}>
        <HomeHeader period={period} onPeriodChange={onPeriodChange} />
        {children}
      </FinancialHorizonSurface>
    </HomeActivityScrollView>
  );
}

function HomeHeader({
  period,
  onPeriodChange
}: {
  period: DatePeriod;
  onPeriodChange: (period: DatePeriod) => void;
}) {
  const theme = useTheme();
  const locale = usePreferenceStore((state) => state.locale);
  const direction = usePreferenceStore((state) => state.direction);
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const [visible, setVisible] = useState(false);
  const label = formatPeriodLabel(period, locale, timeZone);

  return (
    <View style={styles.header}>
      <PrimaryShellHeader appearance="financialHero" origin="/(tabs)/home">
        <Pressable
          testID="home-period-control"
          accessibilityHint={translate('coreFinance.home.period.open')}
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={() => setVisible(true)}
          style={({ pressed }) => [
            styles.periodPill,
            {
              backgroundColor: pressed
                ? `${theme.colors.content.onFinancialHero}28`
                : `${theme.colors.content.onFinancialHero}16`,
              borderColor: `${theme.colors.content.onFinancialHero}30`,
              flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
            }
          ]}
        >
          <DesignIcon
            name="chevronDown"
            label={label}
            color={theme.colors.content.onFinancialHero}
            decorative
          />
          <Text
            testID="home-period-label"
            numberOfLines={PixelRatio.getFontScale() >= 1.5 ? undefined : 1}
            style={[
              styles.periodLabel,
              { color: theme.colors.content.onFinancialHero }
            ]}
          >
            {label}
          </Text>
        </Pressable>
        <DateRangeSheet
          visible={visible}
          period={period}
          onApply={onPeriodChange}
          onDismiss={() => setVisible(false)}
        />
      </PrimaryShellHeader>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexGrow: 1 },
  horizon: { flexGrow: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  periodPill: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    ...layoutDirectionStyle('ltr'),
    gap: spacing.sm,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.lg
  },
  periodLabel: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22
  }
});
