import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { FormField } from '@/design-system/components/forms/FormField';
import { PickerField } from '@/design-system/components/forms/PickerField';
import { SwitchRow } from '@/design-system/components/forms/SelectionControls';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import {
  colorTokens,
  elevation,
  radius,
  spacing
} from '@/design-system/tokens';
import { minorToMajorAmountText } from '@/domain/currencies';
import { parseAmountToMinor, type Category } from '@/domain/core-finance';
import {
  FinancialPlanningError,
  type CategoryBudget
} from '@/domain/financial-planning';
import type { BudgetDetail } from '@/services/contracts/financial-planning-service';
import { openCategorySelection } from '@/features/categories/category-selection-session';
import { useCategories } from '@/features/core-finance/core-finance-queries';
import {
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import {
  currentLocale,
  translate,
  translateDynamic
} from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import {
  useBudgetById,
  useBudgets,
  usePlanningMutation
} from './budget-queries';

interface BudgetFormProps {
  budgetId?: string;
  embedded?: boolean;
  initialPeriodKey?: string;
  onSaved?: () => void;
}

export function BudgetForm({
  budgetId = '',
  embedded = false,
  initialPeriodKey,
  onSaved
}: BudgetFormProps) {
  const existing = useBudgetById(budgetId);
  const categories = useCategories();
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const owningCurrencyCode = existing.data?.budget.currencyCode ?? currencyCode;
  const [name, setName] = useState('');
  const [periodKey, setPeriodKey] = useState(
    () => initialPeriodKey ?? new Date().toISOString().slice(0, 7)
  );
  const [expenseLimit, setExpenseLimit] = useState('');
  const [categoryLimits, setCategoryLimits] = useState<Record<string, string>>(
    {}
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [copiedFromBudgetId, setCopiedFromBudgetId] = useState<string | null>(
    null
  );
  const [copySheetOpen, setCopySheetOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const monthBudgets = useBudgets(periodKey);
  const previousBudgets = useBudgets(previousPeriod(periodKey));
  const save = usePlanningMutation(
    (input: Parameters<typeof financialPlanningService.saveBudget>[0]) =>
      financialPlanningService.saveBudget(
        input,
        `budget:${budgetId || input.periodKey}:${Date.now()}`
      )
  );

  useEffect(() => {
    if (!existing.data) return;
    setName(
      existing.data.budget.name ?? translate('planning.budget.defaultName')
    );
    setPeriodKey(existing.data.budget.periodKey);
    setExpenseLimit(
      minorToMajorAmountText(
        existing.data.budget.configuredExpenseLimitMinor,
        existing.data.budget.currencyCode
      )
    );
    setRolloverEnabled(existing.data.budget.rolloverEnabled);
    setCopiedFromBudgetId(existing.data.budget.copiedFromBudgetId);
    setCategoryLimits(
      Object.fromEntries(
        existing.data.categories.map((item: CategoryBudget) => [
          item.categoryId,
          minorToMajorAmountText(
            item.limitMinor,
            existing.data.budget.currencyCode
          )
        ])
      )
    );
    setSelectedCategoryIds(
      existing.data.categories.map((category) => category.categoryId)
    );
  }, [existing.data]);

  const draftEnabled = !budgetId || Boolean(existing.data);
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: `planning-form-budget:${budgetId || 'new'}`,
    kind: 'budget',
    entityId: budgetId || null,
    payload: {
      name,
      periodKey,
      expenseLimit,
      categoryLimits,
      selectedCategoryIds,
      rolloverEnabled,
      copiedFromBudgetId
    },
    meaningful: Boolean(
      name || expenseLimit || selectedCategoryIds.length
    ),
    enabled: draftEnabled,
    restore: (payload) => {
      const draft = payload as Partial<{
        name: string;
        periodKey: string;
        expenseLimit: string;
        categoryLimits: Record<string, string>;
        selectedCategoryIds: string[];
        rolloverEnabled: boolean;
        copiedFromBudgetId: string | null;
      }>;
      if (typeof draft.name === 'string') setName(draft.name);
      if (typeof draft.periodKey === 'string') setPeriodKey(draft.periodKey);
      if (typeof draft.expenseLimit === 'string')
        setExpenseLimit(draft.expenseLimit);
      if (draft.categoryLimits && typeof draft.categoryLimits === 'object')
        setCategoryLimits(draft.categoryLimits);
      if (Array.isArray(draft.selectedCategoryIds))
        setSelectedCategoryIds(draft.selectedCategoryIds);
      if (typeof draft.rolloverEnabled === 'boolean')
        setRolloverEnabled(draft.rolloverEnabled);
      if (
        typeof draft.copiedFromBudgetId === 'string' ||
        draft.copiedFromBudgetId === null
      )
        setCopiedFromBudgetId(draft.copiedFromBudgetId);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const categoryOwners = useMemo(
    () =>
      new Map(
        (monthBudgets.data ?? [])
          .filter((detail) => detail.budget.id !== budgetId)
          .flatMap((detail) =>
            detail.categories.map(
              (category) =>
                [
                  category.categoryId,
                  detail.budget.name ??
                    translate('planning.budget.defaultName')
                ] as const
            )
          )
      ),
    [budgetId, monthBudgets.data]
  );

  const eligibleCategories =
    categories.data?.filter(
      (category: Category) =>
        !['salary', 'other-income', 'transfers'].includes(category.id)
    ) ?? [];
  const activeCategoryId =
    selectedCategoryId ||
    eligibleCategories.find((category) => !categoryOwners.has(category.id))
      ?.id ||
    '';
  const activeCategory = eligibleCategories.find(
    (category: Category) => category.id === activeCategoryId
  );
  const ownerLines = eligibleCategories.flatMap((category) => {
    const owner = categoryOwners.get(category.id);
    if (!owner) return [];
    const label =
      currentLocale() === 'ar' ? category.labelAr : category.labelEn;
    return [`${label} — ${owner}`];
  });

  const applyCopy = (detail: BudgetDetail) => {
    setName(
      detail.budget.name ?? translate('planning.budget.defaultName')
    );
    setExpenseLimit(
      minorToMajorAmountText(
        detail.budget.configuredExpenseLimitMinor,
        owningCurrencyCode
      )
    );
    setRolloverEnabled(detail.budget.rolloverEnabled);
    setCopiedFromBudgetId(detail.budget.id);
    setCategoryLimits(
      Object.fromEntries(
        detail.categories
          .filter((category) => !categoryOwners.has(category.categoryId))
          .map((category) => [
            category.categoryId,
            minorToMajorAmountText(category.limitMinor, owningCurrencyCode)
          ])
      )
    );
    setSelectedCategoryIds(
      detail.categories
        .filter((category) => !categoryOwners.has(category.categoryId))
        .map((category) => category.categoryId)
    );
    setCopySheetOpen(false);
    setError(undefined);
  };

  const copyPrevious = () => {
    const candidates = previousBudgets.data ?? [];
    if (!candidates.length) {
      setError(translate('planning.budget.noPrevious'));
      return;
    }
    if (candidates.length === 1) {
      applyCopy(candidates[0]);
      return;
    }
    setCopySheetOpen(true);
  };

  const submit = () => {
    const configuredExpenseLimitMinor = parseAmountToMinor(
      expenseLimit,
      owningCurrencyCode
    );
    if (
      !name.trim() ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey) ||
      configuredExpenseLimitMinor === null
    ) {
      setError(translate('planning.validation.required'));
      return;
    }
    const now = Date.now();
    const budgetCategories = selectedCategoryIds.map((categoryId) => {
        const limitMinor =
          parseAmountToMinor(
            categoryLimits[categoryId] ?? '',
            owningCurrencyCode
          ) ?? 0;
        const prior = existing.data?.categories.find(
          (item: CategoryBudget) => item.categoryId === categoryId
        );
        return {
            id:
              prior?.id ??
              `category-budget-${budgetId || periodKey}-${categoryId}`,
            version: prior?.version ?? 1,
            syncStatus: prior?.syncStatus ?? ('pending' as const),
            createdAt: prior?.createdAt ?? now,
            updatedAt: now,
            budgetId: budgetId || 'pending',
            categoryId,
            limitMinor,
            alertThresholds: prior?.alertThresholds ?? [80, 90, 100],
            status: 'active' as const
          };
      });
    save.mutate(
      {
        id: budgetId || undefined,
        expectedVersion: existing.data?.budget.version,
        name: name.trim(),
        periodKey,
        currencyCode: owningCurrencyCode,
        configuredExpenseLimitMinor,
        incomeTargetMinor: existing.data?.budget.incomeTargetMinor ?? 0,
        savingsTargetMinor: existing.data?.budget.savingsTargetMinor ?? 0,
        rolloverEnabled,
        rolloverCreditMinor: existing.data?.budget.rolloverCreditMinor ?? 0,
        categories: budgetCategories,
        copiedFromBudgetId
      },
      {
        onSuccess: () => {
          setSaved(true);
          setError(undefined);
          void discardDraft();
          onSaved?.();
          if (!embedded && !budgetId) router.replace('/budgets');
        },
        onError: (cause) =>
          setError(
            cause instanceof FinancialPlanningError
              ? cause.code === 'duplicate' &&
                cause.details?.kind === 'category'
                ? translateDynamic('planning.budget.error.categoryConflict', {
                    owner: cause.details.owner ||
                      translate('planning.budget.defaultName')
                  })
                : translate(
                    cause.code === 'duplicate'
                      ? 'planning.budget.error.duplicateName'
                      : cause.code === 'conflict'
                        ? 'planning.budget.error.stale'
                        : 'planning.state.error'
                  )
              : translate('planning.state.error')
          )
      }
    );
  };

  if (existing.isError || categories.isError || monthBudgets.isError)
    return (
      <PlanningScreen
        backgroundColor={colorTokens.neutral.warmSurface}
        titleKey={budgetId ? 'planning.budgets.edit' : 'planning.budgets.new'}
      >
        <PlanningState
          state="error"
          onRetry={() => {
            void existing.refetch();
            void categories.refetch();
            void monthBudgets.refetch();
          }}
        />
      </PlanningScreen>
    );
  if (
    (budgetId && existing.isLoading) ||
    categories.isLoading ||
    (draftEnabled && !draftReady)
  )
    return embedded ? (
      <PlanningState state="loading" />
    ) : (
      <PlanningScreen
        backgroundColor={colorTokens.neutral.warmSurface}
        titleKey={budgetId ? 'planning.budgets.edit' : 'planning.budgets.new'}
      >
        <PlanningState state="loading" />
      </PlanningScreen>
    );

  const fields = (
    <View style={{ gap: spacing.md }}>
      {embedded ? (
        <StyledText variant="subtitle">
          {translate('planning.budgets.new')}
        </StyledText>
      ) : null}
      <SurfaceCard
        style={{
          ...elevation.raised,
          borderRadius: radius.card,
          borderWidth: 0,
          gap: spacing.md
        }}
      >
        <FormField
          label={translate('planning.budget.name')}
          onChangeText={setName}
          value={name}
        />
        <FormField
          label={translate('planning.budget.period')}
          onChangeText={setPeriodKey}
          value={periodKey}
        />
        <FormField
          label={translate('planning.budget.expenseLimit')}
          onChangeText={setExpenseLimit}
          value={expenseLimit}
          variant="amount"
        />
        {!budgetId ? (
          <ActionButton
            label={translate('planning.budget.copyPrevious')}
            loading={previousBudgets.isLoading}
            onPress={copyPrevious}
            variant="secondary"
          />
        ) : null}
      </SurfaceCard>

      <SurfaceCard
        style={{
          ...elevation.raised,
          borderRadius: radius.card,
          borderWidth: 0,
          gap: spacing.md
        }}
      >
        <StyledText variant="subtitle">
          {translate('planning.budget.categoryLimits')}
        </StyledText>
        {ownerLines.map((line) => (
          <StyledText key={line} variant="caption">
            {line}
          </StyledText>
        ))}
        <PickerField
          label={translate('coreFinance.transaction.category')}
          value={
            activeCategory
              ? currentLocale() === 'ar'
                ? activeCategory.labelAr
                : activeCategory.labelEn
              : undefined
          }
          placeholder={translate('reports.state.unavailable')}
          onPress={() =>
            openCategorySelection({
              selectedId: activeCategoryId,
              excludedIds: [
                'salary',
                'other-income',
                'transfers',
                ...categoryOwners.keys()
              ],
              onSelect: (categoryId) => {
                if (categoryId) {
                  setSelectedCategoryId(categoryId);
                  setSelectedCategoryIds((current) =>
                    current.includes(categoryId)
                      ? current
                      : [...current, categoryId]
                  );
                }
              }
            })
          }
        />
        {activeCategoryId ? (
          <FormField
            label={translate('planning.budget.categoryLimit')}
            onChangeText={(value) =>
              setCategoryLimits((current) => ({
                ...current,
                [activeCategoryId]: value
              }))
            }
            value={categoryLimits[activeCategoryId] ?? ''}
            variant="amount"
          />
        ) : null}
        <SwitchRow
          label={translate('planning.budget.rollover')}
          value={rolloverEnabled}
          onValueChange={setRolloverEnabled}
        />
      </SurfaceCard>

      <ActionButton
        disabled={
          !name.trim() ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey) ||
          parseAmountToMinor(expenseLimit, owningCurrencyCode) === null
        }
        label={translate('planning.action.save')}
        loading={save.isPending}
        onPress={submit}
      />
      {error ? (
        <StyledText accessibilityRole="alert">{error}</StyledText>
      ) : null}
      {saved ? (
        <StyledText accessibilityRole="alert">
          {translate('planning.state.saved')}
        </StyledText>
      ) : null}
      <AppSheet
        title={translate('planning.budget.copyPrevious')}
        visible={copySheetOpen}
        onDismiss={() => setCopySheetOpen(false)}
      >
        <View style={{ gap: spacing.sm }}>
          {(previousBudgets.data ?? []).map((detail) => (
            <ActionButton
              key={detail.budget.id}
              label={
                detail.budget.name ??
                translate('planning.budget.defaultName')
              }
              onPress={() => applyCopy(detail)}
              variant="secondary"
            />
          ))}
        </View>
      </AppSheet>
    </View>
  );

  if (embedded) return fields;
  return (
    <PlanningScreen
      backgroundColor={colorTokens.neutral.warmSurface}
      titleKey={budgetId ? 'planning.budgets.edit' : 'planning.budgets.new'}
    >
      {fields}
    </PlanningScreen>
  );
}

function previousPeriod(periodKey: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) return '';
  const month = new Date(`${periodKey}-01T00:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() - 1);
  return month.toISOString().slice(0, 7);
}
