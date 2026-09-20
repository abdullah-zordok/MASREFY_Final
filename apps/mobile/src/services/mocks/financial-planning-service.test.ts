import { FinancialPlanningError } from '@/domain/financial-planning';
import { resolveReportPeriod } from '@/domain/reports';
import { Platform } from 'react-native';
import {
  createProductionFinancialPlanningService,
  createSeededFinancialPlanningService
} from './financial-planning-service';
import {
  fixtureBudget,
  fixtureCategoryBudget,
  fixtureGoal,
  fixtureObligation,
  fixtureSalaryProfile,
  fixtureSalaryReceipt
} from './financial-planning-fixtures';

const mockPlanningRows = new Map<string, unknown[]>();
const mockPlanningDatabase = {
  execAsync: jest.fn(async () => undefined),
  runAsync: jest.fn(async () => ({})),
  getAllAsync: jest.fn(async (sql: string) => {
    const table = [...mockPlanningRows.keys()].find((name) => sql.includes(name));
    return table
      ? mockPlanningRows.get(table)!.map((row) => ({ payload: JSON.stringify(row) }))
      : [];
  })
};

jest.mock('@/storage/database', () => ({
  openDatabase: jest.fn(async () => mockPlanningDatabase),
  runExclusiveDatabaseTransaction: jest.fn(async (_database, task) =>
    task(mockPlanningDatabase)
  )
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockPlanningRows.clear();
});

it('seeds the production planning provider only in client demo mode', async () => {
  const previous = process.env.EXPO_PUBLIC_DEMO_MODE;
  const period = resolveReportPeriod({
    kind: 'monthly',
    anchorDate: '2026-01-15',
    timeZone: 'Asia/Riyadh',
    now: Date.UTC(2026, 0, 15)
  });
  try {
    delete process.env.EXPO_PUBLIC_DEMO_MODE;
    expect(
      (
        await createProductionFinancialPlanningService().getReportingSnapshot(
          period
        )
      ).budgets
    ).toEqual([]);

    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    expect(
      (
        await createProductionFinancialPlanningService().getReportingSnapshot(
          period
        )
      ).budgets
    ).toEqual([expect.objectContaining({ id: 'demo-budget-current' })]);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_DEMO_MODE;
    else process.env.EXPO_PUBLIC_DEMO_MODE = previous;
  }
});

it('keeps current demo salary dates isolated from stale native persistence', async () => {
  const previousDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 7, 24, 12));
  jest.replaceProperty(Platform, 'OS', 'android');
  mockPlanningRows.set('planning_salary_profiles', [fixtureSalaryProfile]);
  mockPlanningRows.set('planning_salary_receipts', [fixtureSalaryReceipt]);

  try {
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    process.env.NODE_ENV = 'development';
    const cycle = await createProductionFinancialPlanningService().getSalaryOverview(
      { today: '2026-08-24', timeZone: 'Asia/Riyadh' }
    );

    expect(cycle.projectedNextSalaryDate).toBe('2026-09-01');
    expect(cycle.daysRemaining).toBe(8);
  } finally {
    if (previousDemoMode === undefined)
      delete process.env.EXPO_PUBLIC_DEMO_MODE;
    else process.env.EXPO_PUBLIC_DEMO_MODE = previousDemoMode;
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

it('returns deterministic overview, empty-like reads, and scoped mutation results', async () => {
  const service = createSeededFinancialPlanningService();
  const overview = await service.getPlanningOverview({
    currencyCode: 'SAR',
    today: '2026-01-15',
    timeZone: 'Asia/Riyadh'
  });
  expect(overview.dataState).toBe('ready');
  expect(overview.savings.length).toBe(1);

  const budget = await service.getBudget(fixtureBudget.periodKey);
  expect(budget?.budget.id).toBe(fixtureBudget.id);
  const copiedDraft = await service.createBudgetDraftFromPrevious('2026-02');
  expect(copiedDraft.payload).toMatchObject({
    copiedFromBudgetId: fixtureBudget.id,
    configuredExpenseLimitMinor: fixtureBudget.configuredExpenseLimitMinor
  });

  const saved = await service.saveBudget(
    {
      name: 'February budget',
      periodKey: '2026-02',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 10_00,
      incomeTargetMinor: 20_00,
      savingsTargetMinor: 5_00,
      categories: [{ ...fixtureCategoryBudget, limitMinor: 5_00 }]
    },
    'op-budget-feb'
  );
  expect(saved.affectedScopes).toContain('planning.overview');
  expect(
    (await service.getBudgetById(saved.value.id)).categories[0].budgetId
  ).toBe(saved.value.id);
  const replayed = await service.saveBudget(
    {
      name: 'February budget',
      periodKey: '2026-02',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 10_00,
      incomeTargetMinor: 20_00,
      savingsTargetMinor: 5_00,
      categories: [{ ...fixtureCategoryBudget, limitMinor: 5_00 }]
    },
    'op-budget-feb'
  );
  expect(replayed.value.id).toBe(saved.value.id);
});

it('lists every named budget in a period and keeps the singular read deterministic', async () => {
  const service = createSeededFinancialPlanningService();
  await service.saveBudget(
    {
      name: 'Home',
      periodKey: '2032-08',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 5_000_00,
      incomeTargetMinor: 0,
      savingsTargetMinor: 0,
      categories: [
        {
          ...fixtureCategoryBudget,
          id: 'category-budget-home',
          categoryId: 'housing'
        }
      ]
    },
    'budget-home'
  );
  await service.saveBudget(
    {
      name: 'Personal',
      periodKey: '2032-08',
      currencyCode: 'SAR',
      configuredExpenseLimitMinor: 2_000_00,
      incomeTargetMinor: 0,
      savingsTargetMinor: 0,
      categories: [
        {
          ...fixtureCategoryBudget,
          id: 'category-budget-personal',
          categoryId: 'food'
        }
      ]
    },
    'budget-personal'
  );

  const budgets = await service.listBudgets('2032-08');
  expect(budgets.map((detail) => detail.budget.name)).toEqual([
    'Home',
    'Personal'
  ]);
  expect((await service.getBudget('2032-08'))?.budget.name).toBe('Personal');
});

it('does not retain a budget when category validation rejects the save', async () => {
  const service = createSeededFinancialPlanningService();

  await expect(
    service.saveBudget(
      {
        name: 'Invalid budget',
        periodKey: '2034-01',
        currencyCode: 'SAR',
        configuredExpenseLimitMinor: 100_00,
        incomeTargetMinor: 0,
        savingsTargetMinor: 0,
        categories: [{ ...fixtureCategoryBudget, limitMinor: 200_00 }]
      },
      'invalid-budget-save'
    )
  ).rejects.toThrow(FinancialPlanningError);
  expect(await service.listBudgets('2034-01')).toEqual([]);
});

it('keeps previews side-effect free and confirms with operation IDs', async () => {
  const service = createSeededFinancialPlanningService();
  const before = await service.getObligation(fixtureObligation.id);
  const preview = await service.previewObligationPayment({
    obligationId: fixtureObligation.id,
    amountMinor: 250_00,
    currencyCode: 'SAR',
    paidDate: '2026-01-20',
    source: 'manual',
    transaction: { kind: 'link', transactionId: 'transaction-existing' }
  });
  expect((await service.getObligation(fixtureObligation.id)).payments).toEqual(
    before.payments
  );
  const confirmed = await service.confirmObligationPayment(
    preview.previewId,
    { allocations: preview.allocations, intent: 'current' },
    'op-confirm-payment'
  );
  expect(confirmed.value.payment.transactionOwnership).toBe('linked_existing');
  await expect(
    service.confirmObligationPayment(
      'missing-preview',
      {
        allocations: [],
        intent: 'current'
      },
      'op-stale'
    )
  ).rejects.toThrow(FinancialPlanningError);
});

it('keeps mock payment-match detail structurally aligned with live data', async () => {
  const match = await createSeededFinancialPlanningService().getPaymentMatch(
    'match-payment-car'
  );

  expect(match).toMatchObject({
    transaction: {
      amountMinor: expect.any(Number),
      currencyCode: 'SAR'
    },
    candidate: {
      id: fixtureObligation.id,
      obligationVersion: fixtureObligation.version
    },
    suggestedAllocation: {
      amountMinor: expect.any(Number)
    }
  });
});

it('settles only the current outstanding amount from a stored preview', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-04T12:00:00Z').getTime());
  const service = createSeededFinancialPlanningService();

  const preview = await service.previewEarlySettlement(fixtureObligation.id);
  const settled = await service.confirmEarlySettlement(
    preview.previewId,
    'early-settlement-1'
  );

  expect(preview.settlementMinor).toBe(48_000_00);
  expect(settled.value.payment).toMatchObject({
    amountMinor: preview.settlementMinor,
    paidDate: '2026-03-04',
    case: 'settlement'
  });
  await expect(
    service.confirmEarlySettlement('settlement-forged', 'forged')
  ).rejects.toThrow(FinancialPlanningError);
});

it('rejects early settlement when the outstanding balance is unavailable', async () => {
  const service = createSeededFinancialPlanningService();
  const created = await service.createObligation(
    {
      direction: 'payable',
      type: 'custom',
      scheduleKind: 'open_ended',
      title: 'Open-ended debt',
      currencyCode: 'SAR',
      contractedTotalMinor: null
    },
    'open-ended-obligation'
  );

  await expect(
    service.previewEarlySettlement(created.value.id)
  ).rejects.toMatchObject({ code: 'validation' });
  expect((await service.getObligation(created.value.id)).obligation.status).toBe(
    'active'
  );
});

it('keeps savings movements tracking-only', async () => {
  const service = createSeededFinancialPlanningService();
  const preview = await service.previewGoalMovement({
    goalId: fixtureGoal.id,
    kind: 'contribution',
    amountMinor: 250_00,
    movementDate: '2026-01-20'
  });
  const confirmed = await service.confirmGoalMovement(
    preview.previewId,
    'op-goal-contribution'
  );
  expect(confirmed.value.movement.linkedTransactionId).toBeNull();
  expect(confirmed.affectedScopes).toContain(`planning.goal.${fixtureGoal.id}`);
});

it('keeps assistant goal operation IDs idempotent and owner versions enforced', async () => {
  const service = createSeededFinancialPlanningService();
  const input = {
    title: 'Assistant emergency goal',
    targetMinor: 300_00,
    currencyCode: 'SAR',
    targetDate: '2026-12-31' as const,
    openingTrackedMinor: 0
  };

  const first = await service.createGoal(input, 'assistant-goal-op-1');
  const replay = await service.createGoal(
    { ...input, targetMinor: 999_00 },
    'assistant-goal-op-1'
  );
  expect(replay.value).toEqual(first.value);
  expect(
    (await service.listGoals({})).filter((goal) => goal.id === first.value.id)
  ).toHaveLength(1);

  await service.updateGoal(
    first.value.id,
    first.value.version,
    { ...input, title: 'Owner reviewed goal' },
    'assistant-goal-update-1'
  );
  await expect(
    service.updateGoal(
      first.value.id,
      first.value.version,
      { ...input, title: 'Stale assistant edit' },
      'assistant-goal-stale'
    )
  ).rejects.toThrow(FinancialPlanningError);
});

it('uses the configured time zone for salary confirmation and undo outcomes', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 0, 1, 0, 30));
  const service = createSeededFinancialPlanningService();
  const confirmation = await service.confirmSalaryReceipt(
    {
      salaryProfileId: fixtureSalaryProfile.id,
      transactionId: 'salary-boundary',
      expectedOccurrenceDate: '2025-12-31',
      receivedDate: '2025-12-31',
      timeZone: 'America/Los_Angeles'
    },
    'salary-boundary-confirm'
  );

  expect(confirmation.value.cycle.daysRemaining).toBe(31);

  const undo = await service.undoSalaryReceipt(
    confirmation.value.receipt.id,
    'salary-boundary-undo',
    'America/Los_Angeles'
  );
  expect(undo.value.cycle.daysRemaining).toBe(31);
});
