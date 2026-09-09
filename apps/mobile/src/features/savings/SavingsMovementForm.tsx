import React, { useState } from 'react';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { FormField } from '@/design-system/components/forms/FormField';
import { parseAmountToMinor } from '@/domain/core-finance';
import type { GoalMovement, LocalDate } from '@/domain/financial-planning';
import {
  PlanningMetric,
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import type { GoalMovementPreview } from '@/services/contracts/financial-planning-service';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { usePlanningMutation, useSavingsGoal } from './savings-queries';

type MovementKind = Extract<
  GoalMovement['kind'],
  'contribution' | 'withdrawal'
>;

export function SavingsMovementForm({ goalId = '' }: { goalId?: string }) {
  const liveLedgerOnly = financialPlanningService.metadata.kind === 'live';
  const goal = useSavingsGoal(goalId);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const [kind, setKind] = useState<MovementKind>('contribution');
  const [amount, setAmount] = useState('');
  const [movementDate, setMovementDate] = useState(
    () => new Date().toISOString().slice(0, 10) as LocalDate
  );
  const [preview, setPreview] = useState<GoalMovementPreview>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const movementKinds: MovementKind[] = ['contribution', 'withdrawal'];
  const movementLabels = movementKinds.map((value) =>
    translate(`planning.savings.movement.${value}` as MessageKey)
  );
  const confirm = usePlanningMutation((value: GoalMovementPreview) =>
    financialPlanningService.confirmGoalMovement(
      value.previewId,
      `goal-movement:${goalId}:${Date.now()}`
    )
  );
  const draftEnabled = Boolean(goal.data) && !liveLedgerOnly;
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: `planning-form-goal-movement:${goalId}`,
    kind: 'goal_movement',
    entityId: goalId || null,
    payload: { kind, amount, movementDate },
    meaningful: Boolean(amount),
    enabled: draftEnabled,
    restore: (payload) => {
      const draft = payload as Partial<{
        kind: MovementKind;
        amount: string;
        movementDate: LocalDate;
      }>;
      if (draft.kind === 'contribution' || draft.kind === 'withdrawal')
        setKind(draft.kind);
      if (typeof draft.amount === 'string') setAmount(draft.amount);
      if (typeof draft.movementDate === 'string')
        setMovementDate(draft.movementDate);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const buildPreview = async () => {
    const amountMinor = parseAmountToMinor(
      amount,
      goal.data?.goal.currencyCode ?? 'SAR'
    );
    if (
      !goal.data ||
      !amountMinor ||
      !/^\d{4}-\d{2}-\d{2}$/.test(movementDate)
    ) {
      setError(translate('planning.validation.required'));
      return;
    }
    setPreviewing(true);
    setError(undefined);
    try {
      setPreview(
        await financialPlanningService.previewGoalMovement({
          goalId,
          kind,
          amountMinor,
          movementDate
        })
      );
    } catch {
      setError(translate('planning.state.error'));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <PlanningScreen titleKey="planning.savings.movement">
      {!goalId ? (
        <PlanningState state="empty" />
      ) : goal.isLoading || (draftEnabled && !draftReady) ? (
        <PlanningState state="loading" />
      ) : goal.isError || !goal.data ? (
        <PlanningState state="error" onRetry={() => void goal.refetch()} />
      ) : liveLedgerOnly ? (
        <StyledText accessibilityRole="alert">
          {translate('reports.state.unavailable')}
        </StyledText>
      ) : preview ? (
        <>
          <PlanningMetric
            labelKey="planning.savings.movementType"
            value={translate(
              `planning.savings.movement.${preview.kind}` as MessageKey
            )}
          />
          <PlanningMetric
            labelKey="planning.savings.movementAmount"
            value={
              hideBalances && !revealed
                ? translate('planning.state.hidden')
                : formatMinorAmount(
                    preview.amountMinor,
                    goal.data.goal.currencyCode,
                    currentLocale()
                  )
            }
          />
          <ActionButton
            label={translate('planning.savings.confirmMovement')}
            loading={confirm.isPending}
            onPress={() =>
              confirm.mutate(preview, {
                onSuccess: () => {
                  setSaved(true);
                  void discardDraft();
                },
                onError: () => setError(translate('planning.state.error'))
              })
            }
          />
          <ActionButton
            label={translate('planning.action.edit')}
            onPress={() => {
              setPreview(undefined);
              setSaved(false);
            }}
            variant="secondary"
          />
          {saved ? (
            <StyledText accessibilityRole="alert">
              {translate('planning.state.saved')}
            </StyledText>
          ) : null}
          {error ? (
            <StyledText accessibilityRole="alert">{error}</StyledText>
          ) : null}
        </>
      ) : (
        <>
          <ChipSelector
            options={movementLabels}
            selected={[
              translate(`planning.savings.movement.${kind}` as MessageKey)
            ]}
            onToggle={(label) =>
              setKind(movementKinds[movementLabels.indexOf(label)] ?? kind)
            }
          />
          <FormField
            label={translate('planning.savings.movementAmount')}
            onChangeText={setAmount}
            value={amount}
            variant="amount"
          />
          <FormField
            label={translate('planning.savings.movementDate')}
            onChangeText={(value) => setMovementDate(value as LocalDate)}
            value={movementDate}
            errorText={error}
          />
          <StyledText>{translate('planning.savings.trackingOnly')}</StyledText>
          <ActionButton
            label={translate('planning.savings.previewMovement')}
            loading={previewing}
            onPress={() => void buildPreview()}
          />
        </>
      )}
    </PlanningScreen>
  );
}
