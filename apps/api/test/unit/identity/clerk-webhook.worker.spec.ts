import { ClerkWebhookWorker } from '../../../src/identity/clerk-webhook.worker';

describe('Clerk webhook worker orchestration', () => {
  const repository = {
    processNextClerkWebhook: jest.fn().mockResolvedValue({ status: 'idle' }),
    nextRevokedSession: jest.fn().mockResolvedValue(null),
    completeWorkerSessionRevoke: jest.fn().mockResolvedValue(undefined),
    redactClerkWebhookPayloads: jest.fn().mockResolvedValue(0),
    synchronizeClerkIdentity: jest.fn().mockResolvedValue(undefined),
    listProfileSubjects: jest.fn().mockResolvedValue([]),
  };
  const clerk = {
    getIdentityUser: jest.fn(),
    listIdentityUsers: jest.fn(),
    revokeSession: jest.fn().mockResolvedValue('revoked'),
  };
  const config = { get: jest.fn((key: string) => ({
    MASARIFI_CLERK_WEBHOOK_POLL_MS: 100,
    MASARIFI_CLERK_WEBHOOK_MAX_ATTEMPTS: 3,
    MASARIFI_CLERK_RECONCILE_PAGE_SIZE: 2,
  })[key]) };

  beforeEach(() => {
    repository.nextRevokedSession.mockResolvedValue(null);
    repository.listProfileSubjects.mockResolvedValue([]);
    clerk.listIdentityUsers.mockResolvedValue({ users: [], nextOffset: null });
  });

  it('starts once and stops immediately through the abort signal', async () => {
    const worker = new ClerkWebhookWorker(repository as never, clerk as never, config as never);
    worker.start();
    worker.start();
    await worker.stop();
    expect(repository.processNextClerkWebhook).toHaveBeenCalledTimes(1);
  });

  it('reconciles a bounded provider page and returns hash-only evidence', async () => {
    const users = [
      { id: 'user_a', primaryEmail: null, primaryPhone: null, displayName: null },
      { id: 'user_b', primaryEmail: null, primaryPhone: null, displayName: null },
    ];
    clerk.listIdentityUsers.mockResolvedValue({ users, nextOffset: 2 });
    const worker = new ClerkWebhookWorker(repository as never, clerk as never, config as never);
    const evidence = await worker.reconcileProviderPage();
    expect(repository.synchronizeClerkIdentity).toHaveBeenCalledTimes(2);
    expect(evidence).toMatchObject({ processed: 2, next: '2' });
    expect(evidence.checkpointHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(evidence)).not.toMatch(/email|phone/i);
  });

  it('resumes the local absence scan by immutable subject', async () => {
    repository.listProfileSubjects.mockResolvedValue(['user_b', 'user_c']);
    clerk.getIdentityUser.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'user_c', primaryEmail: null, primaryPhone: null, displayName: null,
    });
    const worker = new ClerkWebhookWorker(repository as never, clerk as never, config as never);
    const evidence = await worker.reconcileProfilePage('user_a');
    expect(repository.listProfileSubjects).toHaveBeenCalledWith('user_a', 2);
    expect(repository.synchronizeClerkIdentity).toHaveBeenNthCalledWith(1, null, 'user_b');
    expect(evidence.next).toBe('user_c');
  });

  it('clears a retained session link only after Clerk succeeds', async () => {
    repository.nextRevokedSession.mockResolvedValue({ deviceId: 'device_a', sessionId: 'session_a' });
    const worker = new ClerkWebhookWorker(repository as never, clerk as never, config as never);
    await expect(worker.retryRevokedSession()).resolves.toBe(true);
    expect(clerk.revokeSession).toHaveBeenCalledWith('session_a');
    expect(repository.completeWorkerSessionRevoke).toHaveBeenCalledWith('device_a', 'session_a');
    clerk.revokeSession.mockRejectedValueOnce(new Error('provider detail'));
    await expect(worker.retryRevokedSession()).rejects.toThrow();
    expect(repository.completeWorkerSessionRevoke).toHaveBeenCalledTimes(1);
  });
});
