import { ClerkWebhookWorker } from '../../../src/identity/clerk-webhook.worker';

describe('Clerk reconciliation', () => {
  const repository = {
    synchronizeClerkIdentity: jest.fn().mockResolvedValue(undefined),
    listProfileSubjects: jest.fn(),
  };
  const clerk = {
    listIdentityUsers: jest.fn(),
    getIdentityUser: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(2) };

  it('repairs a lost create/update page with bounded hash-only evidence', async () => {
    clerk.listIdentityUsers.mockResolvedValue({
      users: [
        { id: 'reconcile_a', primaryEmail: null, primaryPhone: null, displayName: null },
        { id: 'reconcile_b', primaryEmail: null, primaryPhone: null, displayName: null },
      ],
      nextOffset: 2,
    });
    const worker = new ClerkWebhookWorker(repository as never, clerk as never, config as never);
    const evidence = await worker.reconcileProviderPage(0);
    expect(repository.synchronizeClerkIdentity).toHaveBeenCalledTimes(2);
    expect(evidence).toMatchObject({ processed: 2, next: '2' });
    expect(evidence.checkpointHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(evidence)).not.toMatch(/email|phone|credential|token/i);
  });

  it('resumes an immutable-subject absence scan and distinguishes not-found from outage', async () => {
    repository.listProfileSubjects.mockResolvedValue(['reconcile_b', 'reconcile_c']);
    clerk.getIdentityUser.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'reconcile_c', primaryEmail: null, primaryPhone: null, displayName: null,
    });
    const worker = new ClerkWebhookWorker(repository as never, clerk as never, config as never);
    await expect(worker.reconcileProfilePage('reconcile_a')).resolves.toMatchObject({
      processed: 2, next: 'reconcile_c',
    });
    expect(repository.synchronizeClerkIdentity).toHaveBeenNthCalledWith(1, null, 'reconcile_b');

    clerk.getIdentityUser.mockRejectedValueOnce(new Error('PROVIDER_UNAVAILABLE'));
    repository.listProfileSubjects.mockResolvedValueOnce(['reconcile_d']);
    await expect(worker.reconcileProfilePage('reconcile_c')).rejects.toThrow('PROVIDER_UNAVAILABLE');
    expect(repository.synchronizeClerkIdentity).not.toHaveBeenCalledWith(null, 'reconcile_d');
  });
});
