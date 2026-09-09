import type { FinancialPlanningService } from '@/services/contracts/financial-planning-service';
import { resolveReportPeriod } from '@/domain/reports';
import {
  budgetWireFixture,
  salaryProfileWireFixture,
  savingsGoalWireFixture
} from '@/test-utils/financial-planning-api-fixtures';
import { resetRuntimeIdentityData } from '@/storage/runtime-user-data-reset';
import { FinancialPlanningRepository } from '@/storage/financial-planning-repository';
import {
  financialPlanningSeed,
  fixturePlanningConflict
} from '@/test-utils/financial-planning-fixtures';

import { registerLiveClerkBridge, type LiveClerkBridge } from './auth-service';
import { createLiveFinancialPlanningService } from './financial-planning-service';

const session = {
  id: 'planning-session',
  userId: 'planning-owner',
  method: 'google' as const,
  issuedAt: 1,
  expiresAt: 9_999_999_999_999
};
const bridge = {
  getSession: async () => session,
  getToken: async () => 'owner-token',
  startPhone: jest.fn(),
  verifyPhone: jest.fn(),
  resendPhone: jest.fn(),
  signInWithGoogle: jest.fn(),
  reverifyConflict: jest.fn(),
  signOut: jest.fn()
} satisfies LiveClerkBridge;

beforeAll(() => registerLiveClerkBridge(bridge));

const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const mutation = (
  resource: unknown,
  operationId = '70000000-0000-4000-8000-000000000099'
) => ({
  operationId,
  replayed: false,
  resource
});
const category = {
  id: '70000000-0000-4000-8000-000000000095',
  categoryId: '70000000-0000-4000-8000-000000000096',
  limitMinor: '200000',
  rolloverMinor: '0',
  alertThresholds: [75, 90],
  status: 'active' as const,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  version: 7
};
const budgetSummary = {
  budgetId: budgetWireFixture.id,
  currencyCode: 'SAR',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  totalMinor: '500000',
  spentMinor: '125000',
  remainingMinor: '375000',
  dataState: 'complete' as const,
  unavailableReason: null,
  ledgerVersion: 19,
  items: [],
  requestId: 'budget-summary'
};

const methods = [
  'getReportingSnapshot',
  'getPlanningOverview',
  'getSalaryOverview',
  'getSalaryReceiptReview',
  'saveSalaryProfile',
  'confirmSalaryReceipt',
  'undoSalaryReceipt',
  'getBudget',
  'listBudgets',
  'getBudgetById',
  'createBudgetDraftFromPrevious',
  'saveBudget',
  'previewBudgetMove',
  'confirmBudgetMove',
  'setBudgetStatus',
  'deleteBudget',
  'getObligationsOverview',
  'listObligations',
  'getObligation',
  'createObligation',
  'updateObligation',
  'setObligationStatus',
  'previewObligationPayment',
  'confirmObligationPayment',
  'reverseObligationPayment',
  'previewEarlySettlement',
  'confirmEarlySettlement',
  'listPaymentMatches',
  'getPaymentMatch',
  'resolvePaymentMatch',
  'listGoals',
  'getGoal',
  'createGoal',
  'updateGoal',
  'setGoalStatus',
  'previewGoalMovement',
  'confirmGoalMovement',
  'reverseGoalMovement',
  'saveDraft',
  'loadDraft',
  'discardDraft',
  'getConflict',
  'resolveConflict'
] as const satisfies readonly (keyof FinancialPlanningService)[];

