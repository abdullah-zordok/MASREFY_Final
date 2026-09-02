import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import {
  normalizeBudgetAllocations,
  normalizeBudgetCreate,
  normalizeBudgetPatch,
  normalizeIdempotencyKey,
  normalizeLifecycle,
  normalizeMatchDecision,
  normalizeObligationCreate,
  normalizeObligationPatch,
  normalizePlanningPeriod,
  normalizePaymentCreate,
  normalizePlanningId,
  normalizePlanningList,
  normalizeReceiptLink,
  normalizeSalaryCreate,
  normalizeSalaryPatch,
  normalizeSavingsGoalCreate,
  normalizeSavingsGoalPatch,
  normalizeSavingsMovement,
  normalizeVersionOnly,
} from './planning.dto';
import { PlanningRepository } from './planning.repository';

interface MutationInput {
  principal: ClerkPrincipal;
  body: unknown;
  idempotencyKey: string;
  requestId: string;
}

@Injectable()
export class PlanningService {
  constructor(readonly repository: PlanningRepository) {}

  createSalaryProfile(input: MutationInput): Promise<unknown> {
    return this.mutation('createSalaryProfile', 'planning.salary-profile.create', 201, input, () =>
      normalizeSalaryCreate(input.body),
    );
  }

  updateSalaryProfile(profileId: string, input: MutationInput): Promise<unknown> {
    return this.mutation(
      'updateSalaryProfile',
      'planning.salary-profile.update',
      200,
      input,
      () => ({ profileId: normalizePlanningId(profileId), ...normalizeSalaryPatch(input.body) }),
    );
  }

  archiveSalaryProfile(profileId: string, input: MutationInput): Promise<unknown> {
    return this.mutation(
      'archiveSalaryProfile',
      'planning.salary-profile.archive',
      200,
      input,
      () => ({ profileId: normalizePlanningId(profileId), ...normalizeVersionOnly(input.body) }),
    );
  }

  linkSalaryReceipt(profileId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('linkSalaryReceipt', 'planning.salary-receipt.link', 201, input, () => ({
      profileId: normalizePlanningId(profileId),
      ...normalizeReceiptLink(input.body),
    }));
  }

  unlinkSalaryReceipt(
    profileId: string,
    receiptId: string,
    input: MutationInput,
  ): Promise<unknown> {
    return this.mutation(
      'unlinkSalaryReceipt',
      'planning.salary-receipt.unlink',
      200,
      input,
      () => ({
        profileId: normalizePlanningId(profileId),
        receiptId: normalizePlanningId(receiptId),
        ...normalizeVersionOnly(input.body),
      }),
    );
  }

  listSalaryProfiles(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    let normalized;
    try {
      normalized = normalizePlanningList(query);
    } catch {
      throw this.validation();
    }
    return this.repository.listSalaryProfiles(principal, normalized, requestId);
  }

  getSalaryProfile(
    principal: ClerkPrincipal,
    profileId: string,
    requestId: string,
  ): Promise<unknown> {
    try {
      profileId = normalizePlanningId(profileId);
    } catch {
      throw this.validation();
    }
    return this.repository.getSalaryProfile(principal, profileId, requestId);
  }

