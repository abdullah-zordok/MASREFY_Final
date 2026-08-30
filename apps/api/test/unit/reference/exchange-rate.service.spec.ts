import { ReferenceService } from '../../../src/reference/reference.service';

describe('exchange-rate service', () => {
  const principal = { userId: 'user_1', sessionId: 'session_1', factorAgeSeconds: 0 };
  const repository = { sharedHash: jest.fn(), execute: jest.fn() };
  const service = new ReferenceService(repository as never, { createAccount: jest.fn() } as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [{ base: 'sar', quote: 'USD' }, 400],
    [{ base: 'SAR', quote: 'USD', maxAgeSeconds: 59 }, 400],
    [{ base: 'SAR', quote: 'USD', at: 'not-a-date' }, 400],
  ])('rejects invalid resolver input', async (query, status) => {
    await expect(
      service.execute({ operation: 'getExchangeRate', principal, requestId: 'r', query }),
    ).rejects.toMatchObject({ status });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('maps absent approved metadata without inventing a rate', async () => {
    repository.execute.mockRejectedValueOnce(new Error('FX_UNAVAILABLE'));
    await expect(
      service.execute({
        operation: 'getExchangeRate',
        principal,
        requestId: 'r',
        query: { base: 'SAR', quote: 'USD' },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
