import { Platform } from 'react-native';
import { getCurrencyMinorUnitScale } from '@/domain/currencies';
import {
  emptyTransactionFilters,
  safeMinorSum,
  type Transaction
} from '@/domain/core-finance';
import { isDemoModeEnabled } from '@/config/demo-mode';
import type { Locale } from '@/domain/foundation';
import { createDemoFinancialPlanningSeed } from '@/domain/financial-planning-seeds';
import {
  applyPaymentEarliestFirst,
  calculateBudgetProgress,
  deriveObligationStatus,
  deriveSalaryCycle,
  deriveSavingsProgress,
  expectedDateForMonth,
  FinancialPlanningError,
  localDateFromTimestamp,
  scorePaymentMatch,
  validateCategoryBudgets,
  type Budget,
  type LocalDate,
  type Obligation,
  type ObligationPayment,
  type ObligationScheduleItem,
  type PaymentMatch,
  type PlanningDraft,
  type PlanningOverview,
  type SalaryReceiptLink,
  type SavingsGoal
} from '@/domain/financial-planning';
import { localDateInTimeZone } from '@/domain/financial-period';
import type { MutationResult } from '@/services/contracts/core-finance-service';
import type {
  BudgetDetail,
  BudgetInput,
  BudgetMoveInput,
  BudgetMovePreview,
  FinancialPlanningService,
  GoalMovementInput,
  GoalMovementPreview,
  GoalQuery,
  ObligationDetail,
  ObligationInput,
  ObligationPage,
  ObligationPaymentInput,
  ObligationPaymentPreview,
  ObligationQuery,
  ObligationsOverview,
  PaymentMatchQuery,
  PaymentMatchResolution,
  SalaryProfileInput,
  SalaryReceiptConfirmation,
  SalaryReceiptOutcome,
  EarlySettlementPreview,
  SavingsGoalDetail,
  SavingsGoalInput
} from '@/services/contracts/financial-planning-service';
import { financialPlanningServiceCapability } from '@/services/contracts/financial-planning-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import type { CapabilityProviderKind } from '@/services/contracts/capability-contract';
import { FinancialPlanningRepository } from '@/storage/financial-planning-repository';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';
import { coreFinanceService } from './core-finance-service';
import { fixtureTransactions } from '@/test-utils/core-finance-fixtures';
import {
  financialPlanningSeed,
  fixtureSalaryTransaction
} from './financial-planning-fixtures';

