import { HttpException } from '@nestjs/common';

import { OperationsService } from '../../../src/operations/operations.service';

const principal = {
  userId: 'admin_123',
  sessionId: 'session_123',
  factorAgeSeconds: 0,
};

describe('OperationsService', () => {
  it('returns a bounded repository page', async () => {
    const repository = {
      read: (_principal: unknown, kind: string, query: unknown) => Promise.resolve({ kind, query }),
    };
    const service = new OperationsService(repository);

    await expect(service.list(principal, 'scheduled-jobs', { limit: '100' })).resolves.toEqual({
      kind: 'scheduled-jobs',
      query: { limit: 100, cursor: null },
    });
    await expect(service.list(principal, 'scheduled-jobs', { limit: 101 })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('accepts only explicit safe job actions', async () => {
    const repository = {
      jobAction: (_principal: unknown, input: Record<string, unknown>) => Promise.resolve(input),
    };
    const service = new OperationsService(repository);
    const runId = '00000000-0000-4000-8000-000000000013';

    await expect(
      service.jobAction(
        principal,
        runId,
        'retry',
        { expectedVersion: 2, reason: 'Retry after provider recovery.' },
        'request-key-1234567890',
        'request-1',
      ),
    ).resolves.toMatchObject({ runId, action: 'retry', expectedVersion: 2 });
    await expect(
      service.jobAction(principal, runId, 'execute' as 'retry', {}, '', 'request-2'),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('fails closed for invalid feature preview context', async () => {
    const repository = {
      evaluateFlag: (_principal: unknown, key: string, context: unknown) =>
        Promise.resolve({ key, context }),
    };
    const service = new OperationsService(repository);

    await expect(
      service.previewFlag(principal, 'mobile.safe-demo', { role: 'admin' }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('runs only owned operations jobs', async () => {
    const repository = {
      runOperationsJob: (jobKey: string) => Promise.resolve({ outcome: 'succeeded', jobKey }),
    };
    const service = new OperationsService(repository);

    await expect(service.runJob('operations.provider-health')).resolves.toEqual({
      outcome: 'succeeded',
      jobKey: 'operations.provider-health',
    });
  });

  it('invalidates safe client metadata after the cache job succeeds', async () => {
    const repository = { runOperationsJob: jest.fn().mockResolvedValue({ outcome: 'succeeded' }) };
    const meta = { invalidate: jest.fn() };
    const service = new OperationsService(repository, meta);

    await service.runJob('operations.cache-invalidate');

    expect(meta.invalidate).toHaveBeenCalledTimes(1);
  });

  it('invalidates safe client metadata after configuration changes', async () => {
    const repository = { command: jest.fn().mockResolvedValue({ status: 'updated' }) };
    const meta = { invalidate: jest.fn() };
    const service = new OperationsService(repository, meta);

    await service.command(
      principal,
      'updateSetting',
      'operations.ai.allowance',
      { value: 5, expectedVersion: 1, reason: 'Keep the Free-only allowance fixed.' },
      'request-key-1234567890',
      'request-1',
    );

    expect(meta.invalidate).toHaveBeenCalledTimes(1);
  });

  it('maps repository conflicts, missing resources, and outages to stable HTTP errors', async () => {
    const service = new OperationsService({
      read: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('OPERATIONS_INCIDENT_STALE'), { code: '40001' }),
        )
        .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P0002' }))
        .mockRejectedValueOnce(new Error('connection closed')),
    });

    for (const status of [409, 404, 503])
      await expect(service.list(principal, 'incidents', {})).rejects.toMatchObject({ status });
  });
});