  listSalaryReceipts(
    principal: ClerkPrincipal,
    profileId: string,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      profileId = normalizePlanningId(profileId);
      const input = { ...(query as Record<string, unknown>) };
      const transactionId =
        input.transactionId === undefined ? null : normalizePlanningId(input.transactionId);
      Reflect.deleteProperty(input, 'transactionId');
      return this.repository.listSalaryReceipts(
        principal,
        profileId,
        { ...normalizePlanningList(input), transactionId },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  createBudget(input: MutationInput): Promise<unknown> {
    return this.mutation('createBudget', 'planning.budget.create', 201, input, () =>
      normalizeBudgetCreate(input.body),
    );
  }

  updateBudget(budgetId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('updateBudget', 'planning.budget.update', 200, input, () => ({
      budgetId: normalizePlanningId(budgetId),
      ...normalizeBudgetPatch(input.body),
    }));
  }

  deleteBudget(budgetId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('deleteBudget', 'planning.budget.delete', 200, input, () => ({
      budgetId: normalizePlanningId(budgetId),
      ...normalizeVersionOnly(input.body),
    }));
  }

  replaceBudgetCategories(budgetId: string, input: MutationInput): Promise<unknown> {
    return this.mutation(
      'replaceBudgetCategories',
      'planning.budget-categories.replace',
      200,
      input,
      () => ({
        budgetId: normalizePlanningId(budgetId),
        ...normalizeBudgetAllocations(input.body),
      }),
    );
  }

  listBudgets(principal: ClerkPrincipal, query: unknown, requestId: string): Promise<unknown> {
    try {
      const input = { ...(query as Record<string, unknown>) };
      const period = input.period === undefined ? null : normalizePlanningPeriod(input.period);
      Reflect.deleteProperty(input, 'period');
      return this.repository.listBudgets(
        principal,
        { ...normalizePlanningList(input), period },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  getBudget(principal: ClerkPrincipal, budgetId: string, requestId: string): Promise<unknown> {
    try {
      budgetId = normalizePlanningId(budgetId);
    } catch {
      throw this.validation();
    }
    return this.repository.getBudget(principal, budgetId, requestId);
  }

  getBudgetSummary(
    principal: ClerkPrincipal,
    budgetId: string,
    requestId: string,
  ): Promise<unknown> {
    try {
      budgetId = normalizePlanningId(budgetId);
    } catch {
      throw this.validation();
    }
    return this.repository.getBudgetSummary(principal, budgetId, requestId);
  }

  createObligation(input: MutationInput): Promise<unknown> {
    return this.mutation('createObligation', 'planning.obligation.create', 201, input, () =>
      normalizeObligationCreate(input.body),
    );
  }

  updateObligation(obligationId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('updateObligation', 'planning.obligation.update', 200, input, () => ({
      obligationId: normalizePlanningId(obligationId),
      ...normalizeObligationPatch(input.body),
    }));
  }

  archiveObligation(obligationId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('archiveObligation', 'planning.obligation.archive', 200, input, () => ({
      obligationId: normalizePlanningId(obligationId),
      ...normalizeVersionOnly(input.body),
    }));
  }

  listObligations(principal: ClerkPrincipal, query: unknown, requestId: string): Promise<unknown> {
    try {
      const input = { ...(query as Record<string, unknown>) };
      const status =
        input.status === undefined
          ? null
          : normalizeLifecycle(input.status, [
              'active',
              'paused',
              'completed',
              'closed',
              'archived',
            ] as const);
      Reflect.deleteProperty(input, 'status');
      return this.repository.listObligations(
        principal,
        { ...normalizePlanningList(input), status },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  getObligation(
    principal: ClerkPrincipal,
    obligationId: string,
    requestId: string,
  ): Promise<unknown> {
    try {
      obligationId = normalizePlanningId(obligationId);
    } catch {
      throw this.validation();
    }
    return this.repository.getObligation(principal, obligationId, requestId);
  }

  listObligationSchedule(
    principal: ClerkPrincipal,
    obligationId: string,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      return this.repository.listObligationSchedule(
        principal,
        normalizePlanningId(obligationId),
        normalizePlanningList(query),
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  allocateObligationPayment(obligationId: string, input: MutationInput): Promise<unknown> {
    return this.mutation(
      'allocateObligationPayment',
      'planning.obligation-payment.record',
      201,
      input,
      () => ({
        obligationId: normalizePlanningId(obligationId),
        ...normalizePaymentCreate(input.body),
      }),
    );
  }

  reverseObligationPayment(
    obligationId: string,
    paymentId: string,
    input: MutationInput,
  ): Promise<unknown> {
    return this.mutation(
      'reverseObligationPayment',
      'planning.obligation-payment.reverse',
      200,
      input,
      () => ({
        obligationId: normalizePlanningId(obligationId),
        paymentId: normalizePlanningId(paymentId),
        ...normalizeVersionOnly(input.body),
      }),
    );
  }

  decidePaymentMatch(matchId: string, input: MutationInput): Promise<unknown> {
    return this.mutation(
      'decidePaymentMatch',
      'planning.payment-match.decision',
      200,
      input,
      () => ({ matchId: normalizePlanningId(matchId), ...normalizeMatchDecision(input.body) }),
    );
  }

  listPaymentMatches(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      const input = { ...(query as Record<string, unknown>) };
      const status =
        input.status === undefined
          ? null
          : normalizeLifecycle(input.status, ['proposed', 'accepted', 'rejected'] as const);
      Reflect.deleteProperty(input, 'status');
      return this.repository.listPaymentMatches(
        principal,
        { ...normalizePlanningList(input), status },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  getPaymentMatch(principal: ClerkPrincipal, matchId: string, requestId: string): Promise<unknown> {
    try {
      matchId = normalizePlanningId(matchId);
    } catch {
      throw this.validation();
    }
    return this.repository.getPaymentMatch(principal, matchId, requestId);
  }

  createSavingsGoal(input: MutationInput): Promise<unknown> {
    return this.mutation('createSavingsGoal', 'planning.savings-goal.create', 201, input, () =>
      normalizeSavingsGoalCreate(input.body),
    );
  }

  updateSavingsGoal(goalId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('updateSavingsGoal', 'planning.savings-goal.update', 200, input, () => ({
      goalId: normalizePlanningId(goalId),
      ...normalizeSavingsGoalPatch(input.body),
    }));
  }

  deleteSavingsGoal(goalId: string, input: MutationInput): Promise<unknown> {
    return this.mutation('deleteSavingsGoal', 'planning.savings-goal.delete', 200, input, () => ({
      goalId: normalizePlanningId(goalId),
      ...normalizeVersionOnly(input.body),
    }));
  }

  recordSavingsMovement(goalId: string, input: MutationInput): Promise<unknown> {
    return this.mutation(
      'recordSavingsMovement',
      'planning.savings-movement.record',
      201,
      input,
      () => ({ goalId: normalizePlanningId(goalId), ...normalizeSavingsMovement(input.body) }),
    );
  }

  reverseSavingsMovement(
    goalId: string,
    movementId: string,
    input: MutationInput,
  ): Promise<unknown> {
    return this.mutation(
      'reverseSavingsMovement',
      'planning.savings-movement.reverse',
      200,
      input,
      () => ({
        goalId: normalizePlanningId(goalId),
        movementId: normalizePlanningId(movementId),
        ...normalizeVersionOnly(input.body),
      }),
    );
  }

  listSavingsGoals(principal: ClerkPrincipal, query: unknown, requestId: string): Promise<unknown> {
    try {
      const input = { ...(query as Record<string, unknown>) };
      const status =
        input.status === undefined
          ? null
          : normalizeLifecycle(input.status, ['active', 'paused', 'completed', 'deleted'] as const);
      Reflect.deleteProperty(input, 'status');
      return this.repository.listSavingsGoals(
        principal,
        { ...normalizePlanningList(input), status },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  getSavingsGoal(principal: ClerkPrincipal, goalId: string, requestId: string): Promise<unknown> {
    try {
      goalId = normalizePlanningId(goalId);
    } catch {
      throw this.validation();
    }
    return this.repository.getSavingsGoal(principal, goalId, requestId);
  }

  getPlanningSummary(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error();
      const input = query as Record<string, unknown>;
      if (Object.keys(input).some((key) => key !== 'period')) throw new Error();
      const period = normalizePlanningPeriod(input.period);
      return this.repository.getPlanningSummary(
        principal,
        { key: String(input.period), ...period },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  getAdminPlanningSummary(
    principal: ClerkPrincipal,
    query: unknown,
    requestId: string,
  ): Promise<unknown> {
    try {
      if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error();
      const input = query as Record<string, unknown>;
      if (
        Object.keys(input).some((key) => !['period', 'userId'].includes(key)) ||
        typeof input.userId !== 'string' ||
        !input.userId.trim() ||
        input.userId.length > 200
      )
        throw new Error();
      const period = normalizePlanningPeriod(input.period);
      return this.repository.getAdminPlanningSummary(
        principal,
        input.userId.trim(),
        { key: String(input.period), ...period },
        requestId,
      );
    } catch {
      throw this.validation();
    }
  }

  private mutation(
    operation: string,
    scope: string,
    status: number,
    input: MutationInput,
    normalize: () => Record<string, unknown>,
  ): Promise<unknown> {
    let command: Record<string, unknown>;
    let idempotencyKey: string;
    try {
      command = normalize();
      idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    } catch {
      throw this.validation();
    }
    return this.repository.mutate({
      operation,
      scope,
      status,
      principal: input.principal,
      command,
      idempotencyKey,
      requestId: input.requestId,
    });
  }

  private validation(): HttpException {
    return new HttpException({ code: 'VALIDATION_FAILED' }, 400);
  }
}