export function createMockFinancialPlanningService(
  repository = new FinancialPlanningRepository(),
  persistent = false,
  transactionReader: () => Promise<Transaction[]> = async () => [
    fixtureSalaryTransaction,
    ...fixtureTransactions
  ],
  options: {
    now?: () => number;
    registerForReset?: boolean;
    providerKind?: CapabilityProviderKind;
  } = {}
): CapabilityProviderHandle<FinancialPlanningService> {
  let hydration: Promise<void> | null = null;
  const previews = new Map<string, unknown>();
  const ensureReady = () => {
    if (!persistent) return Promise.resolve();
    hydration ??= repository.hydrate();
    return hydration;
  };
  const now = options.now ?? Date.now;
  if (options.registerForReset)
    registerRuntimeUserDataReset(() => {
      repository.reset();
      previews.clear();
      hydration = null;
    });
  const readTransactions = transactionReader;
  const persistIfNeeded = async () => {
    if (persistent) await repository.persistAll();
  };

  return {
    metadata: {
      id:
        options.providerKind === 'live'
          ? 'local-financial-planning'
          : 'mock-financial-planning',
      capability: financialPlanningServiceCapability.capability,
      majorVersion: financialPlanningServiceCapability.majorVersion,
      kind: options.providerKind ?? 'mock',
      availability: 'available'
    },
    async getReportingSnapshot() {
      await ensureReady();
      return {
        salaryReceipts: repository.listSalaryReceipts(),
        budgets: repository.listBudgets(),
        categoryBudgets: repository
          .listBudgets()
          .flatMap((budget) => repository.listCategoryBudgets(budget.id)),
        obligations: repository.listObligations(),
        obligationPayments: repository.listPayments(),
        savingsGoals: repository.listGoals(),
        goalMovements: repository.listGoalMovements(),
        dataState: 'complete',
        completenessReasons: []
      };
    },
    async getPlanningOverview(input): Promise<PlanningOverview> {
      await ensureReady();
      const transactions = await readTransactions();
      const timeZone = resolvePlanningTimeZone(input.timeZone);
      const salary = deriveSalaryCycle({
        profile: repository.activeSalaryProfile(),
        receipts: repository.listSalaryReceipts(),
        transactions,
        today: input.today,
        timeZone
      });
      const budget = repository
        .listBudgets()
        .filter((item) => item.status !== 'deleted')
        .sort((a, b) => b.periodKey.localeCompare(a.periodKey))[0];
      const obligations = repository.listObligations();
      const obligationDue = obligations.reduce((sum, obligation) => {
        const status = deriveObligationStatus({
          obligation,
          schedule: repository.listSchedule(obligation.id),
          payments: repository.listPayments(obligation.id),
          today: input.today
        });
        return (
          sum +
          (status.remainingMinor.status === 'available'
            ? status.remainingMinor.value
            : 0)
        );
      }, 0);
      return {
        dataState: 'ready',
        salary,
        budget: budget
          ? calculateBudgetProgress({
              budget,
              transactions,
              categoryIds: repository
                .listCategoryBudgets(budget.id)
                .map((category) => category.categoryId),
              today: input.today,
              timeZone
            })
          : null,
        obligationsDueMinor: {
          status: 'available',
          value: {
            minorUnits: obligationDue,
            currencyCode: input.currencyCode,
            scale: getCurrencyMinorUnitScale(input.currencyCode)
          },
          estimated: false,
          asOf: null
        },
        savings: repository.listGoals().map((goal) =>
          deriveSavingsProgress({
            goal,
            movements: repository.listGoalMovements(goal.id),
            today: input.today
          })
        )
      };
    },
    async getSalaryOverview(input) {
      await ensureReady();
      const timeZone = resolvePlanningTimeZone(input.timeZone);
      const profile = repository.activeSalaryProfile();
      const receipts = repository.listSalaryReceipts();
      const transactions = await readTransactions();
      let obligationsReserved = 0;
      if (profile) {
        const obligations = repository.listObligations();
        for (const obligation of obligations) {
          if (obligation.status !== 'active') continue;
          const schedule = repository.listSchedule(obligation.id);
          const payments = repository.listPayments(obligation.id);
          const paid = new Set(
            payments
              .filter((p) => p.status === 'posted')
              .flatMap((p) => p.allocations.map((a) => a.scheduleItemId))
          );
          const linked = receipts
            .filter(
              (r) => r.status === 'linked' && r.salaryProfileId === profile.id
            )
            .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate));
          if (linked.length) {
            const cycleStart = linked[0].receivedDate;
            const cycleEnd = profile.nextExpectedDate;
            for (const item of schedule) {
              if (item.status === 'cancelled' || item.status === 'paid')
                continue;
              if (paid.has(item.id)) continue;
              if (item.dueDate >= cycleStart && item.dueDate < cycleEnd) {
                obligationsReserved += item.scheduledMinor;
              }
            }
          }
        }
      }
      return deriveSalaryCycle({
        profile,
        receipts,
        transactions,
        obligationsReservedMinor: obligationsReserved,
        today: input.today,
        timeZone
      });
    },
    async getSalaryReceiptReview(transactionId) {
      await ensureReady();
      return (
        repository
          .listSalaryReceipts()
          .find(
            (receipt) =>
              receipt.id === transactionId ||
              receipt.transactionId === transactionId
          ) ?? null
      );
    },
    async saveSalaryProfile(input: SalaryProfileInput, operationId: string) {
      await ensureReady();
      const current = new Date(now());
      const nextExpectedDate = expectedDateForMonth(
        current.getUTCFullYear(),
        current.getUTCMonth() + 1,
        input.salaryDay
      );
      const value = repository.saveSalaryProfile(
        {
          ...input,
          nextExpectedDate,
          automaticDetectionEnabled: input.automaticDetectionEnabled ?? false
        },
        operationId
      );
      await persistIfNeeded();
      return result(value, salaryScopes());
    },
    async confirmSalaryReceipt(
      input: SalaryReceiptConfirmation,
      operationId: string
    ) {
      await ensureReady();
      const profile = repository.activeSalaryProfile();
      if (!profile || profile.id !== input.salaryProfileId) {
        throw new FinancialPlanningError('not_found');
      }
      const receipt = repository.confirmSalaryReceipt(
        {
          salaryProfileId: input.salaryProfileId,
          transactionId: input.transactionId,
          expectedOccurrenceDate: input.expectedOccurrenceDate,
          receivedDate: input.receivedDate,
          operationId,
          replacesReceiptId: input.replacesReceiptId ?? null
        },
        operationId
      );
      await persistIfNeeded();
      return salaryOutcome(
        repository,
        receipt,
        operationId,
        await readTransactions(),
        now(),
        input.timeZone
      );
    },
    async undoSalaryReceipt(
      receiptId: string,
      operationId: string,
      timeZone?: string
    ) {
      await ensureReady();
      const receipt = repository.undoSalaryReceipt(receiptId, operationId);
      await persistIfNeeded();
      return salaryOutcome(
        repository,
        receipt,
        operationId,
        await readTransactions(),
        now(),
        timeZone
      );
    },
    async getBudget(periodKey: string) {
      await ensureReady();
      const budget = repository.getBudgetByPeriod(periodKey);
      return budget
        ? budgetDetail(
            repository,
            budget,
            localDateFromTimestamp(now()),
            await readTransactions()
          )
        : null;
    },
    async listBudgets(periodKey: string) {
      await ensureReady();
      const transactions = await readTransactions();
      return repository
        .listBudgets(periodKey)
        .filter((budget) => budget.status !== 'deleted')
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
        .map((budget) =>
          budgetDetail(
            repository,
            budget,
            localDateFromTimestamp(now()),
            transactions
          )
        );
    },
    async getBudgetById(id: string) {
      await ensureReady();
      return budgetDetail(
        repository,
        repository.requireBudget(id),
        localDateFromTimestamp(now()),
        await readTransactions()
      );
    },
    async createBudgetDraftFromPrevious(periodKey: string) {
      await ensureReady();
      const month = new Date(`${periodKey}-01T00:00:00Z`);
      month.setUTCMonth(month.getUTCMonth() - 1);
      const previousPeriodKey = month.toISOString().slice(0, 7);
      const previous = repository.getBudgetByPeriod(previousPeriodKey);
      return repository.saveDraft({
        id: `draft-budget-${periodKey}`,
        kind: 'budget',
        entityId: null,
        payload: previous
          ? {
              periodKey,
              configuredExpenseLimitMinor: previous.configuredExpenseLimitMinor,
              incomeTargetMinor: previous.incomeTargetMinor,
              savingsTargetMinor: previous.savingsTargetMinor,
              rolloverEnabled: previous.rolloverEnabled,
              copiedFromBudgetId: previous.id,
              categories: repository.listCategoryBudgets(previous.id)
            }
          : { periodKey },
        status: 'editing',
        updatedAt: now()
      });
    },
    async saveBudget(input: BudgetInput, operationId: string) {
      await ensureReady();
      const prior = repository.operationResult<Budget>(operationId);
      if (prior) return result(prior, budgetScopes(prior.id));
      const name = input.name.trim();
      if (!name) throw new FinancialPlanningError('validation');
      repository.assertCategoriesAvailable(
        input.periodKey,
        (input.categories ?? [])
          .filter((category) => category.status !== 'deleted')
          .map((category) => category.categoryId),
        input.id
      );
      if (input.categories) {
        validateCategoryBudgets(
          {
            configuredExpenseLimitMinor: input.configuredExpenseLimitMinor,
            rolloverCreditMinor: input.rolloverCreditMinor ?? 0
          },
          input.categories
        );
      }
      const budget = repository.saveBudget(
        {
          id: input.id,
          expectedVersion: input.expectedVersion,
          name,
          periodKey: input.periodKey,
          currencyCode: input.currencyCode,
          configuredExpenseLimitMinor: input.configuredExpenseLimitMinor,
          incomeTargetMinor: input.incomeTargetMinor,
          savingsTargetMinor: input.savingsTargetMinor,
          rolloverEnabled: input.rolloverEnabled ?? false,
          rolloverCreditMinor: input.rolloverCreditMinor ?? 0,
          copiedFromBudgetId: input.copiedFromBudgetId ?? null
        },
        operationId
      );
      if (input.categories) {
        repository.replaceCategoryBudgets(
          budget.id,
          input.categories.map((category) => ({
            ...category,
            budgetId: budget.id
          }))
        );
      }
      await persistIfNeeded();
      return result(budget, budgetScopes(budget.id));
    },
    async previewBudgetMove(
      input: BudgetMoveInput
    ): Promise<BudgetMovePreview> {
      await ensureReady();
      const categories = repository.listCategoryBudgets(input.budgetId);
      const next = categories.map((category) => {
        if (category.categoryId === input.fromCategoryId) {
          return {
            ...category,
            limitMinor: category.limitMinor - input.amountMinor
          };
        }
        if (category.categoryId === input.toCategoryId) {
          return {
            ...category,
            limitMinor: category.limitMinor + input.amountMinor
          };
        }
        return category;
      });
      if (next.some((category) => category.limitMinor < 0)) {
        throw new FinancialPlanningError('validation');
      }
      validateCategoryBudgets(repository.requireBudget(input.budgetId), next);
      const previewId = `budget-move-${now()}`;
      const preview = { previewId, budgetId: input.budgetId, categories: next };
      previews.set(previewId, preview);
      return preview;
    },
    async confirmBudgetMove(previewId: string, _operationId: string) {
      await ensureReady();
      const preview = previews.get(previewId) as BudgetMovePreview | undefined;
      if (!preview) throw new FinancialPlanningError('stale_preview');
      repository.replaceCategoryBudgets(preview.budgetId, preview.categories);
      await persistIfNeeded();
      return result(
        budgetDetail(
          repository,
          repository.requireBudget(preview.budgetId),
          localDateFromTimestamp(now()),
          await readTransactions()
        ),
        budgetScopes(preview.budgetId)
      );
    },
    async setBudgetStatus(id, expectedVersion, status, operationId) {
      await ensureReady();
      const value = repository.setBudgetStatus(
        id,
        expectedVersion,
        status,
        operationId
      );
      await persistIfNeeded();
      return result(value, budgetScopes(id));
    },
    async deleteBudget(id, expectedVersion, operationId) {
      await ensureReady();
      const value = repository.setBudgetStatus(
        id,
        expectedVersion,
        'deleted',
        operationId
      );
      await persistIfNeeded();
      return result(value, budgetScopes(id));
    },
    async getObligationsOverview(input: ObligationQuery) {
      await ensureReady();
      const items = repository.listObligations(input.status);
      const overview: ObligationsOverview = {
        payablesByCurrency: {},
        receivablesByCurrency: {},
        remainingByObligationId: {},
        nextDueDate: null,
        items
      };
      for (const obligation of items) {
        const status = deriveObligationStatus({
          obligation,
          schedule: repository.listSchedule(obligation.id),
          payments: repository.listPayments(obligation.id),
          today: localDateFromTimestamp(now())
        });
        overview.remainingByObligationId[obligation.id] =
          status.remainingMinor.status === 'available'
            ? status.remainingMinor.value
            : null;
        if (obligation.status !== 'active') continue;
        const totals =
          obligation.direction === 'payable'
            ? overview.payablesByCurrency
            : overview.receivablesByCurrency;
        const current = totals[obligation.currencyCode];
        if (status.remainingMinor.status !== 'available') {
          totals[obligation.currencyCode] = null;
        } else if (current !== null) {
          totals[obligation.currencyCode] = safeMinorSum(
            current ?? 0,
            status.remainingMinor.value
          );
        }
        if (
          status.nextDueDate &&
          (!overview.nextDueDate || status.nextDueDate < overview.nextDueDate)
        ) {
          overview.nextDueDate = status.nextDueDate;
        }
      }
      return overview;
    },
    async listObligations(input): Promise<ObligationPage> {
      await ensureReady();
      const items = repository.listObligations(input.status);
      return { items, nextCursor: null, total: items.length };
    },
    async getObligation(id): Promise<ObligationDetail> {
      await ensureReady();
      return obligationDetail(repository, id, localDateFromTimestamp(now()));
    },
    async createObligation(input: ObligationInput, operationId: string) {
      await ensureReady();
      const obligation = repository.saveObligation(
        normalizeObligation(input),
        operationId
      );
      repository.replaceSchedule(obligation.id, buildSchedule(obligation));
      await persistIfNeeded();
      return result(obligation, obligationScopes(obligation.id));
    },
    async updateObligation(id, expectedVersion, input, operationId) {
      await ensureReady();
      const current = repository.requireObligation(id);
      if (current.version !== expectedVersion)
        throw new FinancialPlanningError('conflict');
      const obligation = repository.saveObligation(
        { ...normalizeObligation(input), id },
        operationId
      );
      repository.replaceSchedule(obligation.id, buildSchedule(obligation));
      await persistIfNeeded();
      return result(obligation, obligationScopes(id));
    },
    async setObligationStatus(id, expectedVersion, status, operationId) {
      await ensureReady();
      const value = repository.setObligationStatus(
        id,
        expectedVersion,
        status,
        operationId
      );
      await persistIfNeeded();
      return result(value, obligationScopes(id));
    },
    async previewObligationPayment(input: ObligationPaymentInput) {
      await ensureReady();
      const obligation = repository.requireObligation(input.obligationId);
      const allocations = applyPaymentEarliestFirst({
        amountMinor: input.amountMinor,
        schedule: repository.listSchedule(input.obligationId),
        payments: repository.listPayments(input.obligationId),
        paidDate: input.paidDate
      });
      const allocated = allocations.reduce(
        (sum, item) => sum + item.amountMinor,
        0
      );
      const preview: ObligationPaymentPreview = {
        previewId: `payment-preview-${now()}`,
        obligationId: input.obligationId,
        amountMinor: input.amountMinor,
        allocations,
        case: allocated === input.amountMinor ? 'full' : 'over',
        expectedVersion: obligation.version
      };
      previews.set(preview.previewId, { ...preview, input });
      return preview;
    },
    async confirmObligationPayment(previewId, allocation, operationId) {
      await ensureReady();
      const preview = previews.get(previewId) as
        | (ObligationPaymentPreview & { input: ObligationPaymentInput })
        | undefined;
      if (!preview) throw new FinancialPlanningError('stale_preview');
      const obligation = repository.requireObligation(preview.obligationId);
      const transactionId =
        preview.input.transaction.kind === 'link'
          ? preview.input.transaction.transactionId
          : `planning-owned-${operationId}`;
      const payment = repository.savePayment(
        {
          obligationId: preview.obligationId,
          transactionId,
          amountMinor: preview.amountMinor,
          currencyCode: preview.input.currencyCode,
          paidDate: preview.input.paidDate,
          case: preview.case,
          allocationIntent: allocation.intent,
          allocations: allocation.allocations,
          principalReductionMinor: 0,
          settlementAdjustmentMinor: 0,
          source: preview.input.source,
          transactionOwnership:
            preview.input.transaction.kind === 'link'
              ? 'linked_existing'
              : 'created',
          status: 'posted',
          operationId,
          replacesPaymentId: null
        },
        operationId
      );
      await persistIfNeeded();
      return result(
        { obligation, payment },
        paymentScopes(obligation.id, payment.id)
      );
    },
    async reverseObligationPayment(paymentId, operationId) {
      await ensureReady();
      const payment = repository.reversePayment(paymentId, operationId);
      const obligation = repository.requireObligation(payment.obligationId);
      await persistIfNeeded();
      return result(
        { obligation, payment },
        paymentScopes(obligation.id, payment.id)
      );
    },
    async previewEarlySettlement(obligationId) {
      await ensureReady();
      const obligation = repository.requireObligation(obligationId);
      const status = deriveObligationStatus({
        obligation,
        schedule: repository.listSchedule(obligationId),
        payments: repository.listPayments(obligationId),
        today: localDateFromTimestamp(now())
      });
      if (status.remainingMinor.status !== 'available')
        throw new FinancialPlanningError('validation');
      const remaining = status.remainingMinor.value;
      const preview: EarlySettlementPreview & { expectedVersion: number } = {
        previewId: `settlement-${obligationId}`,
        obligationId,
        settlementMinor: remaining,
        adjustmentMinor: 0,
        expectedVersion: obligation.version
      };
      previews.set(preview.previewId, preview);
      return preview;
    },
    async confirmEarlySettlement(previewId, operationId) {
      await ensureReady();
      const preview = previews.get(previewId) as
        (EarlySettlementPreview & { expectedVersion: number }) | undefined;
      if (!preview) throw new FinancialPlanningError('stale_preview');
      const obligationId = preview.obligationId;
      const obligation = repository.setObligationStatus(
        obligationId,
        preview.expectedVersion,
        'completed',
        `${operationId}-status`
      );
      const payment = repository.savePayment(
        {
          obligationId,
          transactionId: `settlement-${operationId}`,
          amountMinor: preview.settlementMinor,
          currencyCode: obligation.currencyCode,
          paidDate: localDateFromTimestamp(now()),
          case: 'settlement',
          allocationIntent: 'settlement',
          allocations: [],
          principalReductionMinor: 0,
          settlementAdjustmentMinor: 0,
          source: 'manual',
          transactionOwnership: 'created',
          status: 'posted',
          operationId,
          replacesPaymentId: null
        },
        operationId
      );
      await persistIfNeeded();
      return result(
        { obligation, payment },
        paymentScopes(obligationId, payment.id)
      );
    },
    async listPaymentMatches(input: PaymentMatchQuery) {
      await ensureReady();
      const items = repository.listPaymentMatches(input.status);
      return { items, nextCursor: null, total: items.length };
    },
    async getPaymentMatch(id: string) {
      await ensureReady();
      return repository.requirePaymentMatch(id);
    },
    async resolvePaymentMatch(
      input: PaymentMatchResolution,
      operationId: string
    ) {
      await ensureReady();
      const match = repository.requirePaymentMatch(input.matchId);
      const next: PaymentMatch = {
        ...match,
        status: input.action === 'ignore' ? 'ignored' : 'resolved',
        resolution: input.obligationId
      };
      repository.savePaymentMatch(next, operationId);
      await persistIfNeeded();
      return result({ match: next }, [
        'planning.paymentMatches',
        `planning.paymentMatch.${input.matchId}`
      ]);
    },
    async listGoals(input: GoalQuery) {
      await ensureReady();
      return repository.listGoals(input.status);
    },
    async getGoal(id: string): Promise<SavingsGoalDetail> {
      await ensureReady();
      return goalDetail(repository, id, localDateFromTimestamp(now()));
    },
    async createGoal(input: SavingsGoalInput, operationId: string) {
      await ensureReady();
      const goal = repository.saveGoal(normalizeGoal(input), operationId);
      await persistIfNeeded();
      return result(goal, goalScopes(goal.id));
    },
    async updateGoal(id, expectedVersion, input, operationId) {
      await ensureReady();
      const current = repository.requireGoal(id);
      if (current.version !== expectedVersion)
        throw new FinancialPlanningError('conflict');
      const goal = repository.saveGoal(
        { ...normalizeGoal(input), id },
        operationId
      );
      await persistIfNeeded();
      return result(goal, goalScopes(id));
    },
    async setGoalStatus(id, expectedVersion, status, operationId) {
      await ensureReady();
      const goal = repository.setGoalStatus(
        id,
        expectedVersion,
        status,
        operationId
      );
      await persistIfNeeded();
      return result(goal, goalScopes(id));
    },
    async previewGoalMovement(
      input: GoalMovementInput
    ): Promise<GoalMovementPreview> {
      await ensureReady();
      const preview = {
        previewId: `goal-movement-${now()}`,
        goalId: input.goalId,
        kind: input.kind,
        amountMinor: input.amountMinor
      };
      previews.set(preview.previewId, input);
      return preview;
    },
    async confirmGoalMovement(previewId, operationId) {
      await ensureReady();
      const input = previews.get(previewId) as GoalMovementInput | undefined;
      if (!input) throw new FinancialPlanningError('stale_preview');
      const movement = repository.saveGoalMovement(
        {
          goalId: input.goalId,
          kind: input.kind,
          amountMinor: input.amountMinor,
          movementDate: input.movementDate,
          linkedTransactionId: input.linkedTransactionId ?? null,
          conversionEstimate: null,
          status: 'posted',
          operationId,
          replacesMovementId: null
        },
        operationId
      );
      const goal = repository.requireGoal(input.goalId);
      await persistIfNeeded();
      return result({ goal, movement }, goalScopes(goal.id));
    },
    async reverseGoalMovement(movementId, operationId) {
      await ensureReady();
      const movement = repository.reverseGoalMovement(movementId, operationId);
      const goal = repository.requireGoal(movement.goalId);
      await persistIfNeeded();
      return result({ goal, movement }, goalScopes(goal.id));
    },
    async saveDraft(draft: PlanningDraft) {
      await ensureReady();
      const value = repository.saveDraft(draft);
      await persistIfNeeded();
      return value;
    },
    async loadDraft(id: string) {
      await ensureReady();
      return repository.loadDraft(id);
    },
    async discardDraft(id: string) {
      await ensureReady();
      repository.discardDraft(id);
      await persistIfNeeded();
    },
    async getConflict(id: string) {
      await ensureReady();
      return repository.requireConflict(id);
    },
    async resolveConflict(id, resolution) {
      await ensureReady();
      const value = repository.resolveConflict(id, resolution);
      await persistIfNeeded();
      return result(value, ['planning.conflict', 'planning.overview']);
    }
  };
}

