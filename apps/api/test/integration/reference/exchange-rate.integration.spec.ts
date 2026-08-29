import { randomUUID } from 'node:crypto';

import { PoolService } from '../../../src/platform/database/pool.service';
import { ReferenceRepository } from '../../../src/reference/reference.repository';
import { describeLiveDatabase } from '../../live-database';

describeLiveDatabase('exchange-rate resolver', () => {
  const principal = { userId: 'exchange_rate_integration', sessionId: 's1', factorAgeSeconds: 0 };
  const provider = `test-${randomUUID().slice(0, 8)}`;
  let pool: PoolService;
  let repository: ReferenceRepository;

  beforeAll(async () => {
    pool = new PoolService({
      get: (key: string) => (key === 'DATABASE_URL' ? process.env.DATABASE_URL : 2),
    } as never);
    repository = new ReferenceRepository(pool);
    await pool.query(
      "insert into public.profiles(id,status) values($1,'active') on conflict(id) do update set status='active'",
      [principal.userId],
    );
    await pool.query(
      `insert into public.exchange_rates(base_currency,quote_currency,rate,effective_at,provider)
      values('USD','SAR',3.75,clock_timestamp()-interval '1 hour',$1)`,
      [provider],
    );
  });

  afterAll(async () => {
    await pool.withClient(async (client) => {
      await client.query(
        'alter table public.exchange_rates disable trigger exchange_rates_immutable',
      );
      await client.query('delete from public.exchange_rates where provider=$1', [provider]);
      await client.query(
        'alter table public.exchange_rates enable trigger exchange_rates_immutable',
      );
    });
    await pool.query('delete from public.profiles where id=$1', [principal.userId]);
    await pool.onModuleDestroy();
  });

  it('returns the closest approved row and rejects stale absence', async () => {
    const base = { operation: 'getExchangeRate', principal, requestId: 'fx', body: {}, params: {} };
    await expect(
      repository.execute({
        ...base,
        query: { base: 'USD', quote: 'SAR', at: new Date(), maxAgeSeconds: 7200 },
      }),
    ).resolves.toMatchObject({ rate: 3.75, provider });
    await expect(
      repository.execute({
        ...base,
        query: { base: 'USD', quote: 'SAR', at: new Date(), maxAgeSeconds: 60 },
      }),
    ).rejects.toThrow('FX_UNAVAILABLE');
  });

  it('keeps approved rows immutable', async () => {
    await expect(
      pool.query('update public.exchange_rates set rate=4 where provider=$1', [provider]),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
