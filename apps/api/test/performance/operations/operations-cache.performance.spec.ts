import { performance } from 'node:perf_hooks';

import { MetaService } from '../../../src/platform/meta/meta.service';

describe('operations cache performance', () => {
  it('meets cold, warm, and invalidation budgets with bounded safe values', async () => {
    const service = new MetaService({
      get: (key: string) => (key === 'MASARIFI_AI_PROVIDER_ENABLED' ? false : undefined),
    } as never);
    const coldStarted = performance.now();
    const cold = await service.get();
    const coldMs = performance.now() - coldStarted;
    const warmStarted = performance.now();
    for (let index = 0; index < 10_000; index += 1) await service.get();
    const warmMs = performance.now() - warmStarted;
    service.invalidate();
    const invalidated = await service.get();

    expect(coldMs).toBeLessThanOrEqual(750);
    expect(warmMs / 10_000).toBeLessThanOrEqual(0.3);
    expect(invalidated).not.toBe(cold);
    expect(JSON.stringify(invalidated)).not.toMatch(/secret|token|password|credential/iu);
  });
});
