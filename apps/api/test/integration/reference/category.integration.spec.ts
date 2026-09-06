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
    await pool.withClient(async (client) => {
      const users = [owner.userId, other.userId];
      await client.query('begin');
      await client.query('set local session_replication_role=replica');
      await client.query(
        `delete from private.outbox_events
         where payload->>'userId'=any($1) or payload#>>'{sync,userId}'=any($1)`,
        [users],
      );
      await client.query(
        `delete from public.transaction_postings where transaction_id in
          (select id from public.transactions where user_id=any($1))`,
        [users],
      );
      await client.query(
        `delete from audit.transaction_revisions where transaction_id in
          (select id from public.transactions where user_id=any($1))`,
        [users],
      );
      await client.query('delete from public.transactions where user_id=any($1)', [users]);
      await client.query(
        'delete from public.account_balances where account_id in (select id from public.accounts where user_id=any($1))',
        [users],
      );
      await client.query('delete from public.accounts where user_id=any($1)', [users]);
      await client.query('delete from public.categories where user_id=any($1)', [users]);
      await client.query('delete from public.profiles where id=any($1)', [users]);
      await client.query('commit');
    });
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

  it('rechecks usage and atomically reassigns every owned transaction on merge', async () => {
    const source = (await repository.execute(
      input('createCategory', {
        kind: 'expense',
        labelAr: `مصدر${runId.slice(0, 5)}`,
        labelEn: `Source${runId.slice(0, 5)}`,
        icon: null,
        color: null,
        parentId: null,
        sortOrder: 20,
      }),
    )) as { id: string; version: number };
    const target = (await repository.execute(
      input('createCategory', {
        kind: 'expense',
        labelAr: `هدف${runId.slice(0, 5)}`,
        labelEn: `Target${runId.slice(0, 5)}`,
        icon: null,
        color: null,
        parentId: null,
        sortOrder: 21,
      }),
    )) as { id: string; version: number };
    const accountId = randomUUID();
    const transactionIds: [string, string] = [randomUUID(), randomUUID()];
    await pool.query(
      `insert into public.accounts(id,user_id,name,type,currency_code)
       values($1,$2,'Merge cash','cash','SAR')`,
      [accountId, owner.userId],
    );
    const insertTransaction = async (transactionId: string) => {
      await pool.query(
        `insert into public.transactions(
          id,user_id,kind,amount_minor,currency_code,category_id,title,occurred_at
        ) values($1,$2,'expense',100,'SAR',$3,'Linked',clock_timestamp())`,
        [transactionId, owner.userId, source.id],
      );
      await pool.query(
        `insert into public.transaction_postings(
          transaction_id,account_id,amount_minor,clearing_state,posting_role,occurred_at
        ) values($1,$2,-100,'confirmed','source',clock_timestamp())`,
        [transactionId, accountId],
      );
    };
    await insertTransaction(transactionIds[0]);

    const preview = (await repository.execute(
      input('getCategoryUsage', {}, { categoryId: source.id }),
    )) as { linkedTransactionCount: number; version: number };
    expect(preview).toEqual({ linkedTransactionCount: 1, version: source.version });
    await expect(
      repository.execute({
        ...input('getCategoryUsage', {}, { categoryId: source.id }),
        principal: other,
      }),
    ).rejects.toThrow('NOT_FOUND');

    await insertTransaction(transactionIds[1]);
    const archivePreview = (await repository.execute(
      input('getCategoryUsage', {}, { categoryId: source.id }),
    )) as { linkedTransactionCount: number; version: number };
    await repository.execute({
      ...input('archiveCategory', {}, { categoryId: source.id }),
      query: {
        expectedVersion: archivePreview.version,
        expectedLinkedTransactionCount: archivePreview.linkedTransactionCount,
      },
    });
    await expect(
      repository.execute(
        input(
          'mergeCategory',
          {
            targetId: target.id,
            expectedVersion: preview.version,
            expectedLinkedTransactionCount: preview.linkedTransactionCount,
          },
          { categoryId: source.id },
        ),
      ),
    ).rejects.toThrow('CATEGORY_USAGE_CHANGED');

    const current = (await repository.execute(
      input('getCategoryUsage', {}, { categoryId: source.id }),
    )) as { linkedTransactionCount: number; version: number };
    expect(current).toEqual({
      linkedTransactionCount: archivePreview.linkedTransactionCount,
      version: archivePreview.version + 1,
    });
    await repository.execute(
      input(
        'mergeCategory',
        {
          targetId: target.id,
          expectedVersion: current.version,
          expectedLinkedTransactionCount: current.linkedTransactionCount,
        },
        { categoryId: source.id },
      ),
    );
    const evidence = await pool.query<{ moved: string; revisions: string }>(
      `select
        (select count(*) from public.transactions where id=any($1) and category_id=$2)::text moved,
        (select count(*) from audit.transaction_revisions where transaction_id=any($1))::text revisions`,
      [transactionIds, target.id],
    );
    expect(evidence.rows[0]).toEqual({ moved: '2', revisions: '2' });
  });
});
