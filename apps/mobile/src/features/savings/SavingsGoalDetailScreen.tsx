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
  GoalMovement,
  SavingsLifecycle
} from '@/domain/financial-planning';
import {
  PlanningScreen,
  PlanningState,
  planningReason
} from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { usePlanningMutation, useSavingsGoal } from './savings-queries';

export function SavingsGoalDetailScreen({ goalId = '' }: { goalId?: string }) {
  const query = useSavingsGoal(goalId);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const item = query.data?.goal;
  const lifecycle = usePlanningMutation((status: SavingsLifecycle) =>
    financialPlanningService.setGoalStatus(
      goalId,
      item!.version,
      status,
      `goal-status:${goalId}:${status}:${Date.now()}`
    )
  );
  const amount = (minor: number) =>
    hideBalances && !revealed
      ? translate('planning.state.hidden')
      : formatMinorAmount(minor, item?.currencyCode ?? 'SAR', currentLocale());
  const current =
    query.data?.progress.currentMinor.status === 'available'
      ? amount(query.data.progress.currentMinor.value)
      : query.data?.progress.currentMinor.status === 'unavailable'
        ? planningReason(query.data.progress.currentMinor.reason)
        : translate('reports.state.unavailable');
  const percentage =
    query.data?.progress.percentage.status === 'available'
      ? `${query.data.progress.percentage.value}%`
      : query.data?.progress.percentage.status === 'unavailable'
        ? planningReason(query.data.progress.percentage.reason)
        : translate('reports.state.unavailable');
  return (
    <PlanningScreen titleKey="planning.savings.detail">
      {!goalId ? (
        <PlanningState state="empty" />
      ) : query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError || !query.data || !item ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : (
        <>
          <FinancialPulse
            accessibilityLabel={`${item.title}, ${current}, ${percentage}`}
            scope={item.title}
            statement={current}
            supportingValue={percentage}
          />
          <GroupedList label={translate('planning.savings.detail')}>
            <NavigationRow
              label={translate('planning.field.target')}
              value={amount(item.targetMinor)}
            />
            <NavigationRow
              label={translate('planning.savings.targetDate')}
              value={item.targetDate}
            />
            <NavigationRow
              label={translate('planning.field.status')}
              value={translate(
                `planning.savings.status.${item.status}` as MessageKey
              )}
            />
          </GroupedList>
          {financialPlanningService.metadata.kind === 'live' ? (
            <StyledText>{translate('reports.state.unavailable')}</StyledText>
          ) : (
            <ActionButton
              label={translate('planning.savings.addMovement')}
              onPress={() => router.push(`/savings/${goalId}/movement`)}
            />
          )}
          <ActionButton
            label={translate('planning.action.edit')}
            onPress={() => router.push(`/savings/${goalId}/edit`)}
            variant="secondary"
          />
          {item.status === 'active' ? (
            <ActionButton
              label={translate('planning.savings.pause')}
              loading={lifecycle.isPending}
              onPress={() => lifecycle.mutate('paused')}
              variant="secondary"
            />
          ) : null}
          {item.status === 'paused' ? (
            <ActionButton
              label={translate('planning.savings.resume')}
              loading={lifecycle.isPending}
              onPress={() => lifecycle.mutate('active')}
              variant="secondary"
            />
          ) : null}
          {!['completed', 'archived'].includes(item.status) ? (
            <ActionButton
              label={translate('planning.savings.complete')}
              loading={lifecycle.isPending}
              onPress={() => lifecycle.mutate('completed')}
              variant="secondary"
            />
          ) : null}
          <StyledText variant="subtitle">
            {translate('planning.savings.history')}
          </StyledText>
          {!query.data.movements.length ? (
            <StyledText>{translate('planning.savings.noMovements')}</StyledText>
          ) : (
            query.data.movements.map((movement: GoalMovement) => (
              <SurfaceCard key={movement.id}>
                <StyledText>
                  {translate(
                    `planning.savings.movement.${movement.kind}` as MessageKey
                  )}
                </StyledText>
                <StyledText>{amount(movement.amountMinor)}</StyledText>
                <StyledText>{movement.movementDate}</StyledText>
              </SurfaceCard>
            ))
          )}
        </>
      )}
    </PlanningScreen>
  );
}
