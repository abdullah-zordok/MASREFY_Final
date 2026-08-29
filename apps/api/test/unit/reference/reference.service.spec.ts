import { ReferenceService } from '../../../src/reference/reference.service';

describe('ReferenceService boundaries', () => {
  const principal = {
    userId: 'user_1',
    sessionId: 'session_1',
    factorAgeSeconds: 0,
    mfaAgeSeconds: 0,
  };
  const repository = { sharedHash: jest.fn(), execute: jest.fn() };
  const service = new ReferenceService(repository as never);
  beforeEach(() => jest.clearAllMocks());

  it('checks the canonical database hash before every cache hit', async () => {
    repository.sharedHash.mockResolvedValue('hash-1');
    repository.execute.mockResolvedValue([{ code: 'SAR' }]);
    const request = { operation: 'listCurrencies', principal, requestId: 'request-1' };
    await expect(service.execute(request)).resolves.toEqual([{ code: 'SAR' }]);
    await expect(service.execute(request)).resolves.toEqual([{ code: 'SAR' }]);
    expect(repository.sharedHash).toHaveBeenCalledTimes(2);
    expect(repository.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects nonzero opening balance before repository work', async () => {
    await expect(
      service.execute({
        operation: 'createAccount',
        principal,
        requestId: 'request-1',
        idempotencyKey: 'request-key',
        body: { name: 'Cash', type: 'cash', currency: 'SAR', openingBalanceMinor: 1 },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it('rejects unknown authority fields before repository work', async () => {
    await expect(
      service.execute({
        operation: 'createCategory',
        principal,
        requestId: 'request-1',
        idempotencyKey: 'request-key',
        body: { labelAr: 'طعام', labelEn: 'Food', userId: 'other' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.execute).not.toHaveBeenCalled();
  });
});
