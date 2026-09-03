import { TrackingService } from '../../../src/tracking/tracking.service';
import { HttpException } from '@nestjs/common';
import { TrackingAdminController } from '../../../src/tracking/tracking-admin.controller';

const principal = { userId: 'admin', sessionId: 'session', factorAgeSeconds: 0 };
const id = '80000000-0000-4000-8000-000000000001';

describe('tracking Admin validation', () => {
  it('allows only action-specific low-confidence corrections', async () => {
    const repository = { adminMutate: jest.fn(() => Promise.resolve({})) };
    const service = new TrackingService(repository as never, {} as never, {} as never);
    const input = {
      principal,
      idempotencyKey: 'admin-action-key',
      requestId: 'request-admin',
    };

    await service.adminMutate('low-confidence', id, {
      ...input,
      body: {
        action: 'correct_merchant',
        reason: 'Operator verified the normalized merchant',
        expectedVersion: 1,
        patch: { merchant: 'Fictional Merchant' },
      },
    });

    expect(repository.adminMutate).toHaveBeenCalledTimes(1);
    expect(() =>
      service.adminMutate('low-confidence', id, {
        ...input,
        body: {
          action: 'correct_merchant',
          reason: 'Operator attempted a category mutation',
          expectedVersion: 1,
          patch: { categoryId: id },
        },
      }),
    ).toThrow();
    expect(() =>
      service.adminMutate('sessions', id, {
        ...input,
        body: {
          action: 'retry',
          reason: 'Operator supplied an unknown privileged field',
          expectedVersion: 1,
          patch: { userId: 'another-owner' },
        },
      }),
    ).toThrow();
  });

  it('queues parser corpus work instead of executing it in the request', async () => {
    const repository = { queueParserCorpus: jest.fn(() => Promise.resolve({ status: 'queued' })) };
    const service = new TrackingService(repository as never, {} as never, {} as never);
    await expect(
      service.runCorpus(id, {
        principal,
        idempotencyKey: 'parser-corpus-key',
        requestId: 'request-corpus',
        body: {
          action: 'run',
          reason: 'Operator requested a bounded parser corpus run',
          expectedVersion: 1,
        },
      }),
    ).resolves.toEqual({ status: 'queued' });
    expect(repository.queueParserCorpus).toHaveBeenCalledWith(
      principal,
      id,
      'Operator requested a bounded parser corpus run',
      'parser-corpus-key',
      'request-corpus',
    );

    await expect(
      service.runCorpus(null, {
        principal,
        idempotencyKey: 'parser-corpus-key-2',
        requestId: 'request-corpus-2',
        body: {
          action: 'run',
          reason: 'Operator requested the selected parser corpus run',
          expectedVersion: 1,
          patch: { versionId: id },
        },
      }),
    ).resolves.toEqual({ status: 'queued' });
  });

  it('preserves repository conflicts from parser corpus queueing', async () => {
    const conflict = new HttpException({ code: 'IDEMPOTENCY_KEY_REUSED' }, 409);
    const repository = { queueParserCorpus: jest.fn(() => Promise.reject(conflict)) };
    const service = new TrackingService(repository as never, {} as never, {} as never);

    await expect(
      service.runCorpus(id, {
        principal,
        idempotencyKey: 'parser-corpus-conflict',
        requestId: 'request-conflict',
        body: {
          action: 'run',
          reason: 'Verify repository conflicts remain visible',
          expectedVersion: 1,
        },
      }),
    ).rejects.toBe(conflict);
  });

  it('accepts the documented AdminMutation payload for nested version creation', async () => {
    const tracking = { createParserVersion: jest.fn(() => Promise.resolve({ id })) };
    const controller = new TrackingAdminController(tracking as never);
    const body = {
      action: 'create',
      reason: 'Operator created a reviewed parser version',
      expectedVersion: 1,
      patch: {
        versionNo: 2,
        definition: { matches: [], captures: [], normalizations: [], mappings: [] },
      },
    };

    await controller.createVersion(
      { clerkPrincipal: principal, requestId: 'request-create-version' } as never,
      id,
      body,
      'parser-version-create-key',
    );

    expect(tracking.createParserVersion).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ body, idempotencyKey: 'parser-version-create-key' }),
    );
  });
});
