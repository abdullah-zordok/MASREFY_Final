import { readFileSync } from 'node:fs';

import { buildPlanningEvent } from '../../../src/planning/planning.events';
import {
  decodePlanningCursor,
  normalizeBudgetCreate,
  normalizePlanningPeriod,
  normalizeSavingsGoalCreate,
} from '../../../src/planning/planning.dto';

describe('Phase 07 planning security boundaries', () => {
  const repository = readFileSync('src/planning/planning.repository.ts', 'utf8');
  const tables = readFileSync(
    '../../supabase/migrations/20260831120000_phase07_planning_tables.sql',
    'utf8',
  );
  const access = readFileSync(
    '../../supabase/migrations/20260831120200_phase07_planning_access.sql',
    'utf8',
  );
  const functions = readFileSync(
    '../../supabase/migrations/20260831120100_phase07_planning_functions.sql',
    'utf8',
  );
  const observability = readFileSync('src/planning/planning.observability.ts', 'utf8');

  it('rejects mass assignment, invalid periods/cursors, and unsafe money at the boundary', () => {
    expect(() =>
      normalizeSavingsGoalCreate({
        name: 'Goal',
        targetMinor: '100',
        currencyCode: 'SAR',
        userId: 'other',
      }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeBudgetCreate({
        name: 'Budget',
        currencyCode: 'SAR',
        period: '2026-09',
        totalMinor: '1',
        incomeTargetMinor: '0',
        savingsTargetMinor: '0',
        rolloverEnabled: false,
        rolloverMinor: '0',
        ownerId: 'other',
      }),
    ).toThrow('VALIDATION_FAILED');
    expect(() => normalizePlanningPeriod('2026-13')).toThrow('VALIDATION_FAILED');
    expect(() =>
      decodePlanningCursor(
        Buffer.from(JSON.stringify({ at: 'bad', id: 'bad' })).toString('base64url'),
      ),
    ).toThrow('VALIDATION_FAILED');
  });

  it('keeps owner predicates, forced RLS, minimum grants, and worker-only job functions', () => {
    expect(repository).toMatch(/where id=\$1 and user_id=\$2/);
    expect(tables).toContain('force row level security');
    expect(access).toContain(
      'from public,anon,authenticated,service_role,masarifi_api,masarifi_worker',
    );
    expect(access).toContain('private.execute_planning_claim(uuid,uuid,text,uuid)');
    expect(access).toMatch(
      /private\.execute_planning_claim\(uuid,uuid,text,uuid\)[\s\S]*to masarifi_worker/,
    );
    expect(access).not.toMatch(/grant (insert|update|delete).*planning_job_claims/i);
    expect(functions).toContain('for update skip locked limit p_limit');
  });

  it('rejects sensitive event fields and keeps observability dimensions low-cardinality', () => {
    const base = {
      userId: 'owner',
      requestId: 'request',
      goalId: '70000000-0000-4000-8000-000000000096',
      aggregateVersion: 1,
    };
    for (const payload of [
      { ...base, amountMinor: '100' },
      { ...base, notes: 'secret' },
      { ...base, evidence: { merchant: 'secret' } },
    ])
      expect(() => buildPlanningEvent('planning.savings_goal_updated', payload)).toThrow(
        'PLANNING_EVENT_INVALID',
      );
    expect(observability).not.toMatch(
      /userId|resourceId|amount|currency|provider|keyword|evidence/,
    );
  });
});
