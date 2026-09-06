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
      get: jest.fn(() => ['ai@1', 'engagement@1', 'identity@1', 'tracking@1']),
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
    const ai = { ...identity, resourceType: 'ai' };
    const engagement = { ...identity, resourceType: 'engagement' };
    const worker = new SecurityWorkerService(
      repository as never,
      { delete: jest.fn() } as never,
      identity as never,
      tracking as never,
      ai as never,
      engagement as never,
      config as never,
    );

    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(repository.withWorkerTransaction).toHaveBeenCalledTimes(6);
    expect(query).toHaveBeenCalledWith('select private.dispatch_security_alerts($1)', [25]);
  });

  it('propagates a governed job failure to the central scheduler', async () => {
    const repository = {
      withWorkerTransaction: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const handler = {
      resourceType: 'identity',
      schemaVersion: 1,
      export: jest.fn(),
      deleteAccount: jest.fn(),
      listRetentionCandidates: jest.fn(),
      applyRetention: jest.fn(),
    };
    const worker = new SecurityWorkerService(
      repository as never,
      { delete: jest.fn() } as never,
      handler as never,
      { ...handler, resourceType: 'tracking' } as never,
      { ...handler, resourceType: 'ai' } as never,
      { ...handler, resourceType: 'engagement' } as never,
      { get: jest.fn(() => ['ai@1', 'engagement@1', 'identity@1', 'tracking@1']) } as never,
    );

    await expect(worker.runJob('security.support-expire')).rejects.toThrow('database unavailable');
  });
});
