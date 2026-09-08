import {
  createMockSettingsService,
  createProductionSettingsService,
  createMockSubscriptionService,
  settingsService
} from './subscription-settings-service';
import type { UserProfile } from '@/domain/settings';

const now = Date.UTC(2026, 0, 15, 12);

describe('SubscriptionService lifecycle', () => {
  it('uses one catalog version and discloses trial, renewal, cancellation, price, features, and limits', async () => {
    const service = createMockSubscriptionService({ now: () => now });
    const catalog = await service.getCatalog();

    expect(new Set(catalog.offers.map((offer) => offer.catalogVersion))).toEqual(new Set([catalog.version]));
    expect(catalog.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        offerId: 'basic-monthly',
        billingPeriod: 'monthly',
        priceMinor: 1900,
        currency: 'SAR',
        features: expect.arrayContaining(['assistant']),
        limits: expect.objectContaining({ assistantQuestions: 30 }),
        trial: { eligible: true, durationDays: 7, trialPriceMinor: 0, postTrialPriceMinor: 1900 },
        renewalTermsKey: expect.any(String),
        cancellationTermsKey: expect.any(String)
      })
    ]));
  });

  it('starts and replays reviewed operations without changing entitlement until success', async () => {
    const service = createMockSubscriptionService({ now: () => now });
    const before = await service.getState();
    const operation = await service.startOperation({ kind: 'start_trial', offerId: 'basic-monthly', catalogVersion: '2026-01' }, before.version, 'trial-op-1');

    expect(operation.value).toMatchObject({ status: 'review', operationId: 'trial-op-1', priorStateVersion: before.version });
    expect(await service.startOperation({ kind: 'purchase', offerId: 'premium-annual', catalogVersion: '2026-01' }, before.version, 'trial-op-1')).toEqual(operation);
    expect(await service.getState()).toEqual(before);
  });

  it('rejects version conflicts and changed catalog/state before completion', async () => {
    const service = createMockSubscriptionService({ now: () => now });
    await expect(
      service.startOperation({ kind: 'purchase', offerId: 'basic-monthly', catalogVersion: '2026-01' }, 99, 'conflict-op')
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      service.startOperation({ kind: 'purchase', offerId: 'missing', catalogVersion: '2026-01' }, 1, 'missing-offer')
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('changes entitlement only on successful completion and replays terminal outcomes', async () => {
    const service = createMockSubscriptionService({ now: () => now });
    const before = await service.getState();
    await service.startOperation({ kind: 'purchase', offerId: 'premium-annual', catalogVersion: '2026-01' }, before.version, 'purchase-op');

    const failed = await service.completeMockOperation('purchase-op', 'failure');
    expect(failed.value.status).toBe('failed');
    expect((await service.getState()).plan).toBe(before.plan);
    expect(await service.completeMockOperation('purchase-op', 'success')).toEqual(failed);

    const next = await service.startOperation({ kind: 'purchase', offerId: 'premium-annual', catalogVersion: '2026-01' }, before.version, 'purchase-op-success');
    const success = await service.completeMockOperation(next.value.operationId, 'success');
    expect(success.value.status).toBe('succeeded');
    expect(await service.getState()).toMatchObject({ plan: 'premium', status: 'active', version: before.version + 1 });
    expect(await service.completeMockOperation(next.value.operationId, 'success')).toEqual(success);
  });

  it('completes eligible trial checkout into trialing state with trial terms', async () => {
    const service = createMockSubscriptionService({ now: () => now });
    const before = await service.getState();
    const operation = await service.startOperation({ kind: 'start_trial', offerId: 'basic-monthly', catalogVersion: '2026-01' }, before.version, 'trial-success');

    await service.completeMockOperation(operation.value.operationId, 'success');

    expect(await service.getState()).toMatchObject({
      plan: 'basic',
      status: 'trialing',
      trialEndsAt: now + 7 * 24 * 60 * 60 * 1000,
      version: before.version + 1
    });
  });

  it('supports restore, change, cancel, renewal, and expiry with representative wording only', async () => {
    const service = createMockSubscriptionService({ now: () => now });
    for (const [kind, offerId] of [
      ['restore', 'basic-monthly'],
      ['change_plan', 'premium-annual'],
      ['cancel', 'basic-monthly'],
      ['renew_mock', 'basic-monthly']
    ] as const) {
      const state = await service.getState();
      const operation = await service.startOperation({ kind, offerId, catalogVersion: '2026-01' }, state.version, `${kind}-op`);
      expect(JSON.stringify(operation)).not.toMatch(/card|visa|apple pay|bank/i);
      await service.completeMockOperation(operation.value.operationId, 'success');
      if (kind === 'cancel') expect(await service.getState()).toMatchObject({ status: 'cancellation_scheduled', paidContentAccess: 'editable' });
    }

    await service.expireCurrentPeriod('expire-op');
    expect(await service.getState()).toMatchObject({ status: 'expired', paidContentAccess: 'read_only' });
  });
});

describe('SettingsService lifecycle', () => {
  it('keeps backend-owned identity, sessions, events, and privacy requests out of production defaults', async () => {
    expect(settingsService.metadata.kind).toBe('live');
    await expect(settingsService.getProfile()).rejects.toMatchObject({
      code: 'session_expired'
    });
    await expect(settingsService.listSessions()).rejects.toMatchObject({
      code: 'session_expired'
    });
    await expect(
      settingsService.requestPrivacyAction('data_export', 'production-export')
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  it('selects fixture settings for explicit demo mode', async () => {
    const previousDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE;
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    try {
      const service = createProductionSettingsService();

      await expect(service.getProfile()).resolves.toMatchObject({ name: 'Dana' });
      await expect(service.listSessions()).resolves.not.toEqual([]);
      await expect(service.listSecurityEvents()).resolves.toMatchObject({ total: 2 });
      await expect(
        service.requestPrivacyAction('data_export', 'demo-export')
      ).resolves.toMatchObject({ value: { status: 'accepted' } });
    } finally {
      if (previousDemoMode === undefined)
        delete process.env.EXPO_PUBLIC_DEMO_MODE;
      else process.env.EXPO_PUBLIC_DEMO_MODE = previousDemoMode;
    }
  });

  it('loads/saves profile with validation, versioning, and owner redirects', async () => {
    const service = createMockSettingsService({ now: () => now });
    const profile = await service.getProfile();

    expect(profile).toMatchObject({ currency: 'SAR', timeZone: 'Asia/Riyadh', version: 1 });
    await expect(service.saveProfile({ ...profile, email: 'bad-email' }, profile.version, 'bad-profile')).rejects.toMatchObject({ code: 'validation' });
    await expect(service.saveProfile({ ...profile, phone: '+966511111111' }, profile.version, 'phone-owner')).rejects.toMatchObject({ code: 'identity_owner' });

    const saved = await service.saveProfile({ ...profile, name: 'Dana Edited' }, profile.version, 'save-profile-1');
    expect(saved).toMatchObject({ value: { name: 'Dana Edited', version: 2 }, affectedScopes: expect.arrayContaining(['settings.profile', 'reports.live', 'assistant.context', 'notifications.policy']) });
    await expect(service.saveProfile({ ...profile, name: 'Stale' }, profile.version, 'stale-profile')).rejects.toMatchObject({ code: 'conflict' });
  });

  it('restores a saved profile after the service restarts', async () => {
    let stored: UserProfile | null = null;
    const profileStorage = {
      loadProfile: jest.fn(async () => stored),
      saveProfile: jest.fn(async (profile: UserProfile) => {
        stored = profile;
      })
    };
    const first = createMockSettingsService({ profileStorage });
    const profile = await first.getProfile();
    await first.saveProfile(
      { ...profile, name: 'Persisted profile' },
      profile.version,
      'persist-profile'
    );

    const restarted = createMockSettingsService({ profileStorage });
    await expect(restarted.getProfile()).resolves.toMatchObject({
      name: 'Persisted profile',
      version: 2
    });
  });

  it('keeps the in-memory profile unchanged when persistence fails', async () => {
    const profileStorage = {
      loadProfile: jest.fn(async () => null),
      saveProfile: jest
        .fn<Promise<void>, [UserProfile]>()
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValue(undefined)
    };
    const service = createMockSettingsService({ profileStorage });
    const profile = await service.getProfile();

    await expect(
      service.saveProfile(
        { ...profile, name: 'Unpersisted profile' },
        profile.version,
        'failed-profile'
      )
    ).rejects.toThrow('storage unavailable');
    await expect(service.getProfile()).resolves.toEqual(profile);
    await expect(
      service.saveProfile(
        { ...profile, name: 'Persisted retry' },
        profile.version,
        'retry-profile'
      )
    ).resolves.toMatchObject({
      value: { name: 'Persisted retry', version: 2 }
    });
  });

  it('provides deterministic sessions/events and replays revocation outcomes', async () => {
    const clearCurrentSession = jest.fn();
    const service = createMockSettingsService({ now: () => now, clearCurrentSession });
    const sessions = await service.listSessions();
    const events = await service.listSecurityEvents();

    expect(sessions.some((session) => session.isCurrentDevice)).toBe(true);
    expect(events.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'new_session' })]));

    const other = await service.revokeSession('session-other', 'revoke-other');
    expect(other.value).toMatchObject({ id: 'session-other', status: 'revoked' });
    expect(clearCurrentSession).not.toHaveBeenCalled();
    expect(await service.revokeSession('session-other', 'revoke-other')).toEqual(other);

    await service.revokeSession('session-current', 'revoke-current');
    expect(clearCurrentSession).toHaveBeenCalledTimes(1);
    const all = await service.revokeAllSessions('revoke-all');
    expect(all.value.every((session) => session.status === 'revoked')).toBe(true);
  });

  it('creates privacy request states and local deletion operations without false completion claims', async () => {
    const deleteLocalData = jest.fn(async () => ({ deletedRows: 3, operationId: 'local-delete-1' }));
    const service = createMockSettingsService({ now: () => now, deleteLocalData });

    const exportRequest = await service.requestPrivacyAction('data_export', 'export-1');
    const deletionRequest = await service.requestPrivacyAction('account_deletion', 'delete-account-1');
    expect(exportRequest.value).toMatchObject({ status: 'accepted', kind: 'data_export' });
    expect(deletionRequest.value).toMatchObject({ status: 'accepted', kind: 'account_deletion' });
    expect(JSON.stringify([exportRequest, deletionRequest])).not.toMatch(/file|completed|deleted account/i);

    const local = await service.deleteLocalData('local-delete-1');
    expect(local).toMatchObject({ value: { deletedRows: 3 }, affectedScopes: expect.arrayContaining(['settings.local-data', 'notifications.list', 'assistant.conversations']) });
    expect(await service.deleteLocalData('local-delete-1')).toEqual(local);
  });
});
