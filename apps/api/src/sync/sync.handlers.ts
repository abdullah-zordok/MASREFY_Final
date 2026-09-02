import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { LedgerService } from '../ledger/ledger.service';
import { ReferenceService } from '../reference/reference.service';
import { PlanningService } from '../planning/planning.service';
import type { SyncMutation } from './sync.types';

@Injectable()
export class SyncHandlers {
  constructor(
    private readonly reference: ReferenceService,
    private readonly ledger: LedgerService,
    private readonly planning?: PlanningService,
  ) {}

  async dispatch(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    if (mutation.domain === 'transactions') return this.transaction(principal, mutation, requestId);
    if (mutation.domain === 'planning')
      return this.planningMutation(principal, mutation, requestId);
    return this.referenceMutation(principal, mutation, requestId);
  }

  private planningMutation(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    if (!this.planning) throw new HttpException({ code: 'SYNC_OPERATION_UNSUPPORTED' }, 400);
    const input = {
      principal,
      body: mutation.payload,
      idempotencyKey: mutation.operationId,
      requestId,
    };
    const id = mutation.resourceId ?? '';
    const version = mutation.baseVersion;
    const body = (routeField?: string, extra: Record<string, unknown> = {}) => {
      const payload = routeField
        ? Object.fromEntries(Object.entries(mutation.payload).filter(([key]) => key !== routeField))
        : mutation.payload;
      return { ...payload, ...extra, ...(version === null ? {} : { expectedVersion: version }) };
    };
    switch (`${mutation.operation}:${mutation.resourceType}`) {
      case 'create:salary-profile':
        return this.planning.createSalaryProfile(input);
      case 'update:salary-profile':
        return this.planning.updateSalaryProfile(id, { ...input, body: body() });
      case 'archive:salary-profile':
      case 'delete:salary-profile':
        return this.planning.archiveSalaryProfile(id, { ...input, body: body() });
      case 'create:salary-receipt':
        return this.planning.linkSalaryReceipt(String(mutation.payload.profileId), {
          ...input,
          body: body('profileId'),
        });
      case 'delete:salary-receipt':
        return this.planning.unlinkSalaryReceipt(String(mutation.payload.profileId), id, {
          ...input,
          body: body('profileId'),
        });
      case 'create:budget':
        return this.planning.createBudget(input);
      case 'update:budget':
        return this.planning.updateBudget(id, { ...input, body: body() });
      case 'delete:budget':
      case 'archive:budget':
        return this.planning.deleteBudget(id, { ...input, body: body() });
      case 'update:budget-category':
        return this.planning.replaceBudgetCategories(String(mutation.payload.budgetId), {
          ...input,
          body: body('budgetId'),
        });
      case 'create:obligation':
        return this.planning.createObligation(input);
      case 'update:obligation':
        return this.planning.updateObligation(id, { ...input, body: body() });
      case 'archive:obligation':
      case 'delete:obligation':
        return this.planning.archiveObligation(id, { ...input, body: body() });
      case 'create:obligation-payment':
        return this.planning.allocateObligationPayment(String(mutation.payload.obligationId), {
          ...input,
          body: body('obligationId'),
        });
      case 'delete:obligation-payment':
        return this.planning.reverseObligationPayment(String(mutation.payload.obligationId), id, {
          ...input,
          body: body('obligationId'),
        });
      case 'update:payment-match':
        return this.planning.decidePaymentMatch(id, { ...input, body: body() });
      case 'create:savings-goal':
        return this.planning.createSavingsGoal(input);
      case 'update:savings-goal':
        return this.planning.updateSavingsGoal(id, { ...input, body: body() });
      case 'delete:savings-goal':
      case 'archive:savings-goal':
        return this.planning.deleteSavingsGoal(id, { ...input, body: body() });
      case 'create:savings-movement':
        return this.planning.recordSavingsMovement(String(mutation.payload.goalId), {
          ...input,
          body: body('goalId'),
        });
      case 'delete:savings-movement':
        return this.planning.reverseSavingsMovement(String(mutation.payload.goalId), id, {
          ...input,
          body: body('goalId'),
        });
      default:
        throw new HttpException({ code: 'SYNC_OPERATION_UNSUPPORTED' }, 400);
    }
  }

  private transaction(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    const common = {
      principal,
      body: mutation.payload,
      idempotencyKey: mutation.operationId,
      requestId,
    };
    if (mutation.operation === 'create') return this.ledger.createTransaction(common);
    if (!mutation.resourceId || mutation.baseVersion === null)
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    const existing = {
      ...common,
      transactionId: mutation.resourceId,
      body: { ...mutation.payload, expectedVersion: mutation.baseVersion },
    };
    if (mutation.operation === 'update') return this.ledger.reviseTransaction(existing);
    if (mutation.operation === 'delete' || mutation.operation === 'archive')
      return this.ledger.deleteTransaction(existing);
    return this.ledger.restoreTransaction(existing);
  }

  private referenceMutation(
    principal: ClerkPrincipal,
    mutation: SyncMutation,
    requestId: string,
  ): Promise<unknown> {
    const resource = mutation.domain === 'accounts' ? 'Account' : 'Category';
    const operation = `${mutation.operation}${resource}`;
    const allowed = new Set([
      'createAccount',
      'updateAccount',
      'archiveAccount',
      'restoreAccount',
      'createCategory',
      'updateCategory',
      'archiveCategory',
      'restoreCategory',
    ]);
    if (!allowed.has(operation) || (mutation.operation !== 'create' && !mutation.resourceId))
      throw new HttpException({ code: 'SYNC_OPERATION_UNSUPPORTED' }, 400);
    const expectedVersion = mutation.baseVersion;
    return this.reference.execute({
      operation,
      principal,
      requestId,
      idempotencyKey: mutation.operationId,
      body:
        mutation.operation === 'create'
          ? mutation.payload
          : { ...mutation.payload, expectedVersion },
      query: mutation.operation === 'archive' ? { expectedVersion: String(expectedVersion) } : {},
      params:
        mutation.domain === 'accounts'
          ? { accountId: mutation.resourceId ?? '' }
          : { categoryId: mutation.resourceId ?? '' },
    });
  }
}
