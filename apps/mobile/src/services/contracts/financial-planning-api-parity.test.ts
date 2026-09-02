import type { FinancialPlanningService } from './financial-planning-service';
import {
  mapBudgetFromApi,
  mapSalaryProfileFromApi,
  mapSavingsGoalFromApi,
  parsePlanningMinor
} from '../live/financial-planning-api-mapping';
import {
  budgetWireFixture,
  planningApiOperationParity,
  salaryProfileWireFixture,
  savingsGoalWireFixture
} from '@/test-utils/financial-planning-api-fixtures';
import { createProductionFinancialPlanningService } from '@/services/mocks/financial-planning-service';

describe('financial planning API parity', () => {
  it('maps every approved backend operation to an existing Mobile capability method', () => {
    const service = createProductionFinancialPlanningService();
    for (const method of Object.values(planningApiOperationParity))
      expect(typeof service[method as keyof FinancialPlanningService]).toBe(
        'function'
      );
  });

  it('maps backend field names and exact safe money into SQLite-exportable domain records', () => {
    const salary = mapSalaryProfileFromApi(salaryProfileWireFixture);
    const budget = mapBudgetFromApi(budgetWireFixture);
    const goal = mapSavingsGoalFromApi(savingsGoalWireFixture);
    expect(salary).toMatchObject({
      expectedAmountMinor: 1200000,
      sourceName: 'Employer',
      salaryDay: 31
    });
    expect(budget).toMatchObject({
      periodKey: '2026-09',
      configuredExpenseLimitMinor: 500000,
      rolloverCreditMinor: 25000
    });
    expect(goal).toMatchObject({ title: 'Emergency', targetMinor: 2000000 });
    expect(JSON.parse(JSON.stringify({ salary, budget, goal }))).toEqual({
      salary,
      budget,
      goal
    });
  });

  it('rejects an unsafe backend bigint instead of rounding financial values', () => {
    expect(() => parsePlanningMinor('9007199254740992')).toThrow(
      'PLANNING_MINOR_UNSAFE'
    );
    expect(parsePlanningMinor('-1')).toBe(-1);
  });

  it('keeps provider selection unchanged and does not silently enable a network provider', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').resolve(
        __dirname,
        '../mocks/financial-planning-service.ts'
      ),
      'utf8'
    );
    expect(source).toContain("process.env.NODE_ENV === 'test'");
    expect(source).not.toContain('financial-planning-api-mapping');
  });
});