let demoFinancialPlanningRepository: FinancialPlanningRepository | null = null;

export function createProductionFinancialPlanningService(
  locale: Locale = 'ar'
) {
  const demoMode = isDemoModeEnabled();
  const repository = new FinancialPlanningRepository(
    demoMode
      ? createDemoFinancialPlanningSeed(Date.now(), 'Asia/Riyadh', locale)
      : {}
  );
  if (demoMode) demoFinancialPlanningRepository = repository;
  return createMockFinancialPlanningService(
    repository,
    !demoMode && Platform.OS !== 'web' && process.env.NODE_ENV !== 'test',
    async () =>
      (
        await coreFinanceService.listTransactions(
          emptyTransactionFilters,
          null,
          5_000
        )
      ).items,
    { registerForReset: true, providerKind: 'live' }
  );
}

export function createSeededFinancialPlanningService() {
  return createMockFinancialPlanningService(
    new FinancialPlanningRepository(financialPlanningSeed)
  );
}

export const financialPlanningService =
  process.env.NODE_ENV === 'test'
    ? createSeededFinancialPlanningService()
    : createProductionFinancialPlanningService();

export function relocalizeDemoFinancialPlanningRepository(
  locale: Locale
): void {
  demoFinancialPlanningRepository?.relocalizeDemoFixtures(
    createDemoFinancialPlanningSeed(Date.now(), 'Asia/Riyadh', locale)
  );
}

