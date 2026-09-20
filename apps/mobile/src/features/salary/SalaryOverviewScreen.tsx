import React from 'react';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop
} from 'react-native-svg';

import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon } from '@/design-system/icons';
import {
  colorTokens,
  elevation,
  radius,
  spacing,
  typography
} from '@/design-system/tokens';
import type { Calculation } from '@/domain/financial-planning';
import type { MoneyValue } from '@/domain/core-finance';
import { localDateInTimeZone } from '@/domain/financial-period';
import {
  PlanningScreen,
  PlanningState,
  planningReason
} from '@/features/financial-planning/PlanningScaffold';
import {
  currentLocale,
  translate,
  translateDynamic
} from '@/localization/i18n';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { useSalaryOverview } from './salary-queries';

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function formatMoney(
  calculation: Calculation<MoneyValue>,
  hideBalances: boolean,
  revealed: boolean
): string {
  if (calculation.status === 'unavailable') {
    return planningReason(calculation.reason);
  }
  if (hideBalances && !revealed) {
    return translate('planning.state.hidden');
  }
  return formatMinorAmount(
    calculation.value.minorUnits,
    calculation.value.currencyCode,
    currentLocale()
  );
}

function formatLocalDate(isoDate: string, locale: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const tag = locale === 'ar' ? 'ar-u-nu-latn' : 'en-US-u-nu-latn';
  return new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

/* ─── Screen ──────────────────────────────────────────────────────────── */

export function SalaryOverviewScreen() {
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const query = useSalaryOverview(
    localDateInTimeZone(Date.now(), timeZone),
    timeZone
  );
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const theme = useTheme();
  const storedDirection = usePreferenceStore((state) => state.direction);
  const locale = currentLocale();
  const direction = locale === 'ar' ? 'rtl' : storedDirection;
  const largeText = PixelRatio.getFontScale() >= 1.25;

  const data = query.data;
  const money = (calc: Calculation<MoneyValue>) =>
    formatMoney(calc, hideBalances, revealed);
  const nextSalaryDate = data?.projectedNextSalaryDate
    ? formatLocalDate(data.projectedNextSalaryDate, locale)
    : translate('planning.conflict.valueUnavailable');

  return (
    <PlanningScreen
      titleKey="planning.salary.title"
      backgroundColor={theme.colors.surfaces.page}
      hideHeader
    >
      {query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError || !data ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : data.dataState === 'empty' && !data.profileId ? (
        <SalaryEmptyState direction={direction} theme={theme} />
      ) : (
        <View style={styles.screenStack}>
          <SalaryCycleHeader
            direction={direction}
            income={money(data.income)}
            remaining={money(data.remaining)}
            daily={money(data.suggestedDaily)}
            daysRemaining={translateDynamic('planning.salary.daysRemaining', {
              count: data.daysRemaining
            })}
            largeText={largeText}
          />

          <Text
            style={[
              styles.detailsTitle,
              {
                color: theme.colors.content.primary,
                textAlign: 'left'
              }
            ]}
          >
            {translate('planning.salary.cycleDetails')}
          </Text>

          <SalaryDetailsCard
            direction={direction}
            spent={money(data.expenses)}
            reserved={money(data.reservedObligations)}
            nextSalaryDate={nextSalaryDate}
          />

          <ActionButton
            label={translate('planning.salary.editSettings')}
            onPress={() => router.push('/salary/profile')}
            style={styles.primaryAction}
            labelStyle={styles.primaryActionLabel}
          />
        </View>
      )}
    </PlanningScreen>
  );
}

function SalaryEmptyState({
  direction,
  theme
}: {
  direction: 'rtl' | 'ltr';
  theme: ReturnType<typeof useTheme>;
}) {
  const textAlign = direction === 'rtl' ? 'right' : 'left';

  return (
    <SurfaceCard
      style={[
        styles.emptyCard,
        {
          backgroundColor: theme.colors.surfaces.brandSubtle,
          borderColor: theme.colors.borders.subtle
        }
      ]}
    >
      <View
        style={[styles.emptyIcon, { backgroundColor: theme.colors.surface }]}
      >
        <DesignIcon
          name="salary"
          label={translate('planning.salary.emptyTitle')}
          color={theme.colors.interactions.primary}
          size="hero"
          decorative
        />
      </View>
      <View style={styles.emptyCopy}>
        <Text
          accessibilityRole="header"
          style={[
            styles.emptyTitle,
            { color: theme.colors.content.primary, textAlign }
          ]}
        >
          {translate('planning.salary.emptyTitle')}
        </Text>
        <Text
          style={[
            styles.emptySubtitle,
            { color: theme.colors.content.secondary, textAlign }
          ]}
        >
          {translate('planning.salary.emptySubtitle')}
        </Text>
      </View>
      <ActionButton
        label={translate('planning.salary.setup')}
        onPress={() => router.push('/salary/profile')}
      />
    </SurfaceCard>
  );
}

/* ─── Redesigned overview ─────────────────────────────────────────────── */

function SalaryCycleHeader({
  direction,
  income,
  remaining,
  daily,
  daysRemaining,
  largeText
}: {
  direction: 'rtl' | 'ltr';
  income: string;
  remaining: string;
  daily: string;
  daysRemaining: string;
  largeText: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${translate('planning.salary.yourCycle')}, ${translate('planning.salary.cycleSalary')}, ${income}`}
      style={styles.hero}
    >
      <Svg height="100%" style={StyleSheet.absoluteFillObject} width="100%">
        <Defs>
          <LinearGradient id="salaryHero" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor={colorTokens.teal[700]} />
            <Stop offset="0.48" stopColor={colorTokens.raw['00B8A6']} />
            <Stop offset="1" stopColor={colorTokens.teal[900]} />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#salaryHero)" height="100%" width="100%" />
        <Circle
          cx={direction === 'rtl' ? '6%' : '94%'}
          cy="0"
          fill={colorTokens.effects.glassStrong}
          r="150"
        />
        <Circle
          cx={direction === 'rtl' ? '85%' : '15%'}
          cy="86%"
          fill={colorTokens.effects.glass}
          r="130"
        />
      </Svg>
      <View style={styles.heroContent}>
        <Text
          accessibilityRole="header"
          style={[
            styles.heroTitle,
            { textAlign: 'left' }
          ]}
        >
          {translate('planning.salary.yourCycle')}
        </Text>
        <View style={styles.heroAmountBlock}>
          <Text
            style={[
              styles.heroLabel,
              { textAlign: 'left' }
            ]}
          >
            {translate('planning.salary.cycleSalary')}
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.66}
            numberOfLines={1}
            style={[
              styles.heroAmount,
              largeText ? styles.heroAmountLargeText : undefined,
              { textAlign: 'left' }
            ]}
          >
            {income}
          </Text>
        </View>
        <View
          style={[
            styles.summaryStrip,
            { flexDirection: 'row' }
          ]}
        >
          <SummaryCell
            icon="wallet"
            label={translate('planning.salary.remainingMine')}
            value={remaining}
          />
          <SummaryCell
            dividerStart
            dividerEnd
            icon="card"
            label={translate('planning.salary.dailyInsight')}
            value={daily}
          />
          <SummaryCell
            icon="calendar"
            label={translate('planning.salary.daysUntilSalary')}
            value={daysRemaining}
          />
        </View>
      </View>
    </View>
  );
}

function SummaryCell({
  icon,
  label,
  value,
  dividerStart = false,
  dividerEnd = false
}: {
  icon: 'wallet' | 'card' | 'calendar';
  label: string;
  value: string;
  dividerStart?: boolean;
  dividerEnd?: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${label}, ${value}`}
      style={[
        styles.summaryCell,
        dividerStart ? styles.summaryDividerStart : undefined,
        dividerEnd ? styles.summaryDividerEnd : undefined
      ]}
    >
      <DesignIcon name={icon} color={colorTokens.surface.white} decorative />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        numberOfLines={1}
        style={styles.summaryValue}
      >
        {value}
      </Text>
      <Text numberOfLines={2} style={styles.summaryLabel}>
        {label}
      </Text>
    </View>
  );
}

