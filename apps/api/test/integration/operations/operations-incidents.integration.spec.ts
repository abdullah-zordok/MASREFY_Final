import { OperationsService } from '../../../src/operations/operations.service';

describe('operations incident and configuration integration', () => {
  const principal = { userId: 'admin', sessionId: 'session', claims: {} } as never;

  it('passes only validated versioned incident mutations to the repository', async () => {
    const command = jest.fn(() => Promise.resolve({ status: 'investigating', version: 2 }));
    const service = new OperationsService({ command });
    await expect(
      service.command(
        principal,
        'updateIncident',
        '00000000-0000-4000-8000-000000000013',
        { status: 'investigating', expectedVersion: 1, reason: 'Acknowledge the incident safely.' },
        'request-key',
        'request-id',
      ),
    ).resolves.toEqual({ status: 'investigating', version: 2 });
    expect(command).toHaveBeenCalledTimes(1);
  });

  it('rejects stale-shaped and secret-bearing configuration before persistence', async () => {
    const command = jest.fn();
    const service = new OperationsService({ command });
    await expect(
      service.command(
        principal,
        'updateSetting',
        'operations.provider.timeout_ms',
        {
          value: 'https://private.invalid',
          expectedVersion: 1,
          reason: 'Unsafe provider value must fail.',
        },
        'request-key',
        'request-id',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(command).not.toHaveBeenCalled();
  });
});
