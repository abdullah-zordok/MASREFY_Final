import React from 'react';
import { View } from 'react-native';

import { ActionButton } from '@/design-system/components/ActionButton';
import { translate, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { usePlanningConflict, usePlanningMutation } from './financial-planning-queries';
import { PlanningMetric, PlanningScreen, PlanningState } from './PlanningScaffold';

export function PlanningConflictScreen({ conflictId = '' }: { conflictId?: string }) {
  const query = usePlanningConflict(conflictId);
  const resolve = usePlanningMutation((resolution: 'keep_local' | 'keep_later') =>
    financialPlanningService.resolveConflict(conflictId, resolution)
  );

  return (
    <PlanningScreen titleKey="planning.conflict.title">
      {!conflictId ? (
        <PlanningState state="empty" />
      ) : query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError || !query.data ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : (
        <>
          <PlanningMetric labelKey="planning.conflict.record" value={`${query.data.entityKind}: ${query.data.entityId}`} />
          <PlanningMetric labelKey="planning.field.status" value={translate(`planning.conflict.status.${query.data.status}` as MessageKey)} />
          <PlanningMetric labelKey="planning.conflict.local" value={safeConflictValue(query.data.localSnapshot)} />
          <PlanningMetric labelKey="planning.conflict.later" value={safeConflictValue(query.data.laterSnapshot)} />
          {query.data.status !== 'resolved' ? (
            <View>
              <ActionButton label={translate('planning.action.keepLocal')} loading={resolve.isPending} onPress={() => resolve.mutate('keep_local')} variant="secondary" />
              <ActionButton label={translate('planning.action.keepLater')} loading={resolve.isPending} onPress={() => resolve.mutate('keep_later')} variant="secondary" />
            </View>
          ) : null}
        </>
      )}
    </PlanningScreen>
  );
}

function safeConflictValue(value: unknown): string {
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id);
  }
  return translate('planning.conflict.valueUnavailable');
}
