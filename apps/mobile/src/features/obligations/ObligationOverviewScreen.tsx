import React, { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import { elevation, radius, spacing } from '@/design-system/tokens';
import { daysBetween, localDateFromTimestamp, type Obligation } from '@/domain/financial-planning';
import { PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, translateDynamic } from '@/localization/i18n';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatDate, formatMinorAmount } from '@/utils/format-financial-value';
import { useObligationsOverview } from './obligation-queries';
import { ObligationHeroHeader, ObligationMetricStrip, ObligationSegmentedControl } from './ObligationVisuals';

type Filter = 'all' | 'upcoming' | 'completed';

export function ObligationOverviewScreen() {
  const query = useObligationsOverview();
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const [filter, setFilter] = useState<Filter>('all');
  const hidden = hideBalances && !revealed;
  const rtl = direction === 'rtl';
  const amount = (minor: number | null, currency = currencyCode) =>
    minor === null
      ? translate('reports.state.unavailable')
      : hidden
        ? translate('planning.state.hidden')
        : formatMinorAmount(minor, currency, currentLocale());
  const totals = (values: Record<string, number | null>) => {
    if (hidden) return translate('planning.state.hidden');
    const entries = Object.entries(values);
    if (!entries.length) return amount(0);
    return entries.map(([currency, minor]) => amount(minor, currency)).join('\n');
  };
  const items = query.data?.items ?? [];
  const visibleItems = items.filter((item) => {
    if (filter === 'completed') return item.status === 'completed' || item.status === 'closed';
    if (filter === 'upcoming') return item.status === 'active';
    return item.status === 'active' || item.status === 'paused';
  });
  const nextItem = items.find((item) => item.id === query.data?.nextDueObligationId);
  const nextDate = query.data?.nextDueDate
    ? formatDate(Date.parse(`${query.data.nextDueDate}T00:00:00Z`), currentLocale())
    : null;
  const daysUntilNext = query.data?.nextDueDate
    ? daysBetween(localDateFromTimestamp(Date.now()), query.data.nextDueDate)
    : null;

  const nextMeta = nextDate
    ? `${nextDate}${daysUntilNext === null ? '' : ` · ${translateDynamic(daysUntilNext < 0 ? 'planning.obligation.overdueBy' : 'planning.obligation.dueIn', { count: Math.abs(daysUntilNext) })}`}`
    : undefined;
  const nextDueAmount = amount(query.data?.nextDueAmountMinor ?? null, nextItem?.currencyCode);
  const filterOptions = (['all', 'upcoming', 'completed'] as const).map((value) => ({
    value,
    label: translate(`planning.obligation.filter.${value}`)
  }));

  return (
    <PlanningScreen titleKey="planning.obligations.title" backgroundColor={theme.colors.surfaces.page} hideHeader>
      {query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : !items.length ? (
        <PlanningState state="empty" />
      ) : (
        <>
          <ObligationHeroHeader
            accessibilityLabel={`${translate('planning.obligation.dueSoon')}, ${nextDueAmount}, ${translate('planning.obligation.currentTotal')}, ${totals(query.data!.payablesByCurrency)}`}
            title={translate('planning.obligations.title')}
            eyebrow={translate('planning.obligation.dueSoon')}
            amount={nextDueAmount}
            description={nextItem?.title ?? translate('planning.obligation.noUpcoming')}
            meta={nextMeta}
            onAction={() => router.push('/obligations/new')}
            testID="obligations-hero"
            variant="overview"
          >
            <ObligationMetricStrip
              accessibilityLabel={`${translate('planning.obligation.totalPayable')}, ${totals(query.data!.payablesByCurrency)}, ${translate('planning.obligation.receivables')}, ${totals(query.data!.receivablesByCurrency)}`}
              metrics={[
                { label: translate('planning.obligation.totalPayable'), value: totals(query.data!.payablesByCurrency), icon: 'wallet' },
                { label: translate('planning.obligation.owedToMe'), value: totals(query.data!.receivablesByCurrency), icon: 'income' },
                { label: translate('planning.obligation.filter.upcoming'), value: String(items.filter((item) => item.status === 'active').length), icon: 'calendar' }
              ]}
              testID="obligations-summary"
              variant="overview"
            />
          </ObligationHeroHeader>

          <ObligationSegmentedControl value={filter} options={filterOptions} onChange={setFilter} testID="obligations-filters" />

          <View style={styles.sectionHeader}>
            <StyledText variant="subtitle" style={styles.sectionTitle}>{translate('planning.obligation.allObligations')}</StyledText>
            <StyledText variant="caption" style={styles.sectionCount}>{translateDynamic('planning.obligation.countLabel', { count: visibleItems.length })}</StyledText>
          </View>
          {!visibleItems.length ? (
            <PlanningState state="empty" />
          ) : (
            visibleItems.map((item) => (
              <ObligationRow
                key={item.id}
                item={item}
                remaining={query.data!.remainingByObligationId[item.id] ?? null}
                hidden={hidden}
                rtl={rtl}
                onPress={() => router.push(`/obligations/${item.id}`)}
              />
            ))
          )}
        </>
      )}
    </PlanningScreen>
  );
}

