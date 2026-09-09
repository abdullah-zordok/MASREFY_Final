import React, { useState } from 'react';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { RadioCard } from '@/design-system/components/forms/SelectionControls';
import { parseAmountToMinor, type Category } from '@/domain/core-finance';
import type { CategoryBudget } from '@/domain/financial-planning';
import { useCategories } from '@/features/core-finance/core-finance-queries';
import { PlanningMetric, PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { currentLocale, translate } from '@/localization/i18n';
import type { BudgetMovePreview } from '@/services/contracts/financial-planning-service';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { useBudgetById, usePlanningMutation } from './budget-queries';

export function BudgetAllocationEditor({ budgetId = '' }: { budgetId?: string }) {
  const budget = useBudgetById(budgetId);
  const categories = useCategories();
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const allocations = budget.data?.categories ?? [];
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<BudgetMovePreview>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const confirm = usePlanningMutation((value: BudgetMovePreview) =>
    financialPlanningService.confirmBudgetMove(value.previewId, `budget-move:${budgetId}:${Date.now()}`)
  );
  const draftEnabled = Boolean(budget.data);
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: `planning-form-budget-move:${budgetId}`,
    kind: 'budget',
    entityId: budgetId || null,
    payload: { fromId, toId, amount },
    meaningful: Boolean(fromId || toId || amount),
    enabled: draftEnabled,
    restore: (payload) => {
      const draft = payload as Partial<{ fromId: string; toId: string; amount: string }>;
      if (typeof draft.fromId === 'string') setFromId(draft.fromId);
      if (typeof draft.toId === 'string') setToId(draft.toId);
      if (typeof draft.amount === 'string') setAmount(draft.amount);
    },
    onError: () => setError(translate('planning.state.error'))
  });
  const selectedFrom = fromId || allocations[0]?.categoryId || '';
  const selectedTo = toId || allocations.find((item: CategoryBudget) => item.categoryId !== selectedFrom)?.categoryId || '';
  const label = (id: string) => {
    const category = categories.data?.find((item: Category) => item.id === id);
    return currentLocale() === 'ar' ? category?.labelAr ?? id : category?.labelEn ?? id;
  };
  const money = (minor: number) => hideBalances && !revealed ? translate('planning.state.hidden') : formatMinorAmount(minor, budget.data?.budget.currencyCode ?? 'SAR', currentLocale());

  const buildPreview = async () => {
    const amountMinor = parseAmountToMinor(
      amount,
      budget.data?.budget.currencyCode ?? 'SAR'
    );
    if (!amountMinor || !selectedFrom || !selectedTo || selectedFrom === selectedTo) {
      setError(translate('planning.validation.required'));
      return;
    }
    setPreviewing(true);
    setError(undefined);
    try {
      setPreview(await financialPlanningService.previewBudgetMove({ budgetId, fromCategoryId: selectedFrom, toCategoryId: selectedTo, amountMinor }));
    } catch {
      setError(translate('planning.budget.moveInvalid'));
    } finally {
      setPreviewing(false);
    }
  };

  if (!budgetId) return <PlanningScreen titleKey="planning.budgets.allocation"><PlanningState state="empty" /></PlanningScreen>;
  if (budget.isLoading || categories.isLoading || (draftEnabled && !draftReady)) return <PlanningScreen titleKey="planning.budgets.allocation"><PlanningState state="loading" /></PlanningScreen>;
  if (budget.isError || categories.isError || !budget.data) return <PlanningScreen titleKey="planning.budgets.allocation"><PlanningState state="error" onRetry={() => { void budget.refetch(); void categories.refetch(); }} /></PlanningScreen>;
  if (allocations.length < 2) return <PlanningScreen titleKey="planning.budgets.allocation"><PlanningState state="empty" /></PlanningScreen>;

  return (
    <PlanningScreen titleKey="planning.budgets.allocation">
      {preview ? (
        <>
          {preview.categories.filter((item: CategoryBudget) => [selectedFrom, selectedTo].includes(item.categoryId)).map((item: CategoryBudget) => (
            <PlanningMetric key={item.id} labelKey="planning.budget.categoryLimit" value={`${label(item.categoryId)}: ${money(item.limitMinor)}`} />
          ))}
          <PlanningMetric labelKey="planning.budget.expenseLimit" value={money(budget.data.budget.configuredExpenseLimitMinor)} />
          <ActionButton label={translate('planning.budget.confirmMove')} loading={confirm.isPending} onPress={() => confirm.mutate(preview, { onSuccess: () => { setSaved(true); void discardDraft(); }, onError: () => setError(translate('planning.state.error')) })} />
          <ActionButton label={translate('planning.action.edit')} onPress={() => { setPreview(undefined); setSaved(false); }} variant="secondary" />
          {saved ? <StyledText accessibilityRole="alert">{translate('planning.state.saved')}</StyledText> : null}
          {error ? <StyledText accessibilityRole="alert">{error}</StyledText> : null}
        </>
      ) : (
        <>
          <StyledText variant="subtitle">{translate('planning.budget.moveFrom')}</StyledText>
          {allocations.map((item: CategoryBudget) => <RadioCard key={`from-${item.id}`} label={`${label(item.categoryId)} · ${money(item.limitMinor)}`} selected={selectedFrom === item.categoryId} onPress={() => setFromId(item.categoryId)} />)}
          <StyledText variant="subtitle">{translate('planning.budget.moveTo')}</StyledText>
          {allocations.filter((item: CategoryBudget) => item.categoryId !== selectedFrom).map((item: CategoryBudget) => <RadioCard key={`to-${item.id}`} label={`${label(item.categoryId)} · ${money(item.limitMinor)}`} selected={selectedTo === item.categoryId} onPress={() => setToId(item.categoryId)} />)}
          <FormField label={translate('planning.budget.moveAmount')} onChangeText={setAmount} value={amount} variant="amount" errorText={error} />
          <ActionButton label={translate('planning.budget.previewMove')} loading={previewing} onPress={() => void buildPreview()} />
        </>
      )}
    </PlanningScreen>
  );
}
