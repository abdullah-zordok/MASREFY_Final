import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { router } from 'expo-router';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop
} from 'react-native-svg';

import { layoutDirectionStyle } from '@/design-system/direction';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { AppIcon, IconBadge } from '@/design-system/icons';
import {
  colorTokens,
  elevation,
  minTouchTarget,
  radius,
  spacing
} from '@/design-system/tokens';
import { emptyTransactionFilters, type Account } from '@/domain/core-finance';
import {
  buildFinancialPeriod,
  localDateInTimeZone
} from '@/domain/financial-period';
import type { LocalDate } from '@/domain/financial-planning';
import type { FinancialReport, ReportBreakdownItem } from '@/domain/reports';
import { AccountScopeSheet } from '@/features/accounts/AccountScopeSheet';
import {
  useAccounts,
  useHomeSummary
} from '@/features/core-finance/core-finance-queries';
import { DateRangeSheet } from '@/features/filters/DateRangeSheet';
import type { DatePeriod } from '@/features/filters/date-period';
import { translate, translateDynamic } from '@/localization/i18n';
import {
  applyAccountScope,
  useCoreFinanceViewState
} from '@/state/core-finance-view-state';
import { usePreferenceStore } from '@/state/preferences';
import { useReportsViewState } from '@/state/reports-view-state';
import { useTheme } from '@/state/theme-context';
import { formatMinorAmount } from '@/utils/format-financial-value';
import {
  type ReportTimeframe,
  useNetWorthTrend,
  useReport,
  useReportInput
} from './report-queries';

const timeframeOptions: readonly [ReportTimeframe, string][] = [
  ['week', '1W'],
  ['month', '1M'],
  ['quarter', '3M'],
  ['year', '1Y'],
  ['all', 'All']
];

export function ReportsScreen({ onBack }: { onBack?: () => void } = {}) {
  const theme = useTheme();
  const locale = usePreferenceStore((state) => state.locale);
  const direction = usePreferenceStore((state) => state.direction);
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const selectedAccountId = useCoreFinanceViewState(
    (state) => state.selectedAccountId
  );
  const { anchorDate, scrollOffset, setPeriod, setScrollOffset } =
    useReportsViewState();
  const { fontScale, width } = useWindowDimensions();
  const stackMetrics = width < 350 || fontScale >= 1.6;
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<ReportTimeframe>('month');
  const accountIds = selectedAccountId ? [selectedAccountId] : [];
  const accounts = useAccounts(false);
  const selectedAccount = accounts.data?.find(
    (account: Account) => account.id === selectedAccountId
  );
  const home = useHomeSummary(
    currencyCode,
    applyAccountScope(emptyTransactionFilters, selectedAccountId)
  );
  const reportQuery = useReport(
    useReportInput('monthly', anchorDate, currencyCode, accountIds)
  );
  const trendQuery = useNetWorthTrend({
    accountIds,
    anchorDate,
    currencyCode,
    timeframe
  });
  const period = useMemo(
    () => monthDatePeriod(anchorDate, timeZone),
    [anchorDate, timeZone]
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surfaces.page }}
      contentOffset={{ x: 0, y: scrollOffset }}
      contentContainerStyle={styles.page}
      onMomentumScrollEnd={(event) =>
        setScrollOffset(event.nativeEvent.contentOffset.y)
      }
      onScrollEndDrag={(event) =>
        setScrollOffset(event.nativeEvent.contentOffset.y)
      }
    >
      <View style={styles.ltrCanvas}>
        <AnalyticsHeader direction={direction} onBack={onBack} />
        <View
          style={[
            styles.selectorRow,
            {
              direction: 'ltr',
              flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
            }
          ]}
        >
          <Selector
            direction={direction}
            label={
              selectedAccount?.name ?? translate('coreFinance.home.allAccounts')
            }
            onPress={() => setAccountSheetOpen(true)}
          />
          <Selector
            accent
            direction={direction}
            label={formatMonthLabel(anchorDate, locale, timeZone)}
            onPress={() => setDateSheetOpen(true)}
          />
        </View>

        {reportQuery.isLoading || home.isLoading ? (
          <StateView
            state="loading"
            title={translate('reports.state.loading')}
          />
        ) : reportQuery.isError || home.isError || !reportQuery.data ? (
          <StateView
            state="error"
            title={translate('reports.state.error')}
            actionLabel={translate('reports.action.retry')}
            onAction={() => {
              void reportQuery.refetch();
              void home.refetch();
              void trendQuery.refetch();
            }}
          />
        ) : (
          <AnalyticsContent
            direction={direction}
            hidden={hideBalances}
            report={reportQuery.data}
            netWorthMinor={
              trendQuery.data?.at(-1)?.minorUnits ??
              home.data?.totalBalanceMinor ??
              0
            }
            stackMetrics={stackMetrics}
            timeframe={timeframe}
            trend={trendQuery.data ?? []}
            onTimeframeChange={setTimeframe}
          />
        )}
      </View>

      <AccountScopeSheet
        visible={accountSheetOpen}
        onDismiss={() => setAccountSheetOpen(false)}
      />
      <DateRangeSheet
        visible={dateSheetOpen}
        period={period}
        onApply={(next) =>
          setPeriod(
            'monthly',
            localDateInTimeZone(next.periodEnd, timeZone) as LocalDate
          )
        }
        onDismiss={() => setDateSheetOpen(false)}
      />
    </ScrollView>
  );
}