describe('live financial-planning service contract', () => {
  it('publishes the live planning capability metadata', () => {
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      token: async () => 'owner'
    });
    expect(methods).toHaveLength(43);
    expect(service.metadata).toMatchObject({
      id: 'live-financial-planning',
      capability: 'financial-planning.records',
      majorVersion: 1,
      kind: 'live',
      availability: 'available'
    });
  });

  it('exercises every contract operation with an observable live result', async () => {
    const obligationId = '70000000-0000-4000-8000-000000000071';
    const scheduleId = '70000000-0000-4000-8000-000000000072';
    const transactionId = '70000000-0000-4000-8000-000000000073';
    const paymentId = '70000000-0000-4000-8000-000000000074';
    const receiptId = '70000000-0000-4000-8000-000000000076';
    const matchId = '70000000-0000-4000-8000-000000000077';
    const movementId = '70000000-0000-4000-8000-000000000078';
    const operationId = '70000000-0000-4000-8000-000000000079';
    const secondCategory = {
      ...category,
      id: '70000000-0000-4000-8000-000000000098',
      categoryId: '70000000-0000-4000-8000-000000000097',
      limitMinor: '100000'
    };
    const obligation = {
      id: obligationId,
      name: 'Loan',
      direction: 'payable',
      type: 'debt',
      scheduleKind: 'fixed_term',
      currencyCode: 'SAR',
      principalMinor: '100',
      openingPaidMinor: '0',
      installmentAmountMinor: '100',
      installmentCount: 1,
      frequency: 'monthly',
      expectedDay: 20,
      customIntervalDays: null,
      startDate: '2026-09-01',
      endDate: null,
      status: 'active',
      defaultAccountId: null,
      automaticMatchingEnabled: true,
      provider: null,
      providerKeywords: [],
      reminderTiming: null,
      notes: null,
      deletedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 4
    } as const;
    const obligationSummary = {
      direction: 'payable',
      currencyCode: 'SAR',
      scheduledMinor: '100',
      allocatedMinor: '0',
      paidMinor: '0',
      remainingMinor: '100',
      overdueMinor: '0',
      nextDueAt: '2026-09-20T00:00:00.000Z',
      completedInstallmentCount: 0,
      status: 'active',
      ledgerVersion: 3
    } as const;
    const schedule = {
      id: scheduleId,
      obligationId,
      dueAt: '2026-09-20T00:00:00.000Z',
      amountMinor: '100',
      paidMinor: '0',
      status: 'due',
      sequenceNo: 1,
      kind: 'installment',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 1
    } as const;
    const receipt = {
      id: receiptId,
      salaryProfileId: salaryProfileWireFixture.id,
      transactionId,
      expectedAt: '2026-09-30T00:00:00.000Z',
      receivedAt: '2026-09-09T00:00:00.000Z',
      amountMinor: '1200000',
      status: 'received',
      operationId,
      replacesReceiptId: null,
      createdAt: '2026-09-09T00:00:00.000Z',
      updatedAt: '2026-09-09T00:00:00.000Z',
      version: 1
    } as const;
    const payment = {
      id: paymentId,
      obligationId,
      transactionId,
      paidAt: '2026-09-09T00:00:00.000Z',
      amountMinor: '100',
      paymentMethod: null,
      paymentCase: 'full',
      allocationIntent: 'current',
      source: 'manual',
      status: 'confirmed',
      operationId,
      createdAt: '2026-09-09T00:00:00.000Z',
      updatedAt: '2026-09-09T00:00:00.000Z',
      version: 1,
      obligationVersion: 4
    } as const;
    const paymentMatch = {
      id: matchId,
      transactionId,
      obligationId,
      scheduleItemId: scheduleId,
      advisoryConfidence: '0.95',
      reasonCodes: ['amount_match'],
      status: 'proposed',
      reviewedAt: null,
      createdAt: '2026-09-09T00:00:00.000Z',
      updatedAt: '2026-09-09T00:00:00.000Z',
      version: 1
    } as const;
    const movement = {
      id: movementId,
      goalId: savingsGoalWireFixture.id,
      transactionId,
      amountMinor: '50000',
      occurredAt: '2026-09-09T00:00:00.000Z',
      kind: 'contribution',
      operationId,
      replacesMovementId: null,
      createdAt: '2026-09-09T00:00:00.000Z'
    } as const;
    const summary = {
      period: '2026-09',
      dataState: 'ready',
      ledgerVersion: 3,
      salary: {
        id: salaryProfileWireFixture.id,
        name: 'Employer',
        currencyCode: 'SAR',
        expectedMinor: '1200000',
        actualIncomeMinor: '1200000',
        actualExpenseMinor: '100',
        reservedObligationMinor: '100',
        nextExpectedAt: '2026-09-30T00:00:00.000Z'
      },
      budgets: [
        {
          id: budgetWireFixture.id,
          name: 'September',
          currencyCode: 'SAR',
          totalMinor: '500000',
          spentMinor: '125000',
          remainingMinor: '375000',
          ledgerVersion: 3,
          dataState: 'complete',
          categories: [{ budgetId: budgetWireFixture.id, ...category }]
        }
      ],
      obligations: {
        payables: [{ id: obligationId, name: 'Loan', ...obligationSummary }],
        receivables: []
      },
      savings: [savingsGoalWireFixture],
      requestId: 'summary'
    } as const;
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.includes('/planning/summary')) return response(summary);
        if (url.includes('/salary-profiles')) {
          if (url.includes('/receipts')) {
            if (method === 'GET')
              return response({ items: [receipt], nextCursor: null });
            return response(
              mutation(
                method === 'DELETE'
                  ? { ...receipt, status: 'undone' }
                  : receipt,
                operationId
              )
            );
          }
          if (method === 'GET')
            return url.includes(`/${salaryProfileWireFixture.id}`)
              ? response(salaryProfileWireFixture)
              : response({
                  items: [salaryProfileWireFixture],
                  nextCursor: null
                });
          return response(mutation(salaryProfileWireFixture, operationId));
        }
        if (url.includes('/budgets')) {
          if (url.endsWith('/summary')) return response(budgetSummary);
          if (method === 'PUT')
            return response(
              mutation(
                { id: budgetWireFixture.id, version: 2, allocationCount: 2 },
                operationId
              )
            );
          if (method !== 'GET')
            return response(
              mutation(
                method === 'DELETE'
                  ? { ...budgetWireFixture, status: 'deleted' }
                  : budgetWireFixture,
                operationId
              )
            );
          return url.includes(`/${budgetWireFixture.id}`)
            ? response({
                ...budgetWireFixture,
                categories: [category, secondCategory]
              })
            : response({ items: [budgetWireFixture], nextCursor: null });
        }
        if (url.includes('/obligations')) {
          if (url.includes('/schedule'))
            return response({ items: [schedule], nextCursor: null });
          if (url.includes('/payments'))
            return response(
              mutation(
                url.endsWith('/reverse')
                  ? { ...payment, status: 'reversed' }
                  : payment,
                operationId
              )
            );
          if (method !== 'GET')
            return response(mutation(obligation, operationId));
          return url.includes(`/${obligationId}`)
            ? response({ ...obligation, summary: obligationSummary })
            : response({ items: [obligation], nextCursor: null });
        }
        if (url.includes('/payment-matches')) {
          if (method === 'PATCH')
            return response(
              mutation(
                {
                  id: matchId,
                  transactionId,
                  obligationId,
                  scheduleItemId: scheduleId,
                  status: 'rejected',
                  reviewedAt: '2026-09-09T00:00:00.000Z',
                  payment: null,
                  createdAt: paymentMatch.createdAt,
                  updatedAt: paymentMatch.updatedAt,
                  version: 2
                },
                operationId
              )
            );
          return url.includes(`/${matchId}`)
            ? response(paymentMatch)
            : response({ items: [paymentMatch], nextCursor: null });
        }
        if (url.includes('/savings-goals')) {
          if (url.includes('/movements'))
            return response(
              mutation(
                {
                  ...movement,
                  kind: url.endsWith('/reverse') ? 'reversal' : movement.kind,
                  goalVersion: 2,
                  progressMinor: '600000'
                },
                operationId
              )
            );
          if (method !== 'GET')
            return response(mutation(savingsGoalWireFixture, operationId));
          return url.includes(`/${savingsGoalWireFixture.id}`)
            ? response({ ...savingsGoalWireFixture, movements: [movement] })
            : response({ items: [savingsGoalWireFixture], nextCursor: null });
        }
        throw new Error(`unexpected request ${method} ${url}`);
      }
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request,
      repository: new FinancialPlanningRepository(financialPlanningSeed),
      persistent: false,
      now: () => Date.parse('2026-09-09T00:00:00.000Z')
    });
    const covered = new Set<keyof FinancialPlanningService>();
    const use = <T>(method: keyof FinancialPlanningService, call: () => T) => {
      covered.add(method);
      return call();
    };
    const budgetInput = {
      id: budgetWireFixture.id,
      expectedVersion: 1,
      name: 'September',
      periodKey: '2026-09',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 500000,
      incomeTargetMinor: 1200000,
      savingsTargetMinor: 200000,
      categories: []
    };
    const obligationInput = {
      direction: 'payable' as const,
      type: 'debt' as const,
      scheduleKind: 'fixed_term' as const,
      title: 'Loan',
      currencyCode: 'SAR',
      contractedTotalMinor: 100,
      installmentAmountMinor: 100,
      installmentCount: 1,
      dueDay: 20,
      startDate: '2026-09-01' as const
    };
    const goalInput = {
      title: 'Emergency',
      targetMinor: 2000000,
      openingTrackedMinor: 500000,
      currencyCode: 'SAR',
      targetDate: '2026-12-31' as const
    };

    await expect(
      use('getReportingSnapshot', () =>
        service.getReportingSnapshot(
          resolveReportPeriod({
            kind: 'monthly',
            anchorDate: '2026-09-09',
            timeZone: 'UTC',
            now: Date.parse('2026-09-09T00:00:00.000Z')
          })
        )
      )
    ).resolves.toMatchObject({ dataState: 'partial' });
    await expect(
      use('getPlanningOverview', () =>
        service.getPlanningOverview({
          currencyCode: 'SAR',
          today: '2026-09-09'
        })
      )
    ).resolves.toMatchObject({ dataState: 'ready' });
    await expect(
      use('getSalaryOverview', () =>
        service.getSalaryOverview({ today: '2026-09-09' })
      )
    ).resolves.toMatchObject({ profileId: salaryProfileWireFixture.id });
    await expect(
      use('getSalaryReceiptReview', () =>
        service.getSalaryReceiptReview(transactionId)
      )
    ).resolves.toMatchObject({ id: receiptId });
    await expect(
      use('saveSalaryProfile', () =>
        service.saveSalaryProfile(
          {
            expectedAmountMinor: 1200000,
            currencyCode: 'SAR',
            salaryDay: 31,
            sourceName: 'Employer',
            receivingAccountId: salaryProfileWireFixture.accountId
          },
          'salary-save'
        )
      )
    ).resolves.toMatchObject({ value: { id: salaryProfileWireFixture.id } });
    await expect(
      use('confirmSalaryReceipt', () =>
        service.confirmSalaryReceipt(
          {
            salaryProfileId: salaryProfileWireFixture.id,
            transactionId,
            expectedOccurrenceDate: '2026-09-30',
            receivedDate: '2026-09-09'
          },
          'salary-confirm'
        )
      )
    ).resolves.toMatchObject({ value: { receipt: { id: receiptId } } });
    await expect(
      use('undoSalaryReceipt', () =>
        service.undoSalaryReceipt(receiptId, 'salary-undo')
      )
    ).resolves.toMatchObject({ value: { receipt: { status: 'undone' } } });

    await expect(
      use('getBudget', () => service.getBudget('2026-09'))
    ).resolves.toMatchObject({ budget: { id: budgetWireFixture.id } });
    await expect(
      use('listBudgets', () => service.listBudgets('2026-09'))
    ).resolves.toHaveLength(1);
    await expect(
      use('getBudgetById', () => service.getBudgetById(budgetWireFixture.id))
    ).resolves.toMatchObject({ budget: { id: budgetWireFixture.id } });
    await expect(
      use('createBudgetDraftFromPrevious', () =>
        service.createBudgetDraftFromPrevious('2026-10')
      )
    ).resolves.toMatchObject({ kind: 'budget' });
    await expect(
      use('saveBudget', () => service.saveBudget(budgetInput, 'budget-save'))
    ).resolves.toMatchObject({ value: { id: budgetWireFixture.id } });
    const budgetMove = await use('previewBudgetMove', () =>
      service.previewBudgetMove({
        budgetId: budgetWireFixture.id,
        fromCategoryId: category.categoryId,
        toCategoryId: secondCategory.categoryId,
        amountMinor: 10
      })
    );
    expect(budgetMove.categories).toHaveLength(2);
    await expect(
      use('confirmBudgetMove', () =>
        service.confirmBudgetMove(budgetMove.previewId, 'budget-move')
      )
    ).resolves.toMatchObject({
      value: { budget: { id: budgetWireFixture.id } }
    });
    await expect(
      use('setBudgetStatus', () =>
        service.setBudgetStatus(
          budgetWireFixture.id,
          1,
          'paused',
          'budget-status'
        )
      )
    ).resolves.toMatchObject({ value: { id: budgetWireFixture.id } });
    await expect(
      use('deleteBudget', () =>
        service.deleteBudget(budgetWireFixture.id, 1, 'budget-delete')
      )
    ).resolves.toMatchObject({ value: { status: 'deleted' } });

    await expect(
      use('getObligationsOverview', () =>
        service.getObligationsOverview({ status: 'active' })
      )
    ).resolves.toMatchObject({ payablesByCurrency: { SAR: 100 } });
    await expect(
      use('listObligations', () =>
        service.listObligations({ status: 'active' })
      )
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      use('getObligation', () => service.getObligation(obligationId))
    ).resolves.toMatchObject({
      obligation: { id: obligationId },
      paymentHistoryState: 'unavailable'
    });
    await expect(
      use('createObligation', () =>
        service.createObligation(obligationInput, 'obligation-create')
      )
    ).resolves.toMatchObject({ value: { id: obligationId } });
    await expect(
      use('updateObligation', () =>
        service.updateObligation(
          obligationId,
          4,
          obligationInput,
          'obligation-update'
        )
      )
    ).resolves.toMatchObject({ value: { id: obligationId } });
    await expect(
      use('setObligationStatus', () =>
        service.setObligationStatus(
          obligationId,
          4,
          'paused',
          'obligation-status'
        )
      )
    ).resolves.toMatchObject({ value: { id: obligationId } });
    const paymentPreview = await use('previewObligationPayment', () =>
      service.previewObligationPayment({
        obligationId,
        amountMinor: 100,
        currencyCode: 'SAR',
        paidDate: '2026-09-09',
        source: 'manual',
        transaction: { kind: 'link', transactionId }
      })
    );
    expect(paymentPreview.case).toBe('full');
    await expect(
      use('confirmObligationPayment', () =>
        service.confirmObligationPayment(
          paymentPreview.previewId,
          { allocations: paymentPreview.allocations, intent: 'current' },
          'payment-confirm'
        )
      )
    ).resolves.toMatchObject({ value: { payment: { id: paymentId } } });
    await expect(
      use('reverseObligationPayment', () =>
        service.reverseObligationPayment(paymentId, 'payment-reverse')
      )
    ).resolves.toMatchObject({ value: { payment: { status: 'reversed' } } });
    await expect(
      use('previewEarlySettlement', () =>
        service.previewEarlySettlement(obligationId)
      )
    ).rejects.toMatchObject({ code: 'offline_unavailable' });
    await expect(
      use('confirmEarlySettlement', () =>
        service.confirmEarlySettlement('unsupported', 'settlement-confirm')
      )
    ).rejects.toMatchObject({ code: 'offline_unavailable' });

    await expect(
      use('listPaymentMatches', () =>
        service.listPaymentMatches({ status: 'review_required' })
      )
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      use('getPaymentMatch', () => service.getPaymentMatch(matchId))
    ).resolves.toMatchObject({ id: matchId });
    await expect(
      use('resolvePaymentMatch', () =>
        service.resolvePaymentMatch(
          { matchId, obligationId: null, action: 'ignore' },
          'match-ignore'
        )
      )
    ).resolves.toMatchObject({ value: { match: { status: 'ignored' } } });

    await expect(
      use('listGoals', () => service.listGoals({ status: 'active' }))
    ).resolves.toHaveLength(1);
    await expect(
      use('getGoal', () => service.getGoal(savingsGoalWireFixture.id))
    ).resolves.toMatchObject({ progress: { currentMinor: { value: 550000 } } });
    await expect(
      use('createGoal', () => service.createGoal(goalInput, 'goal-create'))
    ).resolves.toMatchObject({ value: { id: savingsGoalWireFixture.id } });
    await expect(
      use('updateGoal', () =>
        service.updateGoal(
          savingsGoalWireFixture.id,
          1,
          goalInput,
          'goal-update'
        )
      )
    ).resolves.toMatchObject({ value: { id: savingsGoalWireFixture.id } });
    await expect(
      use('setGoalStatus', () =>
        service.setGoalStatus(
          savingsGoalWireFixture.id,
          1,
          'paused',
          'goal-status'
        )
      )
    ).resolves.toMatchObject({ value: { id: savingsGoalWireFixture.id } });
    const goalPreview = await use('previewGoalMovement', () =>
      service.previewGoalMovement({
        goalId: savingsGoalWireFixture.id,
        kind: 'contribution',
        amountMinor: 50000,
        movementDate: '2026-09-09',
        linkedTransactionId: transactionId
      })
    );
    expect(goalPreview.amountMinor).toBe(50000);
    await expect(
      use('confirmGoalMovement', () =>
        service.confirmGoalMovement(goalPreview.previewId, 'goal-confirm')
      )
    ).resolves.toMatchObject({ value: { movement: { id: movementId } } });
    await expect(
      use('reverseGoalMovement', () =>
        service.reverseGoalMovement(movementId, 'goal-reverse')
      )
    ).resolves.toMatchObject({ value: { movement: { kind: 'reversal' } } });

    const draft = {
      id: 'contract-draft',
      kind: 'budget' as const,
      entityId: null,
      payload: { periodKey: '2026-09' },
      status: 'editing' as const,
      updatedAt: 1
    };
    const savedDraft = await use('saveDraft', () => service.saveDraft(draft));
    expect(savedDraft).toMatchObject({
      ...draft,
      updatedAt: expect.any(Number)
    });
    await expect(
      use('loadDraft', () => service.loadDraft(draft.id))
    ).resolves.toEqual(savedDraft);
    await expect(
      use('discardDraft', () => service.discardDraft(draft.id))
    ).resolves.toBeUndefined();
    await expect(
      use('getConflict', () => service.getConflict(fixturePlanningConflict.id))
    ).resolves.toEqual(fixturePlanningConflict);
    await expect(
      use('resolveConflict', () =>
        service.resolveConflict(fixturePlanningConflict.id, 'keep_later')
      )
    ).resolves.toMatchObject({ value: fixturePlanningConflict.laterSnapshot });

    expect([...covered].sort()).toEqual([...methods].sort());
  });

  it('rejects previews that cannot be backed by authoritative server state', async () => {
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      token: async () => 'owner'
    });
    await expect(
      service.previewObligationPayment({
        obligationId: '70000000-0000-4000-8000-000000000001',
        amountMinor: 100,
        currencyCode: 'SAR',
        paidDate: '2026-09-09',
        source: 'manual',
        transaction: { kind: 'create', input: {} as never }
      })
    ).rejects.toMatchObject({ code: 'offline_unavailable' });
    await expect(
      service.previewEarlySettlement('70000000-0000-4000-8000-000000000001')
    ).rejects.toMatchObject({ code: 'offline_unavailable' });
  });

  it('maps partial salary allocation and exact currency amounts from the owner summary', async () => {
    const request = jest.fn().mockResolvedValue(
      response({
        period: '2026-09',
        dataState: 'partial',
        ledgerVersion: 41,
        salary: {
          id: '70000000-0000-4000-8000-000000000091',
          name: 'Employer',
          currencyCode: 'SAR',
          expectedMinor: '1200000',
          actualIncomeMinor: '1000000',
          actualExpenseMinor: '250001',
          reservedObligationMinor: '149999',
          nextExpectedAt: '2026-09-20T00:00:00.000Z'
        },
        budgets: [],
        obligations: {
          payables: [
            {
              id: '70000000-0000-4000-8000-000000000081',
              name: 'Loan',
              direction: 'payable',
              currencyCode: 'SAR',
              scheduledMinor: '149999',
              allocatedMinor: '0',
              paidMinor: '0',
              remainingMinor: '149999',
              overdueMinor: '0',
              nextDueAt: '2026-09-20T00:00:00.000Z',
              completedInstallmentCount: 0,
              status: 'active',
              ledgerVersion: 41
            }
          ],
          receivables: []
        },
        savings: [],
        requestId: 'planning-summary'
      })
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    const overview = await service.getPlanningOverview({
      currencyCode: 'SAR',
      today: '2026-09-09'
    });
    expect(overview).toMatchObject({
      dataState: 'partial',
      salary: {
        dataState: 'partial',
        income: {
          value: { minorUnits: 1000000, currencyCode: 'SAR', scale: 2 }
        },
        expenses: {
          value: { minorUnits: 250001, currencyCode: 'SAR', scale: 2 }
        },
        reservedObligations: {
          value: { minorUnits: 149999, currencyCode: 'SAR', scale: 2 }
        },
        remaining: {
          value: { minorUnits: 600000, currencyCode: 'SAR', scale: 2 }
        }
      },
      obligationsDueMinor: {
        value: { minorUnits: 149999, currencyCode: 'SAR', scale: 2 }
      }
    });
  });

  it('uses 0-100 budget percentages and authoritative savings progress without a fabricated forecast', async () => {
    const request = jest.fn().mockResolvedValue(
      response({
        period: '2026-09',
        dataState: 'ready',
        ledgerVersion: 41,
        salary: null,
        budgets: [
          {
            id: budgetWireFixture.id,
            name: budgetWireFixture.name,
            currencyCode: 'SAR',
            totalMinor: '500000',
            spentMinor: '425000',
            remainingMinor: '75000',
            ledgerVersion: 41,
            dataState: 'complete',
            categories: []
          }
        ],
        obligations: { payables: [], receivables: [] },
        savings: [savingsGoalWireFixture],
        requestId: 'planning-summary'
      })
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });

    await expect(
      service.getPlanningOverview({
        currencyCode: 'SAR',
        today: '2026-09-09'
      })
    ).resolves.toMatchObject({
      budget: {
        percentage: { status: 'available', value: 85 },
        forecastMinor: {
          status: 'unavailable',
          reason: 'insufficient_history'
        },
        state: 'threshold'
      },
      savings: [
        {
          currentMinor: { status: 'available', value: 550000 },
          remainingMinor: { status: 'available', value: 1450000 },
          percentage: { status: 'available', value: 28 }
        }
      ]
    });
  });

  it('rounds large safe budget percentages without floating-point drift', async () => {
    const request = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/summary'))
        return response({
          ...budgetSummary,
          totalMinor: '9007199254740991',
          spentMinor: '7160723407519087',
          remainingMinor: '1846475847221904'
        });
      return response({
        ...budgetWireFixture,
        totalMinor: '9007199254740991',
        categories: [],
        requestId: 'large-budget-detail'
      });
    });
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });

    await expect(
      service.getBudgetById(budgetWireFixture.id)
    ).resolves.toMatchObject({
      progress: { percentage: { status: 'available', value: 79 } }
    });
  });

  it('rejects an unsafe derived budget category amount', async () => {
    const request = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/summary')) return response(budgetSummary);
      return response({
        ...budgetWireFixture,
        categories: [
          { ...category, limitMinor: '1' },
          {
            ...category,
            id: '70000000-0000-4000-8000-000000000098',
            categoryId: '70000000-0000-4000-8000-000000000097',
            limitMinor: '9007199254740991'
          }
        ],
        requestId: 'unsafe-budget-detail'
      });
    });
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });

    await expect(
      service.previewBudgetMove({
        budgetId: budgetWireFixture.id,
        fromCategoryId: category.categoryId,
        toCategoryId: '70000000-0000-4000-8000-000000000097',
        amountMinor: 1
      })
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  it('rejects unsafe per-currency obligation totals', async () => {
    const obligation = (id: string) => ({
      id,
      name: 'Large obligation',
      direction: 'payable' as const,
      type: 'debt' as const,
      scheduleKind: 'fixed_term' as const,
      currencyCode: 'SAR',
      principalMinor: '4503599627370496',
      openingPaidMinor: '0',
      installmentAmountMinor: '4503599627370496',
      installmentCount: 1,
      frequency: 'monthly' as const,
      expectedDay: 20,
      customIntervalDays: null,
      startDate: '2026-09-01',
      endDate: null,
      status: 'active' as const,
      defaultAccountId: null,
      automaticMatchingEnabled: true,
      provider: null,
      providerKeywords: [],
      reminderTiming: null,
      notes: null,
      deletedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 1
    });
    const items = [
      obligation('70000000-0000-4000-8000-000000000071'),
      obligation('70000000-0000-4000-8000-000000000072')
    ];
    const request = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/planning/summary'))
        return response({
          period: '2026-09',
          dataState: 'ready',
          ledgerVersion: 1,
          salary: null,
          budgets: [],
          obligations: {
            payables: items.map((item) => ({
              id: item.id,
              name: item.name,
              direction: item.direction,
              currencyCode: item.currencyCode,
              scheduledMinor: item.principalMinor,
              allocatedMinor: '0',
              paidMinor: '0',
              remainingMinor: item.principalMinor,
              overdueMinor: '0',
              nextDueAt: '2026-09-20T00:00:00.000Z',
              completedInstallmentCount: 0,
              status: item.status,
              ledgerVersion: 1
            })),
            receivables: []
          },
          savings: []
        });
      return response({ items, nextCursor: null, requestId: 'obligations' });
    });
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });

    await expect(service.getObligationsOverview({})).rejects.toMatchObject({
      code: 'contract_mismatch'
    });
  });

  it('accepts expected salary occurrences but exposes only linked receipts', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        response({
          items: [salaryProfileWireFixture],
          nextCursor: null,
          requestId: 'profiles'
        })
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              id: '70000000-0000-4000-8000-000000000080',
              salaryProfileId: salaryProfileWireFixture.id,
              transactionId: null,
              expectedAt: '2026-09-30T00:00:00.000Z',
              receivedAt: null,
              amountMinor: '1200000',
              status: 'expected',
              operationId: null,
              replacesReceiptId: null,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
              version: 1
            }
          ],
          nextCursor: null,
          requestId: 'receipts'
        })
      );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    await expect(
      service.getSalaryReceiptReview('70000000-0000-4000-8000-000000000081')
    ).resolves.toBeNull();
  });

  it('traverses complete goal pages and preserves rich optional fields and versions', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce(
        response({ items: [], nextCursor: 'second-page', requestId: 'goals-a' })
      )
      .mockResolvedValueOnce(
        response({
          items: [
            { ...savingsGoalWireFixture, iconKey: 'shield', version: 23 }
          ],
          nextCursor: null,
          requestId: 'goals-b'
        })
      );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    await expect(service.listGoals({ status: 'active' })).resolves.toEqual([
      expect.objectContaining({
        id: savingsGoalWireFixture.id,
        title: 'Emergency',
        targetMinor: 2000000,
        openingTrackedMinor: 500000,
        linkedAccountId: savingsGoalWireFixture.linkedAccountId,
        iconKey: 'shield',
        emergencyFund: true,
        version: 23
      })
    ]);
    expect(request.mock.calls[1][0]).toContain('cursor=second-page');
  });

  it('clamps overfunded goal amounts and rejects unsafe aggregate money', async () => {
    const overfunded = {
      ...savingsGoalWireFixture,
      progressMinor: '2500000',
      remainingMinor: '-500000',
      progressBps: 12500
    };
    const summary = {
      period: '2026-09',
      dataState: 'ready',
      ledgerVersion: 1,
      salary: null,
      budgets: [],
      obligations: { payables: [], receivables: [] },
      savings: [overfunded]
    };
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request: jest.fn().mockResolvedValue(response(summary))
    });

    await expect(
      service.getPlanningOverview({ currencyCode: 'SAR', today: '2026-09-09' })
    ).resolves.toMatchObject({
      savings: [
        {
          remainingMinor: { value: 0 },
          requiredMonthlyMinor: { value: 0 },
          percentage: { value: 100 },
          state: 'target_reached'
        }
      ]
    });

    const overflow = {
      ...summary,
      salary: {
        id: salaryProfileWireFixture.id,
        name: 'Employer',
        currencyCode: 'SAR',
        expectedMinor: '1',
        actualIncomeMinor: String(Number.MAX_SAFE_INTEGER),
        actualExpenseMinor: '-1',
        reservedObligationMinor: '0',
        nextExpectedAt: '2026-09-30T00:00:00.000Z'
      },
      savings: []
    };
    const unsafe = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request: jest.fn().mockResolvedValue(response(overflow))
    });
    await expect(
      unsafe.getSalaryOverview({ today: '2026-09-09' })
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  it('does not invent required obligation fields or movement metadata', async () => {
    const request = jest.fn().mockResolvedValue(
      response({
        ...savingsGoalWireFixture,
        movements: [
          {
            id: '70000000-0000-4000-8000-000000000078',
            goalId: savingsGoalWireFixture.id,
            transactionId: '70000000-0000-4000-8000-000000000073',
            amountMinor: '50000',
            occurredAt: '2026-09-09T00:00:00.000Z',
            kind: 'contribution',
            operationId: '70000000-0000-4000-8000-000000000079',
            replacesMovementId: null,
            createdAt: '2026-09-09T00:00:00.000Z'
          }
        ]
      })
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    await expect(
      service.getGoal(savingsGoalWireFixture.id)
    ).resolves.toMatchObject({
      movements: [{ version: null, updatedAt: null }]
    });

    await expect(
      service.createObligation(
        {
          direction: 'payable',
          type: 'debt',
          scheduleKind: 'fixed_term',
          title: 'Missing authoritative fields',
          currencyCode: 'SAR'
        },
        'missing-fields'
      )
    ).rejects.toMatchObject({ code: 'validation' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses fixed-count aggregate reads instead of per-record fan-out', async () => {
    const summary = {
      period: '2026-09',
      dataState: 'ready',
      ledgerVersion: 1,
      salary: null,
      budgets: [
        {
          id: budgetWireFixture.id,
          name: budgetWireFixture.name,
          currencyCode: 'SAR',
          totalMinor: '500000',
          spentMinor: '125000',
          remainingMinor: '375000',
          ledgerVersion: 1,
          dataState: 'complete',
          categories: [{ budgetId: budgetWireFixture.id, ...category }]
        }
      ],
      obligations: { payables: [], receivables: [] },
      savings: []
    };
    const request = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/planning/summary')) return response(summary);
      if (url.includes('/budgets'))
        return response({ items: [budgetWireFixture], nextCursor: null });
      return response({ items: [], nextCursor: null });
    });
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });

    await expect(service.listBudgets('2026-09')).resolves.toMatchObject([
      {
        categories: [{ id: category.id }],
        progress: { percentage: { value: 25 } }
      }
    ]);
    expect(request).toHaveBeenCalledTimes(2);

    request.mockClear();
    await expect(
      service.getReportingSnapshot(
        resolveReportPeriod({
          kind: 'monthly',
          anchorDate: '2026-09-09',
          timeZone: 'UTC',
          now: Date.parse('2026-09-09T00:00:00.000Z')
        })
      )
    ).resolves.toMatchObject({
      dataState: 'partial',
      categoryBudgets: [{ id: category.id }]
    });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('rechecks the accepted budget version before confirming a local move', async () => {
    let detailReads = 0;
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async (input) => {
        const url = String(input);
        if (url.endsWith('/summary')) return response(budgetSummary);
        if (url.includes(`/budgets/${budgetWireFixture.id}`)) {
          detailReads += 1;
          return response({
            ...budgetWireFixture,
            version: detailReads === 1 ? 1 : 2,
            categories: [
              category,
              {
                ...category,
                id: '70000000-0000-4000-8000-000000000098',
                categoryId: '70000000-0000-4000-8000-000000000097',
                limitMinor: '100000'
              }
            ],
            requestId: `budget-${detailReads}`
          });
        }
        throw new Error(`unexpected ${url}`);
      }
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    const preview = await service.previewBudgetMove({
      budgetId: budgetWireFixture.id,
      fromCategoryId: category.categoryId,
      toCategoryId: '70000000-0000-4000-8000-000000000097',
      amountMinor: 10
    });
    await expect(
      service.confirmBudgetMove(preview.previewId, 'budget-move-key')
    ).rejects.toMatchObject({ code: 'stale_preview' });
    expect(
      request.mock.calls.filter(([, init]) => init?.method === 'PUT')
    ).toHaveLength(0);
  });

  it('replays a budget root and resumes its category write with stable keys', async () => {
    const rootKey = 'budget-save-key';
    let categoryWrites = 0;
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async (input, init) => {
        const url = String(input);
        if (init?.method === 'POST')
          return response(mutation(budgetWireFixture), 201);
        if (init?.method === 'PUT') {
          categoryWrites += 1;
          if (categoryWrites === 1)
            return response(
              {
                code: 'SERVICE_UNAVAILABLE',
                message: 'hidden',
                requestId: 'failed-category'
              },
              503
            );
          return response(
            mutation({
              id: budgetWireFixture.id,
              version: 2,
              allocationCount: 1
            })
          );
        }
        if (url.endsWith('/summary')) return response(budgetSummary);
        if (init?.method === 'GET')
          return response({
            ...budgetWireFixture,
            version: 2,
            categories: [category],
            requestId: 'budget-detail'
          });
        throw new Error(`unexpected ${url}`);
      }
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    const input = {
      name: 'September',
      periodKey: '2026-09',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 500000,
      incomeTargetMinor: 1200000,
      savingsTargetMinor: 200000,
      categories: [
        {
          id: category.id,
          budgetId: budgetWireFixture.id,
          categoryId: category.categoryId,
          limitMinor: 200000,
          alertThresholds: [75, 90],
          status: 'active' as const,
          version: 7,
          syncStatus: 'synced' as const,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    };
    await expect(service.saveBudget(input, rootKey)).rejects.toMatchObject({
      code: 'provider_unavailable'
    });
    await expect(service.saveBudget(input, rootKey)).resolves.toMatchObject({
      value: { id: budgetWireFixture.id, version: 2 }
    });
    const keys = request.mock.calls
      .filter(([, init]) => init?.method === 'POST' || init?.method === 'PUT')
      .map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'));
    expect(keys).toEqual([
      rootKey,
      `${rootKey}:categories`,
      rootKey,
      `${rootKey}:categories`
    ]);
  });

  it('uses only an authoritative linked transaction and preserves the server operation id', async () => {
    const obligationId = '70000000-0000-4000-8000-000000000071';
    const scheduleId = '70000000-0000-4000-8000-000000000072';
    const transactionId = '70000000-0000-4000-8000-000000000073';
    const paymentId = '70000000-0000-4000-8000-000000000074';
    const serverOperationId = '70000000-0000-4000-8000-000000000075';
    const obligation = {
      id: obligationId,
      name: 'Loan',
      direction: 'payable',
      type: 'debt',
      scheduleKind: 'fixed_term',
      currencyCode: 'SAR',
      principalMinor: '100',
      openingPaidMinor: '0',
      installmentAmountMinor: '100',
      installmentCount: 1,
      frequency: 'monthly',
      expectedDay: 20,
      customIntervalDays: null,
      startDate: '2026-09-01',
      endDate: null,
      status: 'active',
      defaultAccountId: null,
      automaticMatchingEnabled: true,
      provider: null,
      providerKeywords: [],
      reminderTiming: null,
      notes: null,
      deletedAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 4,
      summary: {
        direction: 'payable',
        currencyCode: 'SAR',
        scheduledMinor: '100',
        allocatedMinor: '0',
        paidMinor: '0',
        remainingMinor: '100',
        overdueMinor: '0',
        nextDueAt: '2026-09-20T00:00:00.000Z',
        completedInstallmentCount: 0,
        status: 'active',
        ledgerVersion: 3
      },
      requestId: 'obligation-detail'
    };
    const schedule = {
      id: scheduleId,
      obligationId,
      dueAt: '2026-09-20T00:00:00.000Z',
      amountMinor: '100',
      paidMinor: '0',
      status: 'due',
      sequenceNo: 1,
      kind: 'installment',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      version: 1
    };
    const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async (input, init) => {
        const url = String(input);
        if (init?.method === 'POST')
          return response(
            mutation(
              {
                id: paymentId,
                obligationId,
                transactionId,
                paidAt: '2026-09-09T00:00:00.000Z',
                amountMinor: '100',
                paymentMethod: null,
                paymentCase: 'full',
                allocationIntent: 'current',
                source: 'manual',
                status: 'confirmed',
                operationId: serverOperationId,
                createdAt: '2026-09-09T00:00:00.000Z',
                updatedAt: '2026-09-09T00:00:00.000Z',
                version: 1,
                obligationVersion: 5
              },
              serverOperationId
            ),
            201
          );
        if (url.includes('/schedule'))
          return response({
            items: [schedule],
            nextCursor: null,
            requestId: 'schedule'
          });
        return response(obligation);
      }
    );
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    await expect(
      service.previewObligationPayment({
        obligationId,
        amountMinor: 101,
        currencyCode: 'SAR',
        paidDate: '2026-09-09',
        source: 'manual',
        transaction: { kind: 'link', transactionId }
      })
    ).rejects.toMatchObject({ code: 'offline_unavailable' });
    const preview = await service.previewObligationPayment({
      obligationId,
      amountMinor: 100,
      currencyCode: 'SAR',
      paidDate: '2026-09-09',
      source: 'manual',
      transaction: { kind: 'link', transactionId }
    });
    const outcome = await service.confirmObligationPayment(
      preview.previewId,
      { allocations: preview.allocations, intent: 'current' },
      'payment-client-key'
    );
    expect(outcome.value.payment).toMatchObject({
      transactionId,
      operationId: serverOperationId,
      transactionOwnership: 'linked_existing',
      amountMinor: 100,
      version: 1
    });
    const post = request.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      transactionId,
      expectedVersion: 4
    });
    await expect(service.getObligation(obligationId)).resolves.toMatchObject({
      payments: [],
      paymentHistoryState: 'unavailable'
    });
  });

  test.each([
    [
      'unsafe money',
      { targetMinor: '9007199254740992' },
      { message: 'PLANNING_MINOR_UNSAFE' }
    ],
    ['unknown fields', { unexpected: true }, { code: 'contract_mismatch' }]
  ])(
    'rejects %s at the response boundary',
    async (_case, corruption, error) => {
      const request = jest.fn().mockResolvedValue(
        response({
          items: [
            {
              ...savingsGoalWireFixture,
              ...corruption
            }
          ],
          nextCursor: null
        })
      );
      const service = createLiveFinancialPlanningService({
        baseUrl: 'https://api.test',
        request
      });
      await expect(service.listGoals({})).rejects.toMatchObject(error);
    }
  );

  it('rejects unsafe outgoing money before making a request', async () => {
    const request = jest.fn();
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    await expect(
      service.saveBudget(
        {
          name: 'Unsafe',
          periodKey: '2026-09',
          currencyCode: 'SAR',
          configuredExpenseLimitMinor: Number.MAX_SAFE_INTEGER + 1,
          incomeTargetMinor: 0,
          savingsTargetMinor: 0
        },
        'unsafe-money'
      )
    ).rejects.toMatchObject({ code: 'validation' });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects unsupported payment-match confirmation before reading the network', async () => {
    const request = jest.fn();
    const service = createLiveFinancialPlanningService({
      baseUrl: 'https://api.test',
      request
    });
    await expect(
      service.resolvePaymentMatch(
        {
          matchId: '70000000-0000-4000-8000-000000000081',
          action: 'confirm',
          obligationId: '70000000-0000-4000-8000-000000000082'
        },
        'confirm-match'
      )
    ).rejects.toMatchObject({ code: 'offline_unavailable' });
    expect(request).not.toHaveBeenCalled();
  });

  it('clears local planning state on an ordinary identity reset', async () => {
    const service = createLiveFinancialPlanningService({ persistent: false });
    await service.saveDraft({
      id: 'owner-a-draft',
      kind: 'budget',
      entityId: null,
      payload: { owner: 'a' },
      status: 'editing',
      updatedAt: 1
    });
    await expect(service.loadDraft('owner-a-draft')).resolves.toMatchObject({
      payload: { owner: 'a' }
    });

    await resetRuntimeIdentityData();

    await expect(service.loadDraft('owner-a-draft')).resolves.toBeNull();
  });
});
