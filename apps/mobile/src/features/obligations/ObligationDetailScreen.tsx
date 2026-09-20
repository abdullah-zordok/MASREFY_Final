import React from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { StyledText } from '@/components/StyledText';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, elevation, radius, spacing } from '@/design-system/tokens';
import { localDateFromTimestamp, type Obligation, type ObligationLifecycle, type ObligationPayment, type ObligationScheduleItem } from '@/domain/financial-planning';
import { PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, translateDynamic, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatDate, formatMinorAmount } from '@/utils/format-financial-value';
import { useObligation, usePlanningMutation } from './obligation-queries';

export function ObligationDetailScreen({ obligationId = '' }: { obligationId?: string }) {
  const query = useObligation(obligationId);
  const direction = usePreferenceStore((state) => state.direction);
  const theme = useTheme();
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const hidden = hideBalances && !revealed;
  const rtl = direction === 'rtl';
  const lifecycle = usePlanningMutation((status: ObligationLifecycle) =>
    financialPlanningService.setObligationStatus(obligationId, query.data!.obligation.version, status, `obligation-status:${obligationId}:${status}:${Date.now()}`)
  );
  const reverse = usePlanningMutation((paymentId: string) =>
    financialPlanningService.reverseObligationPayment(paymentId, `obligation-payment-undo:${paymentId}:${Date.now()}`)
  );
  const item = query.data?.obligation;
  const money = (minor: number | null) =>
    minor === null
      ? translate('reports.state.unavailable')
      : hidden
        ? translate('planning.state.hidden')
        : formatMinorAmount(minor, item?.currencyCode ?? 'SAR', currentLocale());
  const paidMinor = query.data?.status.paidMinor ?? null;
  const remainingMinor = query.data?.status.remainingMinor.status === 'available' ? query.data.status.remainingMinor.value : null;
  const contractedTotalMinor = item?.contractedTotalMinor ?? null;
  const progress = paidMinor === null || contractedTotalMinor === null || !contractedTotalMinor
    ? 0
    : Math.max(0, Math.min(100, Math.round((paidMinor / contractedTotalMinor) * 100)));
  const schedule = displaySchedule(query.data?.schedule ?? [], query.data?.payments ?? [], localDateFromTimestamp(Date.now()))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
  const next = schedule.find((entry) => !['paid', 'cancelled'].includes(entry.status));
  const displayProgress = hidden ? 0 : progress;
  const [showMoreActions, setShowMoreActions] = React.useState(false);

  return (
    <PlanningScreen
      titleKey="planning.obligations.detail"
      backgroundColor={theme.colors.surfaces.page}
      hideHeader
    >
      {!obligationId ? <PlanningState state="empty" /> : query.isLoading ? <PlanningState state="loading" /> : query.isError || !item ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ScreenBackButton rtl={rtl} onPress={() => router.back()} />

          <DetailHeader
            item={item}
            provider={item.provider}
            remaining={money(remainingMinor)}
            paid={money(paidMinor)}
            total={money(item.contractedTotalMinor)}
            progress={hidden ? translate('planning.state.hidden') : `${progress}%`}
            progressValue={displayProgress}
            paidLine={
              paidMinor === null || item.contractedTotalMinor === null
                ? translate('reports.state.unavailable')
                : hidden
                  ? translate('planning.state.hidden')
                  : translateDynamic('planning.obligation.paidOfTotal', {
                      paid: rtl ? `\u2066${money(paidMinor)}\u2069` : money(paidMinor),
                      total: rtl ? `\u2066${money(item.contractedTotalMinor)}\u2069` : money(item.contractedTotalMinor)
                    })
            }
            rtl={rtl}
          />

          {next ? (
            <NextInstallmentCard next={next} money={money} rtl={rtl} />
          ) : null}

          <ScheduleCard schedule={schedule} money={money} rtl={rtl} />

          <PrimaryPaymentButton onPress={() => router.push(`/obligations/${obligationId}/payment`)} />

          <View style={styles.secondaryActions}>
            <QuietButton label={translate('planning.action.edit')} onPress={() => router.push(`/obligations/${obligationId}/edit`)} />
            <QuietButton label={translate('planning.obligation.moreActions')} onPress={() => setShowMoreActions((value) => !value)} />
          </View>

          {showMoreActions ? (
            <AdditionalActions
              item={item}
              payments={query.data?.payments ?? []}
              paymentHistoryState={query.data?.paymentHistoryState}
              reverse={reverse}
              money={money}
              lifecycleLoading={lifecycle.isPending}
              reverseLoading={reverse.isPending}
              onPause={() => lifecycle.mutate('paused')}
              onResume={() => lifecycle.mutate('active')}
              onComplete={() => lifecycle.mutate('completed')}
            />
          ) : null}
        </>
      )}
    </PlanningScreen>
  );
}