function AnalyticsHeader({
  direction,
  onBack
}: {
  direction: 'ltr' | 'rtl';
  onBack?: () => void;
}) {
  return (
    <View
      style={[
        styles.header,
        {
          direction: 'ltr',
          flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
        }
      ]}
    >
      {onBack ? (
        <Pressable
          accessibilityLabel={translate('appShell.navigation.back')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.headerAction}
        >
          <AppIcon
            name="back"
            direction="ltr"
            label={translate('appShell.navigation.back')}
            size="md"
            color={colorTokens.ink['900']}
            decorative
          />
        </Pressable>
      ) : null}
      <Text
        accessibilityRole="header"
        style={[
          styles.screenTitle,
          {
            textAlign: direction === 'rtl' ? 'right' : 'left',
            writingDirection: direction
          }
        ]}
      >
        {translate('reports.analytics.title')}
      </Text>
    </View>
  );
}

function Selector({
  accent = false,
  direction,
  label,
  onPress
}: {
  accent?: boolean;
  direction: 'ltr' | 'rtl';
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.selector,
        {
          direction: 'ltr',
          flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
        }
      ]}
    >
      <AppIcon
        name="chevronDown"
        label={label}
        size="sm"
        color={accent ? theme.colors.status.sync : theme.colors.content.muted}
        decorative
      />
      <Text
        style={[
          styles.selectorText,
          {
            color: accent
              ? theme.colors.status.sync
              : theme.colors.content.primary,
            writingDirection: direction
          }
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AnalyticsContent({
  direction,
  hidden,
  netWorthMinor,
  onTimeframeChange,
  report,
  stackMetrics,
  timeframe,
  trend
}: {
  direction: 'ltr' | 'rtl';
  hidden: boolean;
  netWorthMinor: number;
  onTimeframeChange: (value: ReportTimeframe) => void;
  report: FinancialReport;
  stackMetrics: boolean;
  timeframe: ReportTimeframe;
  trend: readonly { at: number; minorUnits: number }[];
}) {
  const income = report.summary.income.value?.minorUnits ?? 0;
  const expense = report.summary.expense.value?.minorUnits ?? 0;
  const netCashFlow = report.summary.netCashFlow.value?.minorUnits ?? 0;
  const savingsRate =
    report.summary.savingsRateBasisPoints.value ??
    (income > 0 ? Math.round((netCashFlow * 10_000) / income) : null);
  const budgetBreakdown = report.breakdowns.find(
    (breakdown) => breakdown.dimension === 'budget'
  );
  const budgetValue = report.insights.find(
    (insight) => insight.kind === 'budget_performance'
  )?.value.value;
  const budgetRemaining =
    typeof budgetValue === 'number' ? undefined : budgetValue?.minorUnits;

  return (
    <View style={styles.contentStack}>
      <NetWorthCard
        currency={report.currencyCode}
        direction={direction}
        hidden={hidden}
        netWorthMinor={netWorthMinor}
        timeframe={timeframe}
        trend={trend}
        onTimeframeChange={onTimeframeChange}
      />

      <SectionTitle direction={direction}>
        {translate('reports.analytics.cashFlow')}
      </SectionTitle>
      <ExpenseCard
        currency={report.currencyCode}
        direction={direction}
        hidden={hidden}
        breakdownItems={report.breakdowns[0]?.items ?? []}
        value={expense}
      />
      <View
        style={[
          styles.metricPair,
          stackMetrics && styles.metricPairStacked,
          {
            flexDirection: stackMetrics
              ? 'column'
              : direction === 'rtl'
                ? 'row-reverse'
                : 'row'
          }
        ]}
      >
        <SmallMetricCard
          currency={report.currencyCode}
          direction={direction}
          hidden={hidden}
          label={translate('reports.metric.income')}
          tone="income"
          value={income}
        />
        <SmallMetricCard
          currency={report.currencyCode}
          direction={direction}
          hidden={hidden}
          label={translate('reports.metric.netCashFlow')}
          tone={netCashFlow < 0 ? 'expense' : 'income'}
          value={netCashFlow}
        />
      </View>

      <SavingsRateCard
        currency={report.currencyCode}
        direction={direction}
        expense={expense}
        hidden={hidden}
        income={income}
        savingsRateBasisPoints={savingsRate}
      />

      <SectionTitle direction={direction}>
        {translate('reports.analytics.budget')}
      </SectionTitle>
      <BudgetCard
        currency={report.currencyCode}
        direction={direction}
        hidden={hidden}
        remainingMinor={
          budgetBreakdown?.items.length ? budgetRemaining : undefined
        }
      />

      <AssistantActions
        direction={direction}
        reportKey={report.key}
        stacked={stackMetrics}
      />
    </View>
  );
}

function NetWorthCard({
  currency,
  direction,
  hidden,
  netWorthMinor,
  onTimeframeChange,
  timeframe,
  trend
}: {
  currency: string;
  direction: 'ltr' | 'rtl';
  hidden: boolean;
  netWorthMinor: number;
  onTimeframeChange: (value: ReportTimeframe) => void;
  timeframe: ReportTimeframe;
  trend: readonly { at: number; minorUnits: number }[];
}) {
  const theme = useTheme();
  const first = trend[0]?.minorUnits ?? netWorthMinor;
  const change = netWorthMinor - first;
  const changePercent = first
    ? Math.round((change * 10_000) / Math.abs(first)) / 100
    : null;
  return (
    <View style={[styles.card, styles.netWorthCard]}>
      <DirectionalText direction={direction} style={styles.cardLabel} muted>
        {translate('reports.analytics.netWorth')}
      </DirectionalText>
      <ReportAmount
        align={direction === 'rtl' ? 'right' : 'left'}
        currency={currency}
        hidden={hidden}
        size="hero"
        value={netWorthMinor}
      />
      <View
        style={[
          styles.changeBadge,
          {
            alignSelf: direction === 'rtl' ? 'flex-end' : 'flex-start',
            backgroundColor:
              change < 0
                ? theme.colors.financial.expenseSurface
                : theme.colors.financial.incomeSurface
          }
        ]}
      >
        <Text
          style={[
            styles.changeText,
            {
              color:
                change < 0
                  ? theme.colors.financial.expense
                  : theme.colors.financial.income
            }
          ]}
        >
          {hidden
            ? translate('designSystem.privacy.hidden')
            : `${change < 0 ? '▼' : '▲'} ${moneyInline(change, currency)} · ${changePercent === null ? '—' : `${changePercent}%`}`}
        </Text>
      </View>
      <NetWorthLine trend={trend} />
      <ChartDateLabels direction={direction} trend={trend} />
      <View
        style={[
          styles.timeframeRow,
          {
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        {timeframeOptions.map(([value, label]) => {
          const selected = timeframe === value;
          return (
            <Pressable
              key={value}
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onTimeframeChange(value)}
              style={[
                styles.timeframeButton,
                selected && { backgroundColor: theme.colors.status.sync }
              ]}
            >
              <Text
                style={[
                  styles.timeframeText,
                  {
                    color: selected
                      ? theme.colors.content.inverse
                      : theme.colors.content.secondary
                  }
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NetWorthLine({
  trend
}: {
  trend: readonly { at: number; minorUnits: number }[];
}) {
  const theme = useTheme();
  const trendValues = trend.length
    ? trend.map((point) => point.minorUnits)
    : [0, 0];
  const min = Math.min(...trendValues);
  const max = Math.max(...trendValues);
  const range = max - min || 1;
  const chartPoints = trendValues.map((value, index) => ({
    x: 4 + (312 * index) / Math.max(trendValues.length - 1, 1),
    y: 12 + ((max - value) * 116) / range
  }));
  const linePath = chartPoints
    .map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`)
    .join(' ');
  const areaPath = `${linePath} L316 140 L4 140 Z`;
  const lastPoint = chartPoints.at(-1)!;
  return (
    <Svg height={150} width="100%" viewBox="0 0 320 150">
      <Defs>
        <LinearGradient id="reportTrendFill" x1="0" y1="0" x2="0" y2="1">
          <Stop
            offset="0"
            stopColor={theme.colors.horizon.heroEnd}
            stopOpacity={0.2}
          />
          <Stop
            offset="1"
            stopColor={theme.colors.horizon.heroEnd}
            stopOpacity={0}
          />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#reportTrendFill)" />
      <Path
        d={linePath}
        fill="none"
        stroke={theme.colors.horizon.heroEnd}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
      <Circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        fill={theme.colors.horizon.heroEnd}
        r={4.5}
        stroke={theme.colors.surface}
        strokeWidth={2}
      />
    </Svg>
  );
}

function ChartDateLabels({
  direction,
  trend
}: {
  direction: 'ltr' | 'rtl';
  trend: readonly { at: number; minorUnits: number }[];
}) {
  const locale = usePreferenceStore((state) => state.locale);
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const formatter = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    day: 'numeric',
    month: 'short',
    timeZone
  });
  const start = trend[0]?.at;
  const end = trend.at(-1)?.at;
  const labels = direction === 'rtl' ? [end, start] : [start, end];
  return (
    <View style={styles.chartDateRow}>
      {labels.map((value, index) => (
        <Text key={`${value}-${index}`} style={styles.chartDateText}>
          {value ? formatter.format(value) : '—'}
        </Text>
      ))}
    </View>
  );
}

function ExpenseCard({
  breakdownItems,
  currency,
  direction,
  hidden,
  value
}: {
  breakdownItems: readonly ReportBreakdownItem[];
  currency: string;
  direction: 'ltr' | 'rtl';
  hidden: boolean;
  value: number;
}) {
  return (
    <View style={[styles.card, styles.expenseCard]}>
      <DirectionalText direction={direction} style={styles.cardLabel} muted>
        {translate('reports.metric.expense')}
      </DirectionalText>
      <ReportAmount
        align={direction === 'rtl' ? 'right' : 'left'}
        currency={currency}
        hidden={hidden}
        size="large"
        value={value}
      />
      <MiniBars breakdownItems={breakdownItems} />
    </View>
  );
}

function MiniBars({
  breakdownItems
}: {
  breakdownItems: readonly ReportBreakdownItem[];
}) {
  const theme = useTheme();
  const categoryValues = breakdownItems
    .slice(0, 7)
    .map((item) => item.value.value?.minorUnits ?? 0);
  const max = Math.max(...categoryValues, 1);
  const bars = Array.from(
    { length: 7 },
    (_, index) => categoryValues[index] ?? 0
  );
  return (
    <View style={styles.miniBars}>
      {bars.map((value, index) => (
        <View
          key={index}
          style={[
            styles.miniBar,
            {
              backgroundColor:
                index === 0
                  ? theme.colors.horizon.heroEnd
                  : theme.colors.borders.subtle,
              height: 4 + (48 * value) / max
            }
          ]}
        />
      ))}
    </View>
  );
}

function SmallMetricCard({
  currency,
  direction,
  hidden,
  label,
  tone,
  value
}: {
  currency: string;
  direction: 'ltr' | 'rtl';
  hidden: boolean;
  label: string;
  tone: 'income' | 'expense';
  value: number;
}) {
  const theme = useTheme();
  const color = theme.colors.financial[tone];
  return (
    <View style={[styles.card, styles.smallMetricCard]}>
      <DirectionalText direction={direction} style={styles.cardLabel} muted>
        {label}
      </DirectionalText>
      <ReportAmount
        align={direction === 'rtl' ? 'right' : 'left'}
        color={color}
        currency={currency}
        hidden={hidden}
        size="large"
        value={value}
      />
      {tone === 'expense' && value < 0 ? (
        <DirectionalText
          direction={direction}
          style={[styles.negativeLabel, { color }]}
        >
          {translate('reports.analytics.negative')}
        </DirectionalText>
      ) : null}
      <View style={styles.metricTrack}>
        <View style={[styles.metricProgress, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SavingsRateCard({
  currency,
  direction,
  expense,
  hidden,
  income,
  savingsRateBasisPoints
}: {
  currency: string;
  direction: 'ltr' | 'rtl';
  expense: number;
  hidden: boolean;
  income: number;
  savingsRateBasisPoints: number | null;
}) {
  const theme = useTheme();
  const percentage =
    savingsRateBasisPoints === null
      ? null
      : Math.round(savingsRateBasisPoints / 100);
  const progress = Math.min(100, Math.abs(percentage ?? 0));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={translate('reports.analytics.savingsRate')}
      onPress={() => router.push('/savings')}
      style={[styles.card, styles.savingsCard]}
    >
      <View
        style={[
          styles.savingsTop,
          {
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        <View style={styles.savingsCopy}>
          <DirectionalText direction={direction} style={styles.cardLabel} muted>
            {translate('reports.analytics.savingsRate')}
          </DirectionalText>
          <View
            style={[
              styles.savingsValueRow,
              {
                direction: 'ltr',
                flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
              }
            ]}
          >
            <Text style={styles.savingsPercent}>
              {hidden
                ? '••••'
                : percentage === null
                  ? '—'
                  : `\u2066${percentage}%\u2069`}
            </Text>
            <DirectionalText
              direction={direction}
              style={styles.savingsSupport}
              muted
            >
              {translate('reports.analytics.ofIncome')}
            </DirectionalText>
          </View>
        </View>
        <AppIcon
          name="chevronEnd"
          direction={direction}
          label={translate('reports.analytics.savingsRate')}
          size="sm"
          color={theme.colors.content.muted}
          decorative
        />
      </View>
      <View style={styles.savingsTrack}>
        <View
          style={[
            styles.savingsProgress,
            {
              backgroundColor:
                (percentage ?? 0) < 0
                  ? theme.colors.financial.expense
                  : theme.colors.financial.income,
              width: `${progress}%`
            }
          ]}
        />
      </View>
      <DirectionalText direction={direction} style={styles.savingsFooter} muted>
        {hidden
          ? translate('designSystem.privacy.hidden')
          : translateDynamic('reports.analytics.spentOfIncome', {
              expense: moneyInline(expense, currency),
              income: moneyInline(income, currency)
            })}
      </DirectionalText>
    </Pressable>
  );
}

function BudgetCard({
  currency,
  direction,
  hidden,
  remainingMinor
}: {
  currency: string;
  direction: 'ltr' | 'rtl';
  hidden: boolean;
  remainingMinor?: number;
}) {
  const theme = useTheme();
  const hasBudget = remainingMinor !== undefined;
  const label = hasBudget
    ? translate('reports.insight.budget_performance')
    : translate('reports.analytics.setBudget');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/budgets')}
      style={[
        styles.card,
        styles.navigationCard,
        {
          direction: 'ltr',
          flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
        }
      ]}
    >
      <View style={styles.addCircle}>
        <AppIcon
          name="add"
          label={label}
          size="md"
          color={theme.colors.status.sync}
          decorative
        />
      </View>
      <View style={styles.navigationCopy}>
        <DirectionalText direction={direction} style={styles.navigationTitle}>
          {label}
        </DirectionalText>
        <DirectionalText
          direction={direction}
          style={styles.navigationSubtitle}
          muted
        >
          {hasBudget
            ? hidden
              ? translate('designSystem.privacy.hidden')
              : formatMinorAmount(
                  remainingMinor,
                  currency,
                  usePreferenceStore.getState().locale
                )
            : translate('reports.analytics.setBudgetHint')}
        </DirectionalText>
      </View>
      <AppIcon
        name="chevronEnd"
        direction={direction}
        label={label}
        size="sm"
        color={theme.colors.borders.default}
        decorative
      />
    </Pressable>
  );
}

function AssistantActions({
  direction,
  reportKey,
  stacked
}: {
  direction: 'ltr' | 'rtl';
  reportKey: string;
  stacked: boolean;
}) {
  const actions = [
    ['explain', 'reports.action.explain'],
    ['spending_increase', 'reports.action.spendingIncrease'],
    ['find_savings', 'reports.action.findSavings'],
    ['compare', 'reports.action.compare'],
    ['create_plan', 'reports.action.createPlan']
  ] as const;
  const [primaryAction, ...suggestions] = actions;
  const openAssistant = (action: (typeof actions)[number][0]) =>
    router.push({
      pathname: '/assistant',
      params: { action, reportKey, returnTo: '/(tabs)/reports' }
    });

  return (
    <View
      testID="reports-assistant-card"
      style={[styles.card, styles.assistantCard]}
    >
      <View
        style={[
          styles.assistantHeader,
          {
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        <IconBadge
          decorative
          icon="assistant"
          label={translate('assistant.hero.title')}
          testID="reports-assistant-icon"
        />
        <View style={styles.assistantCopy}>
          <DirectionalText
            accessibilityRole="header"
            direction={direction}
            style={styles.assistantTitle}
          >
            {translate('assistant.hero.title')}
          </DirectionalText>
          <DirectionalText
            direction={direction}
            muted
            style={styles.assistantSubtitle}
          >
            {translate('assistant.hero.subtitle')}
          </DirectionalText>
        </View>
      </View>
      <ActionButton
        label={translate(primaryAction[1])}
        onPress={() => openAssistant(primaryAction[0])}
      />
      <View
        style={[
          styles.assistantGrid,
          {
            flexDirection: stacked
              ? 'column'
              : direction === 'rtl'
                ? 'row-reverse'
                : 'row'
          }
        ]}
      >
        {suggestions.map(([action, labelKey]) => (
          <ActionButton
            key={action}
            label={translate(labelKey)}
            variant="secondary"
            labelStyle={styles.assistantActionLabel}
            style={
              stacked ? styles.assistantActionStacked : styles.assistantAction
            }
            onPress={() => openAssistant(action)}
          />
        ))}
      </View>
    </View>
  );
}

function SectionTitle({
  children,
  direction
}: {
  children: React.ReactNode;
  direction: 'ltr' | 'rtl';
}) {
  return (
    <DirectionalText
      accessibilityRole="header"
      direction={direction}
      style={styles.sectionTitle}
    >
      {children}
    </DirectionalText>
  );
}

function DirectionalText({
  children,
  direction,
  muted = false,
  style,
  ...props
}: React.ComponentProps<typeof Text> & {
  direction: 'ltr' | 'rtl';
  muted?: boolean;
}) {
  const theme = useTheme();
  return (
    <Text
      {...props}
      style={[
        style,
        {
          color: muted
            ? theme.colors.content.muted
            : theme.colors.content.primary,
          textAlign: direction === 'rtl' ? 'right' : 'left',
          writingDirection: direction
        }
      ]}
    >
      {children}
    </Text>
  );
}

function ReportAmount({
  align,
  color = colorTokens.ink['900'],
  currency,
  hidden,
  size,
  value
}: {
  align: 'left' | 'right';
  color?: string;
  currency: string;
  hidden: boolean;
  size: 'hero' | 'large';
  value: number;
}) {
  const locale = usePreferenceStore((state) => state.locale);
  const formatted = hidden
    ? '••••'
    : formatMinorAmount(value, currency, locale).split('\u00a0')[0];
  return (
    <View
      accessible
      accessibilityLabel={
        hidden
          ? translate('designSystem.privacy.hidden')
          : formatMinorAmount(value, currency, locale)
      }
      style={[
        styles.amountRow,
        { alignSelf: align === 'right' ? 'flex-end' : 'flex-start' }
      ]}
    >
      <Text style={[styles.currencyCode, { color }]}>{currency}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.62}
        numberOfLines={1}
        style={[
          size === 'hero' ? styles.heroAmount : styles.largeAmount,
          { color }
        ]}
      >
        {formatted}
      </Text>
    </View>
  );
}

function monthDatePeriod(anchorDate: LocalDate, timeZone: string): DatePeriod {
  const boundary = buildFinancialPeriod({
    anchorDate,
    monthStartDay: 1,
    preset: 'calendar_month',
    timeZone
  });
  return {
    kind: 'month',
    periodStart: boundary.startInstant,
    periodEnd: boundary.endInstant - 1
  };
}

function formatMonthLabel(
  anchorDate: LocalDate,
  locale: 'ar' | 'en',
  timeZone: string
) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone,
    year: 'numeric'
  }).format(new Date(`${anchorDate}T12:00:00Z`));
}

function moneyInline(value: number, currency: string) {
  const locale = usePreferenceStore.getState().locale;
  return `\u2066${formatMinorAmount(value, currency, locale)}\u2069`;
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg
  },
  ltrCanvas: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr',
    gap: spacing.xl,
    width: '100%'
  },
  header: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52
  },
  headerAction: {
    alignItems: 'center',
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget
  },
  screenTitle: {
    color: colorTokens.ink['900'],
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 40
  },
  selectorRow: {
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  selector: {
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTouchTarget,
    maxWidth: '48%'
  },
  selectorText: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24
  },
  contentStack: {
    gap: spacing.xl
  },
  card: {
    ...elevation.raised,
    backgroundColor: colorTokens.surface.white,
    borderRadius: radius.card,
    borderWidth: 0
  },
  netWorthCard: {
    minHeight: 340,
    padding: spacing.xl
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 23
  },
  amountRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '100%'
  },
  currencyCode: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 28,
    writingDirection: 'ltr'
  },
  heroAmount: {
    flexShrink: 1,
    fontSize: 38,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 48,
    writingDirection: 'ltr'
  },
  largeAmount: {
    flexShrink: 1,
    fontSize: 25,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    lineHeight: 34,
    writingDirection: 'ltr'
  },
  changeBadge: {
    borderRadius: radius.sm,
    marginTop: spacing.md,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  changeText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    writingDirection: 'ltr'
  },
  chartDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  chartDateText: {
    color: colorTokens.ink['500'],
    fontSize: 12,
    lineHeight: 18,
    writingDirection: 'ltr'
  },
  timeframeRow: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginTop: spacing.sm
  },
  timeframeButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: spacing.sm
  },
  timeframeText: {
    fontSize: 15,
    fontWeight: '700',
    writingDirection: 'ltr'
  },
  sectionTitle: {
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 34,
    marginTop: spacing.md
  },
  expenseCard: {
    minHeight: 150,
    padding: spacing.xl
  },
  miniBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    height: 58,
    marginTop: spacing.lg
  },
  miniBar: {
    borderRadius: radius.sm,
    flex: 1,
    minHeight: 4
  },
  metricPair: {
    gap: spacing.md
  },
  metricPairStacked: {
    alignItems: 'stretch'
  },
  smallMetricCard: {
    flex: 1,
    gap: spacing.md,
    minHeight: 176,
    padding: spacing.xl
  },
  negativeLabel: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20
  },
  metricTrack: {
    backgroundColor: colorTokens.raw.E0E0E0,
    borderRadius: radius.pill,
    height: 9,
    justifyContent: 'center',
    marginTop: 'auto'
  },
  metricProgress: {
    alignSelf: 'flex-end',
    borderRadius: radius.pill,
    height: 9,
    width: '62%'
  },
  savingsCard: {
    gap: spacing.lg,
    minHeight: 190,
    padding: spacing.xl
  },
  savingsTop: {
    alignItems: 'flex-start',
    gap: spacing.md,
    justifyContent: 'space-between'
  },
  savingsCopy: {
    flex: 1,
    gap: spacing.sm
  },
  savingsValueRow: {
    alignItems: 'baseline',
    gap: spacing.sm
  },
  savingsPercent: {
    color: colorTokens.ink['900'],
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    lineHeight: 44,
    writingDirection: 'ltr'
  },
  savingsSupport: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 24
  },
  savingsTrack: {
    backgroundColor: colorTokens.raw.E0E0E0,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden'
  },
  savingsProgress: {
    borderRadius: radius.pill,
    height: 8
  },
  savingsFooter: {
    fontSize: 14,
    lineHeight: 21
  },
  navigationCard: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 110,
    padding: spacing.xl
  },
  addCircle: {
    alignItems: 'center',
    backgroundColor: colorTokens.raw.EAF4F4,
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  navigationCopy: {
    flex: 1,
    gap: spacing.xs
  },
  navigationTitle: {
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 27
  },
  navigationSubtitle: {
    fontSize: 14,
    lineHeight: 21
  },
  assistantCard: {
    gap: spacing.lg,
    padding: spacing.xl
  },
  assistantHeader: {
    alignItems: 'center',
    gap: spacing.md
  },
  assistantCopy: {
    flex: 1,
    gap: spacing.xs
  },
  assistantTitle: {
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 27
  },
  assistantSubtitle: {
    fontSize: 14,
    lineHeight: 21
  },
  assistantGrid: {
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  assistantAction: {
    flexBasis: '48%',
    flexGrow: 1
  },
  assistantActionLabel: {
    textAlign: 'center'
  },
  assistantActionStacked: {
    width: '100%'
  }
});
