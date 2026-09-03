import { SecurityWorkerService } from '../../../src/security/security.worker';

describe('SecurityWorkerService', () => {
  it('isolates each bounded job so one failure cannot starve the others', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(new Error('support expiry unavailable'))
      .mockResolvedValue({ rows: [] });
    const repository = {
      withWorkerTransaction: jest.fn((action: (client: { query: typeof query }) => unknown) =>
        action({ query }),
      ),
    };
    const config = {
      get: jest.fn(() => ['identity@1', 'tracking@1']),
      getRequired: jest.fn(() => 25),
    };
    const identity = {
      resourceType: 'identity',
      schemaVersion: 1,
      export: jest.fn(),
      deleteAccount: jest.fn(),
      listRetentionCandidates: jest.fn(),
      applyRetention: jest.fn(),
    };
    const tracking = { ...identity, resourceType: 'tracking' };
    const worker = new SecurityWorkerService(
      repository as never,
      { delete: jest.fn() } as never,
      identity as never,
      tracking as never,
      config as never,
    );

    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(repository.withWorkerTransaction).toHaveBeenCalledTimes(6);
    expect(query).toHaveBeenCalledWith('select private.dispatch_security_alerts($1)', [25]);
  });
});
