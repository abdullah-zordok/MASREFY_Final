import { randomUUID } from 'node:crypto';

import { PlanningRepository } from '../../../src/planning/planning.repository';
import { createLivePool, describeLiveDatabase } from '../../live-database';

describeLiveDatabase('planning Phase 06 sync bridge', () => {
  const pool = createLivePool();
  const repository = new PlanningRepository(pool);
  const owner = `planning_sync_${randomUUID()}`;
  const principal = { userId: owner, sessionId: 'session', factorAgeSeconds: 0 };
  let profileId = '';
  beforeAll(async () => {
    await pool.query("insert into public.profiles(id,status) values($1,'active')", [owner]);
  });
  afterAll(() => pool.onModuleDestroy());

  it('emits exact-money upserts and an archive tombstone on one monotonic planning cursor', async () => {
    const created = await repository.mutate({
      operation: 'createSalaryProfile',
      scope: 'planning.salary-profile.create',
      status: 201,
      principal,
      command: {
        name: 'Employer',
        amountMinor: '9007199254740991',
        currencyCode: 'SAR',
        frequency: 'monthly',
        expectedDay: 31,
        customIntervalDays: null,
        accountId: null,
        automaticDetectionEnabled: false,
      },
      idempotencyKey: 'planning-sync-create-001',
      requestId: 'planning-sync-create',
    });
    profileId = String((created.resource as Record<string, unknown>).id);
    await repository.mutate({
      operation: 'archiveSalaryProfile',
      scope: 'planning.salary-profile.archive',
      status: 200,
      principal,
      command: { profileId, expectedVersion: 1 },
      idempotencyKey: 'planning-sync-delete-001',
      requestId: 'planning-sync-delete',
    });
    const delta = await pool.query<{
      position: string;
      resource_type: string;
      operation: string;
      snapshot: Record<string, unknown> | null;
    }>(
      "select position::text,resource_type,operation,snapshot from private.get_sync_delta($1,'planning',0,10)",
      [owner],
    );
    expect(delta.rows).toHaveLength(2);
    expect(delta.rows[0]).toMatchObject({
      position: '1',
      resource_type: 'salary-profile',
      operation: 'upsert',
    });
    expect(delta.rows[0]?.snapshot).toMatchObject({ amount_minor: '9007199254740991' });
    expect(delta.rows[1]).toMatchObject({
      position: '2',
      resource_type: 'salary-profile',
      operation: 'delete',
      snapshot: null,
    });
  });
});