export function deriveMatchForTransaction(
  transaction: Transaction,
  obligations: readonly Obligation[],
  payments: readonly ObligationPayment[]
) {
  return Promise.resolve(
    scorePaymentMatch({
      transaction,
      obligations,
      existingPayments: payments
    })
  );
}

function salaryOutcome(
  repository: FinancialPlanningRepository,
  receipt: SalaryReceiptLink,
  operationId: string,
  transactions: readonly Transaction[],
  now: number,
  timeZone?: string
): Promise<MutationResult<SalaryReceiptOutcome>> {
  const profile = repository.activeSalaryProfile();
  if (!profile) throw new FinancialPlanningError('not_found');
  const effectiveTimeZone = resolvePlanningTimeZone(timeZone);
  return Promise.resolve(
    result(
      {
        profile,
        receipt,
        cycle: deriveSalaryCycle({
          profile,
          receipts: repository.listSalaryReceipts(),
          transactions,
          today: localDateInTimeZone(now, effectiveTimeZone),
          timeZone: effectiveTimeZone
        })
      },
      [...salaryScopes(), `planning.salary.operation.${operationId}`]
    )
  );
}

function resolvePlanningTimeZone(timeZone?: string): string {
  return timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

function budgetDetail(
  repository: FinancialPlanningRepository,
  budget: Budget,
  today: LocalDate,
  transactions: readonly Transaction[]
): BudgetDetail {
  const categories = repository.listCategoryBudgets(budget.id);
  return {
    budget,
    categories,
    progress: calculateBudgetProgress({
      budget,
      transactions,
      categoryIds: categories.map((category) => category.categoryId),
      today
    })
  };
}

function obligationDetail(
  repository: FinancialPlanningRepository,
  id: string,
  today: LocalDate
): ObligationDetail {
  const obligation = repository.requireObligation(id);
  const schedule = repository.listSchedule(id);
  const payments = repository.listPayments(id);
  return {
    obligation,
    schedule,
    payments,
    status: deriveObligationStatus({ obligation, schedule, payments, today })
  };
}

function goalDetail(
  repository: FinancialPlanningRepository,
  id: string,
  today: LocalDate
): SavingsGoalDetail {
  const goal = repository.requireGoal(id);
  const movements = repository.listGoalMovements(id);
  return {
    goal,
    movements,
    progress: deriveSavingsProgress({ goal, movements, today })
  };
}

function normalizeObligation(
  input: ObligationInput
): Omit<
  Obligation,
  'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt' | 'status'
> {
  return {
    direction: input.direction,
    type: input.type,
    scheduleKind: input.scheduleKind,
    title: input.title,
    provider: input.provider ?? null,
    currencyCode: input.currencyCode,
    contractedTotalMinor: input.contractedTotalMinor ?? null,
    openingPaidMinor: input.openingPaidMinor ?? 0,
    installmentAmountMinor: input.installmentAmountMinor ?? null,
    installmentCount: input.installmentCount ?? null,
    dueDay: input.dueDay ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    fundingAccountId: input.fundingAccountId ?? null,
    automaticMatchingEnabled: input.automaticMatchingEnabled ?? false,
    providerKeywords: input.providerKeywords ?? [],
    reminderTiming: input.reminderTiming ?? null,
    notes: input.notes ?? null
  };
}

function normalizeGoal(
  input: SavingsGoalInput
): Omit<
  SavingsGoal,
  'id' | 'version' | 'syncStatus' | 'createdAt' | 'updatedAt' | 'status'
> {
  return {
    title: input.title,
    targetMinor: input.targetMinor,
    openingTrackedMinor: input.openingTrackedMinor ?? 0,
    currencyCode: input.currencyCode,
    targetDate: input.targetDate,
    linkedAccountId: input.linkedAccountId ?? null,
    iconKey: input.iconKey ?? null,
    emergencyFund: input.emergencyFund ?? false
  };
}

function buildSchedule(obligation: Obligation): ObligationScheduleItem[] {
  if (
    obligation.scheduleKind !== 'fixed_term' ||
    !obligation.installmentCount
  ) {
    return [];
  }
  if (!obligation.startDate || !obligation.installmentAmountMinor)
    throw new FinancialPlanningError('validation');
  const start = obligation.startDate;
  const amount = obligation.installmentAmountMinor;
  return Array.from({ length: obligation.installmentCount }, (_, index) => ({
    id: `${obligation.id}-schedule-${index + 1}`,
    obligationId: obligation.id,
    sequence: index + 1,
    dueDate: expectedDateForMonth(
      Number(start.slice(0, 4)),
      Number(start.slice(5, 7)) + index,
      obligation.dueDay ?? Number(start.slice(8, 10))
    ),
    scheduledMinor: amount,
    kind: 'installment' as const,
    status: 'upcoming' as const
  }));
}

const derivedScopes = ['reports.live', 'assistant.context'] as const;

function result<T>(
  value: T,
  affectedScopes: readonly string[]
): MutationResult<T> {
  return {
    value,
    affectedScopes: [...new Set([...affectedScopes, ...derivedScopes])]
  };
}

function salaryScopes() {
  return ['planning.overview', 'planning.salary.overview', 'home.summary'];
}

function budgetScopes(id: string) {
  return [
    'planning.overview',
    'planning.budget',
    `planning.budget.${id}`,
    'home.summary'
  ];
}

function obligationScopes(id: string) {
  return [
    'planning.overview',
    'planning.obligations',
    `planning.obligation.${id}`,
    'home.summary'
  ];
}

function paymentScopes(obligationId: string, paymentId: string) {
  return [
    ...obligationScopes(obligationId),
    'planning.paymentMatches',
    `planning.payment.${paymentId}`,
    'transactions.list'
  ];
}

function goalScopes(id: string) {
  return [
    'planning.overview',
    'planning.goals',
    `planning.goal.${id}`,
    'home.summary'
  ];
}
