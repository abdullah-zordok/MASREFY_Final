import React from 'react';
import { router } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FinancialPulse } from '@/design-system/components/financial/FinancialPulse';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import type {
  ObligationLifecycle,
  ObligationPayment
} from '@/domain/financial-planning';
import {
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/mocks/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { useObligation, usePlanningMutation } from './obligation-queries';

export function ObligationDetailScreen({
  obligationId = ''
}: {
  obligationId?: string;
}) {
  const query = useObligation(obligationId);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const lifecycle = usePlanningMutation((status: ObligationLifecycle) =>
    financialPlanningService.setObligationStatus(
      obligationId,
      query.data!.obligation.version,
      status,
      `obligation-status:${obligationId}:${status}:${Date.now()}`
    )
  );
  const reverse = usePlanningMutation((paymentId: string) =>
    financialPlanningService.reverseObligationPayment(
      paymentId,
      `obligation-payment-undo:${paymentId}:${Date.now()}`
    )
  );
  const item = query.data?.obligation;
  const money = (minor: number | null) =>
    minor === null
      ? translate('reports.state.unavailable')
      : hideBalances && !revealed
        ? translate('planning.state.hidden')
        : formatMinorAmount(
            minor,
            item?.currencyCode ?? 'SAR',
            currentLocale()
          );
  const paidMinor = query.data?.status.paidMinor ?? null;
  const remainingMinor =
    query.data?.status.remainingMinor.status === 'available'
      ? query.data.status.remainingMinor.value
      : null;
  return (
    <PlanningScreen titleKey="planning.obligations.detail">
      {!obligationId ? (
        <PlanningState state="empty" />
      ) : query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError || !item ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : (
        <>
          <FinancialPulse
            accessibilityLabel={`${translate('planning.field.remaining')}, ${money(remainingMinor)}, ${translate('planning.obligation.total')}, ${money(item.contractedTotalMinor)}, ${translate('planning.field.paid')}, ${money(paidMinor)}`}
            scope={item.title}
            statement={money(remainingMinor)}
            supportingValue={`${translate('planning.obligation.total')}: ${money(item.contractedTotalMinor)} · ${translate('planning.field.paid')}: ${money(paidMinor)}`}
          />
          <GroupedList label={translate('planning.obligations.detail')}>
            <NavigationRow
              label={translate('planning.field.status')}
              value={translate(
                `planning.obligation.status.${item.status}` as MessageKey
              )}
            />
            <NavigationRow
              label={translate('planning.obligation.schedule')}
              value={String(query.data?.schedule.length ?? 0)}
            />
          </GroupedList>
          <ActionButton
            label={translate('planning.obligation.recordPayment')}
            onPress={() => router.push(`/obligations/${obligationId}/payment`)}
          />
          <ActionButton
            label={translate('planning.action.edit')}
            onPress={() => router.push(`/obligations/${obligationId}/edit`)}
            variant="secondary"
          />
          {item.status === 'active' ? (
            <ActionButton
              label={translate('planning.obligation.pause')}
              loading={lifecycle.isPending}
              onPress={() => lifecycle.mutate('paused')}
              variant="secondary"
            />
          ) : null}
          {item.status === 'paused' ? (
            <ActionButton
              label={translate('planning.obligation.resume')}
              loading={lifecycle.isPending}
              onPress={() => lifecycle.mutate('active')}
              variant="secondary"
            />
          ) : null}
          {!['completed', 'closed', 'archived'].includes(item.status) ? (
            <ActionButton
              label={translate('planning.obligation.complete')}
              loading={lifecycle.isPending}
              onPress={() => lifecycle.mutate('completed')}
              variant="secondary"
            />
          ) : null}
          <StyledText variant="subtitle">
            {translate('planning.obligation.paymentHistory')}
          </StyledText>
          {!query.data?.payments.length ? (
            <StyledText>
              {translate('planning.obligation.noPayments')}
            </StyledText>
          ) : (
            query.data.payments.map((payment: ObligationPayment) => (
              <SurfaceCard key={payment.id}>
                <StyledText>
                  {translate(
                    `planning.obligation.paymentCase.${payment.case}` as MessageKey
                  )}
                </StyledText>
                <StyledText>{money(payment.amountMinor)}</StyledText>
                <StyledText>{payment.paidDate}</StyledText>
                {payment.status === 'posted' ? (
                  <ActionButton
                    label={translate('planning.action.undo')}
                    loading={reverse.isPending}
                    onPress={() => reverse.mutate(payment.id)}
                    variant="secondary"
                  />
                ) : null}
              </SurfaceCard>
            ))
          )}
        </>
      )}
    </PlanningScreen>
  );
}
