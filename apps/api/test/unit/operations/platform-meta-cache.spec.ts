import { MetaService } from '../../../src/platform/meta/meta.service';

describe('platform meta cache', () => {
  it('reuses a safe projection for at most thirty seconds and invalidates explicitly', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const config = {
      get: jest.fn((key: string) => (key === 'MASARIFI_AI_PROVIDER_ENABLED' ? true : undefined)),
    };
    const service = new MetaService(config as never);

    const cold = await service.get();
    const warm = await service.get();
    expect(warm).toBe(cold);
    await expect(service.etag()).resolves.toMatch(/^"[0-9a-f]{64}"$/u);

    now.mockReturnValue(31_001);
    expect(await service.get()).not.toBe(cold);
    const beforeInvalidation = await service.get();
    service.invalidate();
    expect(await service.get()).not.toBe(beforeInvalidation);
  });

  it('evicts one oldest context instead of flushing every warm entry', async () => {
    let reads = 0;
    const client = {
      query: jest.fn((statement: string) => {
        if (statement.startsWith('select private.read_safe_platform_meta')) reads += 1;
        return Promise.resolve({
          rows: statement.startsWith('select ') ? [{ value: undefined }] : [],
        });
      }),
    };
    const pool = { withClient: (run: (value: typeof client) => unknown) => run(client) };
    const service = new MetaService({ get: jest.fn() } as never, pool as never);

    for (let index = 0; index < 33; index += 1)
      await service.get({ appVersion: `1.0.${String(index)}` });
    await service.get({ appVersion: '1.0.1' });

    expect(reads).toBe(33);
  });
});
