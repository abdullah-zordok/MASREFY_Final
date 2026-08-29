import { PoolService } from '../../../src/platform/database/pool.service';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('reference reads', () => {
  const active = { userId: 'reference_read_active', sessionId: 's1', factorAgeSeconds: 0 };
  const inactive = { userId: 'reference_read_inactive', sessionId: 's2', factorAgeSeconds: 0 };
  let pool: PoolService;
  let repository: ReferenceRepository;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2),
    } as never);
    repository = new ReferenceRepository(pool);
    await pool.query(
      `insert into public.profiles(id,status) values($1,'active'),($2,'suspended')
      on conflict(id) do update set status=excluded.status`,
      [active.userId, inactive.userId],
    );
  });

  afterAll(async () => {
    await pool.query('delete from public.profiles where id=any($1)', [
      [active.userId, inactive.userId],
    ]);
    await pool.onModuleDestroy();
  });

  it('returns deterministic enabled data and rejects inactive profiles', async () => {
    const input = {
      operation: 'listCurrencies',
      principal: active,
      body: {},
      query: {},
      params: {},
      requestId: 'reference-read',
    };
    const first = (await repository.execute(input)) as { code: string }[];
    const second = (await repository.execute(input)) as { code: string }[];
    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    await expect(repository.execute({ ...input, principal: inactive })).rejects.toThrow(
      'PROFILE_INACTIVE',
    );
  });

  it('does not grant anonymous direct table access', async () => {
    await expect(
      pool.withClient(async (client) => {
        await client.query('begin');
        try {
          await client.query('set local role anon');
          await client.query('select * from public.accounts');
        } finally {
          await client.query('rollback');
        }
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
