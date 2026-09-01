import { HttpException } from '@nestjs/common';

import { PlanningService } from '../../../src/planning/planning.service';
import { PlanningRepository } from '../../../src/planning/planning.repository';

const principal = { userId: 'summary_owner', sessionId: 'session', factorAgeSeconds: 0 };

describe('planning summary service', () => {
  it('assembles independent budgets, partial state, exact money, and the owner ledger version', async () => {
    const query = jest.fn((sql: string) => {
      if (
        sql === 'begin' ||
        sql === 'commit' ||
        sql.startsWith('set local') ||
        sql.startsWith('select set_config')
      )
        return { rows: [] };
      if (sql.includes('from public.salary_profiles'))
        return {
          rows: [
            {
              id: 'salary',
              name: 'Employer',
              currency_code: 'SAR',
              expected_minor: '1000',
              actual_income_minor: '900',
              actual_expense_minor: '300',
              reserved_obligation_minor: '100',
              next_expected_at: null,
            },
          ],
        };
      if (sql.includes('from public.budgets b'))
        return {
          rows: [
            {
              id: 'budget-a',
              name: 'A',
              currency_code: 'SAR',
              total_minor: '500',
              spent_minor: '200',
              remaining_minor: '300',
              ledger_version: '7',
              data_state: 'complete',
            },
            {
              id: 'budget-b',
              name: 'B',
              currency_code: 'SAR',
              total_minor: '800',
              spent_minor: '0',
              remaining_minor: '800',
              ledger_version: '7',
              data_state: 'partial',
            },
          ],
        };
      if (sql.includes('from public.obligations o')) return { rows: [] };
      if (sql.includes('from public.savings_goals g')) return { rows: [] };
      if (sql.includes('max(ab.ledger_version)')) return { rows: [{ version: '7' }] };
      throw new Error(`unexpected query: ${sql}`);
    });
    const repository = new PlanningRepository({
      withClient: async (action: (client: unknown) => Promise<unknown>) => action({ query }),
    } as never);
    await expect(
      repository.getPlanningSummary(
        principal,
        { key: '2026-02', start: '2026-02-01', end: '2026-02-28' },
        'request',
      ),
    ).resolves.toMatchObject({
      dataState: 'partial',
      ledgerVersion: 7,
      salary: { expectedMinor: '1000' },
      budgets: [
        { id: 'budget-a', spentMinor: '200' },
        { id: 'budget-b', spentMinor: '0' },
      ],
    });
  });

  it('normalizes one calendar month and preserves the uncached owner boundary', async () => {
    const getPlanningSummary = jest.fn().mockResolvedValue({
      period: '2026-02',
      dataState: 'ready',
      ledgerVersion: 8,
      salary: null,
      budgets: [],
      obligations: { payables: [], receivables: [] },
      savings: [],
    });
    const service = new PlanningService({ getPlanningSummary } as never);

    await service.getPlanningSummary(principal, { period: '2026-02' }, 'request-one');
    await service.getPlanningSummary(principal, { period: '2026-02' }, 'request-two');

    expect(getPlanningSummary).toHaveBeenNthCalledWith(
      1,
      principal,
      { key: '2026-02', start: '2026-02-01', end: '2026-02-28' },
      'request-one',
    );
    expect(getPlanningSummary).toHaveBeenCalledTimes(2);
  });

  it.each([{}, { period: '2026-13' }, { period: '2026-2' }, { period: ['2026-02'] }])(
    'rejects an invalid period %#',
    (query) => {
      const service = new PlanningService({} as never);
      expect(() => service.getPlanningSummary(principal, query, 'request')).toThrow(HttpException);
    },
  );
});