function ScreenBackButton({ rtl, onPress }: { rtl: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={translate('common.back')}
      onPress={onPress}
      style={[styles.screenBack, { alignSelf: 'flex-start' }]}
    >
      <DesignIcon name="back" decorative color={theme.colors.content.primary} direction={rtl ? 'rtl' : 'ltr'} size="md" />
    </Pressable>
  );
}

function DetailHeader({
  item,
  provider,
  remaining,
  paid,
  total,
  progress,
  progressValue,
  paidLine,
  rtl
}: {
  item: Obligation;
  provider: string | null;
  remaining: string;
  paid: string;
  total: string;
  progress: string;
  progressValue: number;
  paidLine: string;
  rtl: boolean;
}) {
  const theme = useTheme();
  const width = `${Math.min(Math.max(progressValue, 0), 100)}%` as DimensionValue;
  const textAlign = rtl ? 'right' : 'left';
  const alignItems = rtl ? 'flex-end' : 'flex-start';

  return (
    <View
      accessible
      accessibilityLabel={`${translate('planning.field.remaining')}, ${remaining}, ${translate('planning.obligation.total')}, ${total}, ${translate('planning.field.paid')}, ${paid}`}
      style={[styles.detailHeader, { backgroundColor: theme.colors.horizon.heroStart }]}
    >
      <Svg pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="obligation-detail-card" x1={rtl ? '1' : '0'} x2={rtl ? '0' : '1'} y1="0" y2="1">
            <Stop offset="0" stopColor={theme.colors.horizon.heroStart} />
            <Stop offset="1" stopColor={colorTokens.raw['0F6B58']} />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#obligation-detail-card)" height="100%" width="100%" />
      </Svg>

      <View testID="obligation-detail-title-copy" style={[styles.headerTitleCopy, { alignItems }]}>
        <StyledText numberOfLines={2} testID="obligation-detail-title" variant="title" style={[styles.headerTitle, { color: theme.colors.textInverse, textAlign, writingDirection: rtl ? 'rtl' : 'ltr' }]}>{item.title}</StyledText>
        {provider ? <StyledText numberOfLines={1} testID="obligation-detail-provider" style={[styles.headerProvider, { color: colorTokens.raw.CFE0DA, textAlign, writingDirection: rtl ? 'rtl' : 'ltr' }]}>{provider}</StyledText> : null}
      </View>
      <View style={[styles.remainingBlock, { alignItems }]}>
        <StyledText style={[styles.remainingHeaderLabel, { color: colorTokens.raw.E1ECE8, textAlign }]}>{translate('planning.field.remaining')}</StyledText>
        <StyledText adjustsFontSizeToFit minimumFontScale={0.48} numberOfLines={1} variant="amount" style={[styles.remainingHeaderAmount, { color: theme.colors.textInverse, textAlign }]}>{remaining}</StyledText>
      </View>
      <View style={[styles.headerProgressRow, { flexDirection: 'row' }]}>
        <StyledText style={styles.headerPercent}>{progress}</StyledText>
        <View style={styles.headerProgressTrack}>
          <View testID="obligation-detail-progress-fill" style={[styles.headerProgressFill, { width }, rtl ? styles.progressFillRtl : styles.progressFillLtr]} />
        </View>
      </View>
      <StyledText adjustsFontSizeToFit minimumFontScale={0.48} numberOfLines={1} style={[styles.headerPaidLine, { color: colorTokens.raw.E1ECE8, textAlign, writingDirection: rtl ? 'rtl' : 'ltr' }]}>{paidLine}</StyledText>
    </View>
  );
}