function SalaryDetailsCard({
  direction,
  spent,
  reserved,
  nextSalaryDate
}: {
  direction: 'rtl' | 'ltr';
  spent: string;
  reserved: string;
  nextSalaryDate: string;
}) {
  return (
    <SurfaceCard
      accessibilityLabel={translate('planning.salary.cycleDetails')}
      style={styles.detailsCard}
    >
      <DetailRow
        direction={direction}
        dotColor={colorTokens.raw.EF5350}
        label={translate('planning.salary.spent')}
        value={spent}
        valueDirection="ltr"
      />
      <DetailRow
        direction={direction}
        dotColor={colorTokens.raw['42A5F5']}
        label={translate('planning.salary.reservedForObligations')}
        value={reserved}
        valueDirection="ltr"
      />
      <DetailRow
        direction={direction}
        dotColor={colorTokens.raw.A7F3D0}
        label={translate('planning.salary.nextSalaryMine')}
        last
        value={nextSalaryDate}
      />
    </SurfaceCard>
  );
}

function DetailRow({
  direction,
  label,
  value,
  dotColor,
  valueDirection,
  last = false
}: {
  direction: 'rtl' | 'ltr';
  label: string;
  value: string;
  dotColor: string;
  valueDirection?: 'ltr' | 'rtl';
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        { flexDirection: 'row' },
        last ? undefined : styles.detailRowBorder
      ]}
    >
      <View
        style={[
          styles.detailLabelGroup,
          { flexDirection: 'row' }
        ]}
      >
        <View style={[styles.detailDot, { backgroundColor: dotColor }]} />
        <Text numberOfLines={2} style={styles.detailLabel}>
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={[
          styles.detailValue,
          {
            textAlign: direction === 'rtl' ? 'left' : 'right',
            writingDirection: valueDirection
          }
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: radius.card,
    gap: spacing.lg,
    padding: spacing.lg
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: radius.card,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  emptyCopy: {
    gap: spacing.xs
  },
  emptyTitle: {
    ...typography.subtitle,
    fontSize: 20
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 22
  },
  screenStack: {
    gap: spacing.xl
  },
  hero: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    minHeight: 336,
    overflow: 'hidden'
  },
  heroContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl
  },
  heroTitle: {
    color: colorTokens.surface.white,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 36,
    width: '100%'
  },
  heroAmountBlock: {
    gap: spacing.sm
  },
  heroLabel: {
    color: colorTokens.teal[50],
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 26,
    width: '100%'
  },
  heroAmount: {
    color: colorTokens.surface.white,
    fontSize: 46,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    lineHeight: 54,
    width: '100%',
    writingDirection: 'ltr'
  },
  heroAmountLargeText: {
    fontSize: 38,
    lineHeight: 46
  },
  summaryStrip: {
    alignItems: 'stretch',
    backgroundColor: colorTokens.effects.glassStrong,
    borderColor: colorTokens.effects.glassBorder,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 108,
    overflow: 'hidden'
  },
  summaryCell: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md
  },
  summaryDividerStart: {
    borderStartColor: colorTokens.effects.glassBorder,
    borderStartWidth: 1
  },
  summaryDividerEnd: {
    borderEndColor: colorTokens.effects.glassBorder,
    borderEndWidth: 1
  },
  summaryValue: {
    color: colorTokens.surface.white,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    writingDirection: 'ltr'
  },
  summaryLabel: {
    color: colorTokens.teal[50],
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center'
  },
  detailsTitle: {
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 34,
    marginTop: spacing.md,
    width: '100%'
  },
  detailsCard: {
    ...elevation.raised,
    borderColor: 'transparent',
    borderRadius: 18,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md
  },
  detailRow: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 70
  },
  detailRowBorder: {
    borderBottomColor: colorTokens.neutral.warmBorder,
    borderBottomWidth: 1
  },
  detailLabelGroup: {
    alignItems: 'center',
    flexShrink: 1,
    gap: spacing.md
  },
  detailDot: {
    borderRadius: 5,
    height: 10,
    width: 10
  },
  detailLabel: {
    color: colorTokens.ink[900],
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 26
  },
  detailValue: {
    color: colorTokens.ink[900],
    flexShrink: 0,
    fontSize: 19,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 27,
    maxWidth: '46%'
  },
  primaryAction: {
    backgroundColor: colorTokens.raw['00B8A6'],
    borderColor: colorTokens.raw['00B8A6'],
    borderRadius: 18,
    minHeight: 64
  },
  primaryActionLabel: {
    color: colorTokens.surface.white,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: spacing.xs
  }
});
