import React from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FinancialTransition } from '@/design-system/components/financial/FinancialTransition';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon } from '@/design-system/icons';
import { radius, spacing } from '@/design-system/tokens';
import { safeMinorSum } from '@/domain/core-finance';
import { PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatDate, formatMinorAmount } from '@/utils/format-financial-value';
import { ObligationHeroHeader } from './ObligationVisuals';
import { usePaymentMatch, usePlanningMutation } from './payment-queries';

export function PaymentMatchReviewScreen({ matchId = '' }: { matchId?: string }) {
  const query = usePaymentMatch(matchId);
  const theme = useTheme();
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const resolve = usePlanningMutation((input: Parameters<typeof financialPlanningService.resolvePaymentMatch>[0]) =>
    financialPlanningService.resolvePaymentMatch(input, `payment-match:${matchId}:${input.action}`)
  );
  const match = query.data;
  const terminal = match?.status === 'resolved' || match?.status === 'ignored';
  const canConfirm = Boolean(match?.transaction && match.candidate && match.suggestedAllocation && match.transaction.currencyCode === match.candidate.currencyCode);
  const after = match?.candidate && match.suggestedAllocation ? safeMinorSum(match.candidate.remainingMinor, -match.suggestedAllocation.amountMinor) : null;
  const money = (minor: number | null, currency = match?.candidate?.currencyCode ?? 'SAR') =>
    minor === null ? translate('reports.state.unavailable') : hideBalances && !revealed ? translate('planning.state.hidden') : formatMinorAmount(minor, currency, currentLocale());

  return (
    <PlanningScreen titleKey="planning.obligations.match" hideHeader>
      {!matchId ? <PlanningState state="empty" /> : query.isLoading ? <PlanningState state="loading" /> : query.isError || !match ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ObligationHeroHeader
            title={translate('planning.obligations.match')}
            eyebrow={translate(`planning.paymentMatch.status.${match.status}` as MessageKey)}
            amount={match.transaction ? money(match.transaction.amountMinor, match.transaction.currencyCode) : translate('reports.state.unavailable')}
            description={match.transaction?.merchant ?? match.transaction?.title ?? translate('reports.state.unavailable')}
            meta={match.transaction ? `${formatDate(match.transaction.occurredAt, currentLocale())} · ${match.transaction.sourceAccountName ?? translate('reports.state.unavailable')}` : undefined}
            onBack={() => router.back()}
          />
          <SurfaceCard style={styles.card}>
            <View style={styles.cardRow}><View style={styles.cardCopy}><StyledText variant="caption">{translate('planning.paymentMatch.transaction')}</StyledText><StyledText style={styles.amount}>{match.transaction ? money(match.transaction.amountMinor, match.transaction.currencyCode) : translate('reports.state.unavailable')}</StyledText><StyledText variant="subtitle">{match.transaction?.merchant ?? match.transaction?.title ?? translate('reports.state.unavailable')}</StyledText>{match.transaction ? <StyledText variant="caption">{formatDate(match.transaction.occurredAt, currentLocale())} · {match.transaction.sourceAccountName ?? translate('reports.state.unavailable')}</StyledText> : null}</View><View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceMuted }]}><DesignIcon name="card" decorative color={theme.colors.primary} /></View></View>
          </SurfaceCard>
          <View style={styles.connector}><View style={[styles.connectorDot, { backgroundColor: theme.colors.primary }]} /><View style={[styles.connectorLine, { backgroundColor: theme.colors.primary }]} /><View style={[styles.connectorDot, { backgroundColor: theme.colors.primary }]} /></View>
          <SurfaceCard style={styles.card}>
            <View style={styles.cardRow}><View style={styles.cardCopy}><StyledText variant="caption">{translate('planning.paymentMatch.suggestedObligation')}</StyledText><StyledText style={styles.amount}>{match.suggestedAllocation ? money(match.suggestedAllocation.amountMinor) : translate('reports.state.unavailable')}</StyledText><StyledText variant="subtitle">{match.candidate?.title ?? translate('reports.state.unavailable')}</StyledText>{match.candidate?.provider ? <StyledText>{match.candidate.provider}</StyledText> : null}</View><View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceMuted }]}><DesignIcon name="car" decorative color={theme.colors.primary} /></View></View>
          </SurfaceCard>
          <SurfaceCard style={[styles.card, { backgroundColor: theme.colors.surfaces.brandSubtle }]}>
            <View style={styles.confidence}><View style={[styles.checkCircle, { backgroundColor: theme.colors.primary }]}><DesignIcon name="check" decorative color={theme.colors.textInverse} /></View><StyledText variant="subtitle">{translate(match.advisoryConfidence !== null && match.advisoryConfidence >= 0.8 ? 'planning.paymentMatch.confidenceStrong' : 'planning.paymentMatch.confidenceReview')}</StyledText></View>
            {match.reasonCodes.map((reason) => <StyledText key={reason}>• {translate(`planning.paymentMatch.reason.${reason}` as MessageKey)}</StyledText>)}
          </SurfaceCard>
          <FinancialTransition beforeLabel={translate('planning.paymentMatch.remainingBefore')} before={money(match.candidate?.remainingMinor ?? null)} afterLabel={translate('planning.paymentMatch.remainingAfter')} after={money(after)} />
          {!canConfirm && !terminal ? <StyledText accessibilityRole="alert">{translate('planning.paymentMatch.refreshRequired')}</StyledText> : null}
          {!terminal ? <View style={styles.actions}>
            {match.candidate ? <ActionButton disabled={!canConfirm || resolve.isPending} label={translate('planning.paymentMatch.confirm')} loading={resolve.isPending} onPress={() => resolve.mutate({ matchId, obligationId: match.candidate!.id, action: 'confirm' })} /> : null}
            <ActionButton disabled={resolve.isPending} label={translate('planning.paymentMatch.ignore')} loading={resolve.isPending} onPress={() => resolve.mutate({ matchId, obligationId: null, action: 'ignore' })} variant="secondary" />
            {!canConfirm ? <ActionButton label={translate('planning.action.retry')} onPress={() => void query.refetch()} variant="secondary" /> : null}
          </View> : null}
        </>
      )}
    </PlanningScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, gap: spacing.sm },
  cardRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  cardCopy: { flex: 1, gap: spacing.xs },
  iconCircle: { alignItems: 'center', borderRadius: 36, height: 64, justifyContent: 'center', width: 64 },
  amount: { fontSize: 30, fontWeight: '800' },
  connector: { alignItems: 'center', alignSelf: 'center', gap: 3 },
  connectorDot: { borderRadius: 6, height: 12, width: 12 },
  connectorLine: { height: 14, width: 1 },
  confidence: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  checkCircle: { alignItems: 'center', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  actions: { gap: spacing.sm }
});