function NextInstallmentCard({ next, money, rtl }: { next: ObligationScheduleItem; money: (minor: number | null) => string; rtl: boolean }) {
  const theme = useTheme();
  const textAlign = rtl ? 'right' : 'left';
  return (
    <SurfaceCard accessibilityLabel={`${translate('planning.obligation.nextInstallment')}, ${money(next.scheduledMinor)}, ${formatLocalDate(next.dueDate)}`} style={[styles.nextCard, { flexDirection: 'row' }]}>
      <View style={[styles.nextCopy, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <StyledText variant="subtitle" style={[styles.nextTitle, { textAlign }]}>{translate('planning.obligation.nextInstallment')}</StyledText>
        <StyledText adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} variant="subtitle" style={[styles.nextAmount, { textAlign }]}>{money(next.scheduledMinor)}</StyledText>
        <StyledText style={[styles.nextDate, { color: theme.colors.content.secondary, textAlign }]}>{formatLocalDate(next.dueDate)}</StyledText>
      </View>
      <View style={styles.nextIconBadge}>
        <DesignIcon name="calendar" decorative color={theme.colors.primary} size="md" />
      </View>
    </SurfaceCard>
  );
}

function ScheduleCard({ schedule, money, rtl }: { schedule: ObligationScheduleItem[]; money: (minor: number | null) => string; rtl: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? schedule : schedule.slice(0, 4);
  const canExpand = schedule.length > visible.length;
  const theme = useTheme();

  return (
    <SurfaceCard style={styles.scheduleCard}>
      <View style={[styles.scheduleHeader, { flexDirection: 'row' }]}>
        <StyledText variant="title" style={[styles.scheduleTitle, { textAlign: rtl ? 'right' : 'left' }]}>{translate('planning.obligation.installmentSchedule')}</StyledText>
        {canExpand ? (
          <Pressable accessibilityRole="button" accessibilityLabel={translate('planning.obligation.showAll')} onPress={() => setExpanded(true)} style={styles.showAll}>
            <StyledText style={[styles.showAllText, { color: theme.colors.primary }]}>{translate('planning.obligation.showAll')}</StyledText>
          </Pressable>
        ) : null}
      </View>
      {visible.map((entry, index) => (
        <ScheduleRow
          key={entry.id}
          entry={entry}
          money={money}
          first={index === 0}
          last={index === visible.length - 1}
          rtl={rtl}
        />
      ))}
    </SurfaceCard>
  );
}

function ScheduleRow({ entry, money, first, last, rtl }: { entry: ObligationScheduleItem; money: (minor: number | null) => string; first: boolean; last: boolean; rtl: boolean }) {
  const theme = useTheme();
  const status = scheduleStatusVisual(entry.status, theme.colors);
  const textAlign = rtl ? 'right' : 'left';
  return (
    <View accessible accessibilityLabel={`${translateDynamic('planning.obligation.installmentNumber', { count: entry.sequence })}, ${formatLocalDate(entry.dueDate)}, ${money(entry.scheduledMinor)}, ${translate(`planning.obligation.scheduleStatus.${entry.status}` as MessageKey)}`} testID={`obligation-detail-schedule-row-${entry.sequence}`} style={[styles.scheduleRow, { flexDirection: 'row', borderTopColor: first ? 'transparent' : theme.colors.borders.subtle }]}>
      <View style={styles.timelineCell}>
        {first ? null : <View style={[styles.timelineLine, styles.timelineLineTop]} />}
        {last ? null : <View style={[styles.timelineLine, styles.timelineLineBottom]} />}
        <View style={[styles.timelineNode, first ? styles.timelineNodeActive : styles.timelineNodeIdle]} />
      </View>
      <View style={[styles.scheduleCopy, { alignItems: rtl ? 'flex-end' : 'flex-start' }]}>
        <StyledText variant="subtitle" style={[styles.installmentLabel, { textAlign }]}>{translateDynamic('planning.obligation.installmentNumber', { count: entry.sequence })}</StyledText>
        <StyledText adjustsFontSizeToFit minimumFontScale={0.68} numberOfLines={1} style={[styles.scheduleDateText, { color: theme.colors.content.secondary, textAlign }]}>{formatLocalDate(entry.dueDate)}</StyledText>
      </View>
      <StyledText adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.installmentAmount}>{money(entry.scheduledMinor)}</StyledText>
      <View style={[styles.statusChip, { backgroundColor: status.background }]}>
        <StyledText adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.statusChipText, { color: status.foreground }]}>{translate(`planning.obligation.scheduleStatus.${entry.status}` as MessageKey)}</StyledText>
      </View>
    </View>
  );
}

function PrimaryPaymentButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={translate('planning.obligation.recordPayment')} onPress={onPress} style={[styles.primaryPayment, { backgroundColor: theme.colors.primary }]}>
      <DesignIcon name="add" decorative color={theme.colors.textInverse} size="sm" weight="medium" />
      <StyledText variant="subtitle" style={[styles.primaryPaymentText, { color: theme.colors.textInverse }]}>{translate('planning.obligation.recordPayment')}</StyledText>
    </Pressable>
  );
}

function QuietButton({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: loading }} disabled={loading} onPress={onPress} style={[styles.quietButton, loading && styles.disabledAction]}>
      <StyledText adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.quietButtonText, { color: theme.colors.primary }]}>{label}</StyledText>
    </Pressable>
  );
}

