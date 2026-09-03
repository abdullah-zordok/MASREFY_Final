import { TrackingService } from '../../../src/tracking/tracking.service';

describe('tracking unsupported import handling', () => {
  it('persists only a safe hash summary and never stores hostile unsupported bytes', async () => {
    const unsupported = { id: '86000000-0000-4000-8000-000000000001' };
    const repository = {
      recordUnsupported: jest.fn(() => Promise.resolve(unsupported)),
    };
    const storage = { upload: jest.fn() };
    const service = new TrackingService(repository as never, {} as never, storage as never);
    const bytes = Buffer.from('%PDF-fictional');

    await expect(
      service.createImport(
        {
          principal: {
            userId: 'owner',
            sessionId: 'session',
            factorAgeSeconds: 0,
          },
          body: bytes,
          idempotencyKey: 'unsupported-import-key',
          requestId: 'request-1',
        },
        'application/pdf',
        bytes,
        'statement.pdf',
      ),
    ).rejects.toMatchObject({ status: 415 });
    expect(repository.recordUnsupported).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner' }),
      expect.stringMatching(/^[0-9a-f]{64}$/),
      'statement.pdf',
      'UNSUPPORTED_FORMAT',
    );
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repository.recordUnsupported.mock.calls[0]).not.toContain(bytes);
  });

  const validImport = {
    principal: { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 },
    body: {
      schemaVersion: 1,
      sourceType: 'manual',
      events: [
        {
          sourceItemKey: 'source-1',
          receivedAt: '2026-09-03T10:00:00.000Z',
          body: 'Paid SAR 12',
        },
      ],
    },
    idempotencyKey: 'import-key-1234',
    requestId: 'request-2',
  };

  it('uploads the raw object before atomically registering it with the import', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn<Promise<{ resource: { id: string } }>, [unknown, unknown, unknown]>(
        () => Promise.resolve({ resource: { id: '86000000-0000-4000-8000-000000000002' } }),
      ),
    };
    const storage = { upload: jest.fn(() => Promise.resolve(true)), delete: jest.fn() };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await service.createImport(validImport, 'application/json');

    expect(storage.upload.mock.invocationCallOrder[0]).toBeLessThan(
      repository.createImport.mock.invocationCallOrder[0] as number,
    );
    const request = repository.createImport.mock.calls[0]?.[2] as
      | {
          sourceName: null;
          key: string;
          requestId: string;
          raw: {
            storageRef: string;
            payloadHash: string;
            contentType: string;
            sizeBytes: number;
            expiresAt: Date;
          };
        }
      | undefined;
    expect(request).toMatchObject({
      sourceName: null,
      key: 'import-key-1234',
      requestId: 'request-2',
    });
    const raw = request?.raw;
    expect(raw?.storageRef).toMatch(/^tracking\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
    expect(raw?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw?.contentType).toBe('application/json');
    expect(raw?.sizeBytes).toBeGreaterThan(0);
    expect(raw?.expiresAt).toBeInstanceOf(Date);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('removes the uploaded raw object when atomic import registration fails', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn<Promise<never>, [unknown, unknown, unknown]>(() =>
        Promise.reject(new Error('database unavailable')),
      ),
    };
    const storage = {
      upload: jest.fn<Promise<boolean>, [string, Buffer, string]>(() => Promise.resolve(true)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await expect(service.createImport(validImport, 'application/json')).rejects.toThrow(
      'database unavailable',
    );
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(/^tracking\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
    );
  });

  it('queues durable cleanup when an unregistered upload cannot be deleted', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.reject(new Error('database unavailable'))),
      queueRawCleanup: jest.fn<
        Promise<void>,
        [
          unknown,
          { storageRef: string; payloadHash: string; contentType: string; sizeBytes: number },
        ]
      >(() => Promise.resolve()),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(true)),
      delete: jest.fn(() => Promise.reject(new Error('storage unavailable'))),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await expect(service.createImport(validImport, 'application/json')).rejects.toThrow(
      'TRACKING_STORAGE_CLEANUP_FAILED',
    );
    const queued = repository.queueRawCleanup.mock.calls[0]?.[1];
    expect(repository.queueRawCleanup.mock.calls[0]?.[0]).toMatchObject({ userId: 'owner' });
    expect(queued?.storageRef).toMatch(/^tracking\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
    expect(queued?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(queued?.contentType).toBe('application/json');
    expect(queued?.sizeBytes).toBeGreaterThan(0);
  });

  it('does not delete a pre-existing raw object when database registration fails', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.reject(new Error('database unavailable'))),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(false)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await expect(service.createImport(validImport, 'application/json')).rejects.toThrow(
      'database unavailable',
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('removes a newly uploaded object when the database replays an earlier import', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.resolve({ replayed: true, resource: { id: 'session' } })),
      rawPayloadRegistered: jest.fn(() => Promise.resolve(false)),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(true)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await service.createImport(validImport, 'application/json');

    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it('retries deletion of an unregistered replay object after PUT reports it already exists', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.resolve({ replayed: true, resource: { id: 'session' } })),
      rawPayloadRegistered: jest.fn(() => Promise.resolve(false)),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(false)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await service.createImport(validImport, 'application/json');

    expect(storage.delete).toHaveBeenCalledTimes(1);
  });

  it('queues durable cleanup when replay deletion fails', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.resolve({ replayed: true, resource: { id: 'session' } })),
      rawPayloadRegistered: jest.fn(() => Promise.resolve(false)),
      queueRawCleanup: jest.fn(() => Promise.resolve()),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(false)),
      delete: jest.fn(() => Promise.reject(new Error('storage unavailable'))),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await expect(service.createImport(validImport, 'application/json')).rejects.toThrow(
      'storage unavailable',
    );
    expect(repository.queueRawCleanup).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing object that is registered to the replayed session', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.resolve({ replayed: true, resource: { id: 'session' } })),
      rawPayloadRegistered: jest.fn(() => Promise.resolve(true)),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(false)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await service.createImport(validImport, 'application/json');

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('scopes a missing CSV source item key to the file content', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn<Promise<{ resource: { id: string } }>, [unknown, unknown, unknown]>(
        () => Promise.resolve({ resource: { id: 'session' } }),
      ),
    };
    const storage = {
      upload: jest.fn(() => Promise.resolve(true)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);
    const first = Buffer.from(
      'sourceItemKey,receivedAt,body\n,2026-09-03T10:00:00.000Z,Paid SAR 12\n',
    );
    const second = Buffer.from(
      'sourceItemKey,receivedAt,body\n,2026-09-03T10:00:00.000Z,Paid SAR 13\n',
    );

    await service.createImport(
      { ...validImport, idempotencyKey: 'csv-import-key-1' },
      'text/csv',
      first,
    );
    await service.createImport(
      { ...validImport, idempotencyKey: 'csv-import-key-2' },
      'text/csv',
      second,
    );

    const sourceKeys = repository.createImport.mock.calls.map(
      ([, normalized]) =>
        (normalized as { events: Array<{ sourceItemKey: string }> }).events[0]?.sourceItemKey,
    );
    expect(sourceKeys[0]).toMatch(/^[0-9a-f]{64}:row:1$/);
    expect(sourceKeys[1]).toMatch(/^[0-9a-f]{64}:row:1$/);
    expect(sourceKeys[0]).not.toBe(sourceKeys[1]);
  });

  it('uses separate raw objects for identical payloads submitted as distinct commands', async () => {
    const repository = {
      getPreferences: jest.fn(() => Promise.resolve({ sourceRetentionDays: 7 })),
      createImport: jest.fn(() => Promise.resolve({ resource: { id: 'session' } })),
    };
    const storage = {
      upload: jest.fn<Promise<boolean>, [string, Buffer, string]>(() => Promise.resolve(true)),
      delete: jest.fn(() => Promise.resolve()),
    };
    const service = new TrackingService(repository as never, {} as never, storage as never);

    await service.createImport(validImport, 'application/json');
    await service.createImport(
      { ...validImport, idempotencyKey: 'different-import-key' },
      'application/json',
    );

    expect(storage.upload.mock.calls[0]?.[0]).not.toBe(storage.upload.mock.calls[1]?.[0]);
  });
});