function ObligationRow({ item, remaining, hidden, rtl, onPress }: { item: Obligation; remaining: number | null; hidden: boolean; rtl: boolean; onPress: () => void }) {
  const theme = useTheme();
  const paid = item.contractedTotalMinor === null || remaining === null ? null : Math.max(0, item.contractedTotalMinor - remaining);
  const percent = paid === null || !item.contractedTotalMinor ? 0 : Math.round((paid / item.contractedTotalMinor) * 100);
  const money = (minor: number | null) =>
    minor === null
      ? translate('reports.state.unavailable')
      : hidden
        ? translate('planning.state.hidden')
        : formatMinorAmount(minor, item.currencyCode, currentLocale());
  const visual = obligationVisual(item.type);
  const iconColors = theme.colors.iconBadges.category[visual.paletteIndex];
  const textAlign = rtl ? 'right' : 'left';
  const amountAlign = rtl ? 'left' : 'right';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.provider ?? ''}, ${translate('planning.field.remaining')}, ${money(remaining)}`} onPress={onPress}>
      <SurfaceCard style={[styles.itemCard, { backgroundColor: theme.colors.surfaces.card, borderColor: theme.colors.borders.subtle }]}>
        <View style={[styles.itemAccent, { backgroundColor: iconColors.foreground }]} />
        <View style={styles.itemTop} testID={`obligation-row-${item.id}`}>
          <View style={styles.itemIdentity}>
            <View style={[styles.categoryIcon, { backgroundColor: iconColors.background, borderColor: iconColors.border }]}>
              <View style={[styles.categoryIconGlow, { backgroundColor: iconColors.foreground }]} />
              <DesignIcon name={visual.icon} decorative color={iconColors.foreground} size="lg" weight="medium" />
            </View>
            <View style={styles.itemCopy}>
              <StyledText adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} variant="subtitle" style={[styles.itemTitle, { color: theme.colors.content.primary, textAlign }]}>{item.title}</StyledText>
              {item.provider ? <StyledText numberOfLines={1} variant="caption" style={[styles.itemProvider, { color: theme.colors.content.secondary, textAlign }]}>{item.provider}</StyledText> : null}
            </View>
          </View>
          <View style={styles.itemAmountGroup}>
            <View style={[styles.itemAmount, { alignItems: rtl ? 'flex-start' : 'flex-end' }]}>
              <StyledText adjustsFontSizeToFit minimumFontScale={0.62} numberOfLines={1} variant="subtitle" style={[styles.remainingAmount, { color: theme.colors.content.primary, textAlign: amountAlign }]}>{money(remaining)}</StyledText>
              <StyledText variant="caption" style={[styles.remainingLabel, { color: theme.colors.content.secondary, textAlign: amountAlign }]}>{translate('planning.field.remaining')}</StyledText>
            </View>
            <View style={[styles.chevronButton, { backgroundColor: theme.colors.surfaceMuted }]}>
              <DesignIcon name="chevronEnd" decorative color={theme.colors.content.primary} direction={rtl ? 'rtl' : 'ltr'} size="sm" weight="medium" />
            </View>
          </View>
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <ObligationProgress percent={percent} rtl={rtl} />
          </View>
          <StyledText variant="subtitle" style={[styles.percent, { color: theme.colors.primary }]}>{percent}%</StyledText>
        </View>
        <StyledText adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.itemPaidLine, { color: theme.colors.content.secondary, textAlign }]} variant="caption">
          {paid === null || item.contractedTotalMinor === null
            ? translate('reports.state.unavailable')
            : translateDynamic('planning.obligation.paidOfTotal', { paid: money(paid), total: money(item.contractedTotalMinor) })}
        </StyledText>
      </SurfaceCard>
    </Pressable>
  );
}

function ObligationProgress({ percent, rtl }: { percent: number; rtl: boolean }) {
  const theme = useTheme();
  const safePercent = Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0;
  const width = `${safePercent}%` as DimensionValue;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${translate('planning.obligation.progress')} ${safePercent}%`}
      accessibilityValue={{ min: 0, max: 100, now: safePercent }}
      style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.borders.subtle }, rtl ? styles.progressRtl : styles.progressLtr]}
    >
      <View style={[styles.progressFill, { width, backgroundColor: theme.colors.primary }]} />
    </View>
  );
}