function AdditionalActions({
  item,
  payments,
  paymentHistoryState,
  reverse,
  money,
  lifecycleLoading,
  reverseLoading,
  onPause,
  onResume,
  onComplete
}: {
  item: Obligation;
  payments: readonly ObligationPayment[];
  paymentHistoryState?: 'available' | 'unavailable';
  reverse: { mutate: (paymentId: string) => void };
  money: (minor: number | null) => string;
  lifecycleLoading: boolean;
  reverseLoading: boolean;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
}) {
  const theme = useTheme();
  return (
    <SurfaceCard style={styles.morePanel}>
      <View style={styles.moreActionRow}>
        {item.status === 'active' ? <QuietButton label={translate('planning.obligation.pause')} loading={lifecycleLoading} onPress={onPause} /> : null}
        {item.status === 'paused' ? <QuietButton label={translate('planning.obligation.resume')} loading={lifecycleLoading} onPress={onResume} /> : null}
        {!['completed', 'closed', 'archived'].includes(item.status) ? <QuietButton label={translate('planning.obligation.complete')} loading={lifecycleLoading} onPress={onComplete} /> : null}
      </View>
      <View style={styles.paymentHistory}>
        <StyledText variant="subtitle" style={styles.paymentHistoryTitle}>{translate('planning.obligation.paymentHistory')}</StyledText>
        {paymentHistoryState === 'unavailable' ? (
          <StyledText style={{ color: theme.colors.content.secondary }}>{translate('reports.state.unavailable')}</StyledText>
        ) : !payments.length ? (
          <StyledText style={{ color: theme.colors.content.secondary }}>{translate('planning.obligation.noPayments')}</StyledText>
        ) : (
          payments.map((payment, index) => (
            <View key={payment.id} style={[styles.paymentRow, { borderTopColor: index === 0 ? 'transparent' : theme.colors.borders.subtle }]}>
              <View style={styles.paymentCopy}>
                <StyledText>{translate(`planning.obligation.paymentCase.${payment.case}` as MessageKey)}</StyledText>
                <StyledText variant="caption" style={{ color: theme.colors.content.secondary }}>{formatLocalDate(payment.paidDate)}</StyledText>
              </View>
              <View style={styles.paymentValue}>
                <StyledText variant="subtitle">{money(payment.amountMinor)}</StyledText>
                {payment.status === 'posted' ? (
                  <QuietButton label={translate('planning.action.undo')} loading={reverseLoading} onPress={() => reverse.mutate(payment.id)} />
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>
    </SurfaceCard>
  );
}

function formatLocalDate(value: string) {
  return formatDate(Date.parse(`${value}T00:00:00Z`), currentLocale());
}

function displaySchedule(
  schedule: readonly ObligationScheduleItem[],
  payments: readonly ObligationPayment[],
  today: string
): ObligationScheduleItem[] {
  const paidByScheduleId = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== 'posted') continue;
    for (const allocation of payment.allocations) {
      paidByScheduleId.set(allocation.scheduleItemId, (paidByScheduleId.get(allocation.scheduleItemId) ?? 0) + allocation.amountMinor);
    }
  }
  return schedule.map((entry) => {
    if (entry.status === 'paid' || entry.status === 'cancelled') return entry;
    const paid = paidByScheduleId.get(entry.id) ?? 0;
    const status = paid >= entry.scheduledMinor ? 'paid' : paid > 0 ? 'partial' : entry.dueDate < today ? 'overdue' : 'upcoming';
    return { ...entry, status };
  });
}

function scheduleStatusVisual(
  status: ObligationScheduleItem['status'],
  colors: ReturnType<typeof useTheme>['colors']
) {
  if (status === 'paid') {
    return colors.iconBadges.primary;
  }
  if (status === 'overdue') {
    return colors.iconBadges.danger;
  }
  if (status === 'partial') {
    return colors.iconBadges.warning;
  }
  if (status === 'cancelled') {
    return colors.iconBadges.neutral;
  }
  return colors.iconBadges.primary;
}

const styles = StyleSheet.create({
  screenBack: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    marginBottom: -spacing.xs,
    width: 44
  },
  detailHeader: {
    ...elevation.raised,
    borderRadius: 24,
    gap: spacing.md,
    minHeight: 246,
    overflow: 'hidden',
    padding: spacing.lg
  },
  headerTitleCopy: { ...layoutDirectionStyle('ltr'), flexShrink: 1, gap: 2, minWidth: 0, width: '100%' },
  headerTitle: { fontSize: 22, lineHeight: 30, width: '100%' },
  headerProvider: { fontSize: 14, lineHeight: 20, width: '100%' },
  remainingBlock: {
    ...layoutDirectionStyle('ltr'),
    gap: 2,
    width: '100%'
  },
  remainingHeaderLabel: { fontSize: 14, lineHeight: 20, width: '100%' },
  remainingHeaderAmount: { fontSize: 34, lineHeight: 42, width: '100%' },
  headerProgressRow: {
    alignItems: 'center',
    gap: spacing.sm
  },
  headerPercent: {
    color: colorTokens.surface.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    minWidth: 44,
    textAlign: 'center'
  },
  headerProgressTrack: {
    backgroundColor: colorTokens.raw['46756C'],
    borderRadius: radius.pill,
    flex: 1,
    height: 8,
    overflow: 'hidden'
  },
  headerProgressFill: {
    backgroundColor: colorTokens.raw.C0E5D7,
    borderRadius: radius.pill,
    height: '100%',
    position: 'absolute',
    top: 0
  },
  progressFillRtl: { right: 0 },
  progressFillLtr: { left: 0 },
  headerPaidLine: { ...layoutDirectionStyle('ltr'), fontSize: 13, lineHeight: 20, width: '100%' },
  nextCard: {
    alignItems: 'center',
    borderColor: colorTokens.raw.E7E9E6,
    borderRadius: radius.card,
    justifyContent: 'space-between',
    minHeight: 104,
    padding: spacing.lg
  },
  nextCopy: { ...layoutDirectionStyle('ltr'), flex: 1, gap: 5, minWidth: 0 },
  nextIconBadge: {
    alignItems: 'center',
    backgroundColor: colorTokens.raw.E3F7F2,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  nextTitle: { fontSize: 16, lineHeight: 22, width: '100%' },
  nextAmount: { fontSize: 24, lineHeight: 30, width: '100%' },
  nextDate: { fontSize: 14, lineHeight: 20, width: '100%' },
  scheduleCard: {
    borderColor: colorTokens.raw.E7E9E6,
    borderRadius: radius.card,
    gap: 0,
    padding: spacing.lg
  },
  scheduleHeader: {
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  scheduleTitle: { fontSize: 20, lineHeight: 28 },
  showAll: { justifyContent: 'center', minHeight: 36 },
  showAllText: { fontSize: 13, fontWeight: '600' },
  scheduleRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    gap: spacing.sm,
    minHeight: 78,
    paddingVertical: spacing.sm
  },
  timelineCell: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    width: 22
  },
  timelineLine: {
    backgroundColor: colorTokens.raw.C0E5D7,
    position: 'absolute',
    width: 1
  },
  timelineLineTop: {
    bottom: '50%',
    top: -spacing.md
  },
  timelineLineBottom: {
    bottom: -spacing.md,
    top: '50%'
  },
  timelineNode: {
    borderRadius: radius.pill,
    height: 14,
    width: 14
  },
  timelineNodeActive: {
    backgroundColor: colorTokens.raw['0F6B58'],
    borderColor: colorTokens.raw.E3F7F2,
    borderWidth: 3
  },
  timelineNodeIdle: {
    backgroundColor: colorTokens.surface.white,
    borderColor: colorTokens.teal[500],
    borderWidth: 2
  },
  scheduleDateText: { fontSize: 13, lineHeight: 18, width: '100%' },
  scheduleCopy: { ...layoutDirectionStyle('ltr'), flex: 1, gap: 3, minWidth: 0 },
  installmentLabel: { fontSize: 16, lineHeight: 22, width: '100%' },
  installmentAmount: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'center',
    width: 104
  },
  statusChip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 48,
    paddingHorizontal: spacing.sm
  },
  statusChipText: { fontSize: 11, fontWeight: '600' },
  primaryPayment: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52
  },
  primaryPaymentText: { fontSize: 16, lineHeight: 22 },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  quietButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md
  },
  quietButtonText: { fontSize: 14, fontWeight: '600' },
  disabledAction: { opacity: 0.6 },
  morePanel: {
    borderRadius: 18,
    gap: spacing.md,
    padding: spacing.lg
  },
  moreActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  paymentHistory: { gap: spacing.xs },
  paymentHistoryTitle: { fontSize: 17, lineHeight: 24 },
  paymentRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm
  },
  paymentCopy: { flex: 1, gap: 2, minWidth: 0 },
  paymentValue: { alignItems: 'flex-end', gap: 2 }
});
