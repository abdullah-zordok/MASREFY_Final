import React from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { ConfirmationDialog } from '@/design-system/components/overlays/ConfirmationDialog';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { NavigationRow } from '@/design-system/components/navigation/GroupedList';
import {
  colorTokens,
  elevation,
  radius,
  spacing
} from '@/design-system/tokens';
import { safeMinorSum } from '@/domain/core-finance';
import type { BudgetDetail } from '@/services/contracts/financial-planning-service';
import {
  PlanningScreen,
  PlanningState,
  planningReason
} from '@/features/financial-planning/PlanningScaffold';
import {
  currentLocale,
  translate,
  translateDynamic,
  type MessageKey
} from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { BudgetForm } from './BudgetForm';
import { useBudgets, usePlanningMutation } from './budget-queries';

export function BudgetOverviewScreen({
  periodKey = new Date().toISOString().slice(0, 7)
}: {
  periodKey?: string;
}) {
  const query = useBudgets(periodKey);
  const budgets = query.data ?? [];

  return (
    <PlanningScreen
      backgroundColor={colorTokens.neutral.warmSurface}
      titleKey="planning.budgets.title"
      action={
        budgets.length
          ? {
              labelKey: 'planning.budgets.new',
              onPress: () => router.push('/budgets/new')
            }
          : undefined
      }
    >
      {query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : budgets.length === 0 ? (
        <BudgetForm
          embedded
          initialPeriodKey={periodKey}
          onSaved={() => void query.refetch()}
        />
      ) : (
        <>
          <StyledText variant="caption">{periodKey}</StyledText>
          {budgets.map((detail) => (
            <BudgetCard key={detail.budget.id} detail={detail} />
          ))}
        </>
      )}
    </PlanningScreen>
  );
}

function BudgetCard({ detail }: { detail: BudgetDetail }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const item = detail.budget;
  const lifecycle = usePlanningMutation(
    (status: 'active' | 'paused' | 'deleted') =>
      status === 'deleted'
        ? financialPlanningService.deleteBudget(
            item.id,
            item.version,
            `budget-delete:${item.id}:${Date.now()}`
          )
        : financialPlanningService.setBudgetStatus(
            item.id,
            item.version,
            status,
            `budget-status:${item.id}:${status}:${Date.now()}`
          )
  );
  const amount = (minor: number) =>
    hideBalances && !revealed
      ? translate('planning.state.hidden')
      : formatMinorAmount(minor, item.currencyCode, currentLocale());
  const spend = calculationAmount(detail.progress.eligibleSpendMinor, amount);
  const remaining = calculationAmount(detail.progress.remainingMinor, amount);
  const percentage =
    detail.progress.percentage.status === 'available'
      ? detail.progress.percentage.value
      : 0;
  const total = safeMinorSum(
    item.configuredExpenseLimitMinor,
    item.rolloverCreditMinor
  );
  const status = translate(
    `planning.budget.status.${item.status}` as MessageKey
  );

  return (
    <SurfaceCard
      accessibilityLabel={`${item.name ?? translate('planning.budget.defaultName')}, ${remaining}, ${status}`}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <StyledText variant="subtitle">
          {item.name ?? translate('planning.budget.defaultName')}
        </StyledText>
        {item.status === 'active' ? null : (
          <StyledText variant="caption">{status}</StyledText>
        )}
      </View>
      <StyledText variant="title">
        {total === null
          ? translate('reports.state.unavailable')
          : amount(total)}
      </StyledText>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(100, Math.max(0, percentage))}%` }
          ]}
        />
      </View>
      <View style={styles.metrics}>
        <StyledText variant="caption">
          {translate('planning.budget.spent')}: {spend}
        </StyledText>
        <StyledText variant="caption">
          {translate('planning.budget.remaining')}: {remaining}
        </StyledText>
      </View>
      <StyledText variant="caption">
        {translateDynamic('planning.budget.categoriesAssigned', {
          count: String(detail.categories.length)
        })}
      </StyledText>
      <NavigationRow
        label={translate('planning.budgets.transactions')}
        onPress={() => router.push(`/budgets/transactions/${item.id}`)}
      />
      {detail.categories.length > 1 ? (
        <NavigationRow
          label={translate('planning.budgets.allocation')}
          onPress={() => router.push(`/budgets/allocation/${item.id}`)}
        />
      ) : null}
      <NavigationRow
        label={translate('planning.action.edit')}
        onPress={() => router.push(`/budgets/edit/${item.id}`)}
      />
      {item.status === 'active' ? (
        <ActionButton
          label={translate('planning.budget.pause')}
          loading={lifecycle.isPending}
          onPress={() => lifecycle.mutate('paused')}
          variant="secondary"
        />
      ) : null}
      {item.status === 'paused' ? (
        <ActionButton
          label={translate('planning.budget.resume')}
          loading={lifecycle.isPending}
          onPress={() => lifecycle.mutate('active')}
          variant="secondary"
        />
      ) : null}
      <ActionButton
        label={translate('planning.budget.delete')}
        loading={lifecycle.isPending}
        onPress={() => setConfirmDelete(true)}
        variant="destructive"
      />
      <ConfirmationDialog
        visible={confirmDelete}
        title={translate('planning.budget.delete')}
        message={translate('planning.budget.deleteConfirm')}
        confirmLabel={translate('planning.budget.delete')}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          lifecycle.mutate('deleted');
        }}
      />
    </SurfaceCard>
  );
}

function calculationAmount(
  calculation:
    | { status: 'available'; value: number }
    | { status: 'unavailable'; reason: Parameters<typeof planningReason>[0] },
  amount: (minor: number) => string
): string {
  return calculation.status === 'available'
    ? amount(calculation.value)
    : planningReason(calculation.reason);
}

const styles = StyleSheet.create({
  card: {
    ...elevation.raised,
    backgroundColor: colorTokens.surface.white,
    borderRadius: radius.card,
    borderWidth: 0,
    gap: spacing.sm
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressTrack: {
    backgroundColor: colorTokens.neutral.warmBorder,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden'
  },
  progressFill: {
    backgroundColor: colorTokens.teal[600],
    height: '100%'
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between'
  }
});