function obligationVisual(type: Obligation['type']): { icon: DesignIconName; paletteIndex: number } {
  if (type === 'car_installment') return { icon: 'car', paletteIndex: 2 };
  if (type === 'rent') return { icon: 'housing', paletteIndex: 1 };
  if (type === 'subscription') return { icon: 'subscription', paletteIndex: 0 };
  if (type === 'debt') return { icon: 'receipt', paletteIndex: 3 };
  if (type === 'personal_loan') return { icon: 'card', paletteIndex: 2 };
  if (type === 'credit_card_installment') return { icon: 'wallet', paletteIndex: 2 };
  if (type === 'buy_now_pay_later') return { icon: 'shopping', paletteIndex: 1 };
  if (type === 'utility') return { icon: 'bill', paletteIndex: 1 };
  return { icon: 'obligation', paletteIndex: 4 };
}

const styles = StyleSheet.create({
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.xs },
  sectionTitle: { fontSize: 23, lineHeight: 30 },
  sectionCount: { fontSize: 15 },
  itemCard: { ...elevation.raised, borderRadius: 21, gap: spacing.md + 1, overflow: 'hidden', paddingBottom: 15, paddingHorizontal: 15, paddingTop: 17 },
  itemAccent: { borderBottomEndRadius: 21, borderTopEndRadius: 21, bottom: 0, position: 'absolute', start: 0, top: 0, width: 5 },
  itemTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  itemIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  categoryIcon: { alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 51, justifyContent: 'center', overflow: 'hidden', width: 51 },
  categoryIconGlow: { borderRadius: radius.pill, height: 32, opacity: 0.08, position: 'absolute', right: -8, top: -8, width: 32 },
  itemCopy: { flex: 1, gap: 4, minWidth: 0 },
  itemTitle: { fontSize: 17, lineHeight: 23 },
  itemProvider: { fontSize: 12, lineHeight: 17 },
  itemAmountGroup: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: spacing.md },
  itemAmount: { gap: 2, maxWidth: 108, minWidth: 84 },
  remainingAmount: { fontSize: 15, lineHeight: 21 },
  remainingLabel: { fontSize: 12, lineHeight: 17 },
  chevronButton: { alignItems: 'center', borderRadius: radius.pill, height: 40, justifyContent: 'center', width: 40 },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  progressBar: { flex: 1 },
  itemPaidLine: { fontSize: 12, lineHeight: 17 },
  percent: { fontSize: 16, lineHeight: 22, minWidth: 40, textAlign: 'center' },
  progressTrack: { borderRadius: radius.pill, borderWidth: 1, height: 9, overflow: 'hidden' },
  progressFill: { borderRadius: radius.pill, height: '100%' },
  progressLtr: { alignItems: 'flex-start' },
  progressRtl: { alignItems: 'flex-start' }
});
