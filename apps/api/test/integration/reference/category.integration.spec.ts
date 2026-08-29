import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('category lifecycle', () => {
  const owner = { userId: 'category_integration_owner', sessionId: 's1', factorAgeSeconds: 0 };
  const other = { userId: 'category_integration_other', sessionId: 's2', factorAgeSeconds: 0 };
  const runId = randomUUID();
  let pool: PoolService;
  let repository: ReferenceRepository;
  const input = (
    operation: string,
    body: Record<string, unknown>,
    params: Record<string, string> = {},
  ) => ({
    operation,
    principal: owner,
    body,
    query: {},
    params,
    requestId: `category-${runId}`,
  });

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2),
    } as never);
    repository = new ReferenceRepository(pool);
    await pool.query(
      `insert into public.profiles(id,status) values($1,'active'),($2,'active')
      on conflict(id) do update set status='active'`,
      [owner.userId, other.userId],
    );
  });

  afterAll(async () => {
    await pool.query(`delete from private.outbox_events where payload->>'userId'=any($1)`, [
      [owner.userId, other.userId],
    ]);
    await pool.query('delete from public.categories where user_id=any($1)', [
      [owner.userId, other.userId],
    ]);
    await pool.query('delete from public.profiles where id=any($1)', [
      [owner.userId, other.userId],
    ]);
    await pool.onModuleDestroy();
  });

  it('rejects cross-owner graph links and rolls the resource back if audit fails', async () => {
    const foreign = (await repository.execute({
      ...input('createCategory', {
        kind: 'expense',
        labelAr: `آخر${runId.slice(0, 4)}`,
        labelEn: `Other${runId.slice(0, 4)}`,
        icon: null,
        color: null,
        parentId: null,
        sortOrder: 1,
      }),
      principal: other,
    })) as { id: string };
    await expect(
      repository.execute(
        input('createCategory', {
          kind: 'expense',
          labelAr: `مالك${runId.slice(0, 4)}`,
          labelEn: `Owner${runId.slice(0, 4)}`,
          icon: null,
          color: null,
          parentId: foreign.id,
          sortOrder: 2,
        }),
      ),
    ).rejects.toThrow('CATEGORY_INVALID');

    const label = `Rollback${runId.slice(0, 8)}`;
    await expect(
      repository.execute({
        ...input('createCategory', {
          kind: 'expense',
          labelAr: label,
          labelEn: label,
          icon: null,
          color: null,
          parentId: null,
          sortOrder: 3,
        }),
        requestId: 'invalid request id',
      }),
    ).rejects.toBeDefined();
    const count = await pool.query<{ count: string }>(
      'select count(*)::text count from public.categories where user_id=$1 and label_en=$2',
      [owner.userId, label],
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('prevents an indirect parent cycle', async () => {
    const a = (await repository.execute(
      input('createCategory', {
        kind: 'expense',
        labelAr: `أ${runId.slice(0, 5)}`,
        labelEn: `A${runId.slice(0, 5)}`,
        icon: null,
        color: null,
        parentId: null,
        sortOrder: 10,
      }),
    )) as { id: string; version: number };
    const b = (await repository.execute(
      input('createCategory', {
        kind: 'expense',
        labelAr: `ب${runId.slice(0, 5)}`,
        labelEn: `B${runId.slice(0, 5)}`,
        icon: null,
        color: null,
        parentId: a.id,
        sortOrder: 11,
      }),
    )) as { id: string; version: number };
    await expect(
      repository.execute(
        input(
          'updateCategory',
          { expectedVersion: a.version, parentId: b.id },
          { categoryId: a.id },
        ),
      ),
    ).rejects.toThrow('CATEGORY_CYCLE');
  });
});
