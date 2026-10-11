const mockDatabases = new Map<string, ReturnType<typeof mockMakeDatabase>>();
function mockMakeDatabase() {
  const { DatabaseSync } = require('node:sqlite');
  const native = new DatabaseSync(':memory:');
  native.exec(
    'CREATE TABLE voice_operation_journal(id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL)'
  );
  return {
    native,
    getFirstAsync: async (sql: string, ...args: string[]) =>
      native.prepare(sql).get(...args) ?? null,
    runAsync: async (sql: string, ...args: (string | number)[]) =>
      native.prepare(sql).run(...args)
  };
}
jest.mock('@/storage/database', () => ({
  openDatabase: async (ownerId: string) => {
    if (!mockDatabases.has(ownerId))
      mockDatabases.set(ownerId, mockMakeDatabase());
    return mockDatabases.get(ownerId);
  },
  runExclusiveDatabaseTransaction: async (
    db: ReturnType<typeof mockMakeDatabase>,
    operation: (db: unknown) => Promise<void>
  ) => {
    db.native.exec('BEGIN IMMEDIATE');
    try {
      await operation(db);
      db.native.exec('COMMIT');
    } catch (error) {
      db.native.exec('ROLLBACK');
      throw error;
    }
  }
}));

afterAll(() => {
  for (const db of mockDatabases.values()) db.native.close();
});
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { OnboardingProgress } from '@/domain/app-shell';
import { userProfileSchema, type UserProfile } from '@/domain/settings';
import { createAuthService } from '@/features/auth/auth-flow';
import { requestJson } from './http-client';
import { createLiveAutomaticTrackingService } from './automatic-tracking-service';
import { createLiveAssistantApiService } from './assistant-api-service';
import { createLiveVoiceApiService } from './voice-api-service';
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID()
}));
import {
  createLiveAuthService,
  createLiveIdentityService,
  registerLiveClerkBridge
} from './auth-service';

const liveSession = {
  id: 'sess_live_123456',
  userId: 'user_live_123456',
  method: 'google' as const,
  issuedAt: 1_000,
  expiresAt: 61_000
};

function clerkBridge(overrides: Record<string, unknown> = {}) {
  return {
    getSession: jest.fn(async () => liveSession),
    getToken: jest.fn(async () => 'clerk-token'),
    startPhone: jest.fn(),
    verifyPhone: jest.fn(),
    resendPhone: jest.fn(),
    signInWithGoogle: jest.fn(async () => liveSession),
    reverifyConflict: jest.fn(async () => liveSession),
    signOut: jest.fn(async () => undefined),
    ...overrides
  };
}

describe('live Clerk authentication', () => {
  test('ships the Expo runtime packages required by Clerk Google SSO', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    ) as { dependencies: Record<string, string> };
    expect(packageJson.dependencies).toEqual(
      expect.objectContaining({
        'expo-auth-session': expect.any(String),
        'expo-web-browser': expect.any(String)
      })
    );
  });
  test('fails closed on provider errors and does not claim conflict reverification', () => {
    const provider = readFileSync(
      resolve(process.cwd(), 'src/services/live/clerk-provider.tsx'),
      'utf8'
    );
    expect(provider).toContain('if (!isIdentifierNotFound(error)) throw error');
    expect(provider).toContain('reverifyConflict: async () => null');
    expect(provider).not.toContain('expiresAt: now + 60 * 60 * 1_000');
  });

  test('registers the bridge before live selection and refreshes API tokens', async () => {
    const bridge = clerkBridge();
    registerLiveClerkBridge(bridge);

    const selected = createAuthService(false);
    expect(selected.metadata).toMatchObject({
      kind: 'live',
      availability: 'available'
    });
    await expect(selected.restoreSession()).resolves.toMatchObject({
      status: 'authenticated',
      userId: liveSession.userId,
      method: 'google',
      restoration: 'restored'
    });

    const request = jest.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    await requestJson(
      '/api/v1/me',
      z.object({ ok: z.literal(true) }).strict(),
      {
        baseUrl: 'https://api.example.test',
        request
      }
    );
    expect(bridge.getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token'
        })
      })
    );

    const trackingRequest = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            available: true,
            mode: 'paused',
            lastDetectedAt: null,
            lastSuccessfulTransactionId: null,
            detectedThisMonth: 0,
            reviewCount: 0,
            activeKeywordCount: 0,
            activeSenderCount: 0,
            lastUpdatedAt: '2026-09-02T08:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    await createLiveAutomaticTrackingService({
      request: trackingRequest
    }).getStatus();
    expect(trackingRequest).toHaveBeenCalledWith(
      '/api/v1/tracking/status',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer clerk-token'
        })
      })
    );

    const assistantRequest = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(
      async () =>
        new Response(
          JSON.stringify({
            status: 'available',
            limit: 5,
            used: 0,
            remaining: 5,
            resetsAt: '2026-09-03T08:00:00.000Z'
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    await createLiveAssistantApiService({
      baseUrl: 'https://api.example.test',
      request: assistantRequest
    }).getAvailability();
    expect(assistantRequest.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer clerk-token' })
    );

    const voiceRequest = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(async (input) =>
      String(input) === 'private://audio'
        ? new Response(new Uint8Array([1]), {
            status: 200,
            headers: { 'content-type': 'audio/wav' }
          })
        : new Response(JSON.stringify({ code: 'AI_UNAVAILABLE' }), {
            status: 503,
            headers: { 'content-type': 'application/json' }
          })
    );
    await expect(
      createLiveVoiceApiService({
        baseUrl: 'https://api.example.test',
        request: voiceRequest
      }).transcribe('private://audio', 'clear_en', 1000)
    ).rejects.toMatchObject({ code: 'provider_unavailable' });
    expect(voiceRequest.mock.calls[1]?.[1]?.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer clerk-token' })
    );
  });

  test('rejects synthetic sessions and maps local versus all-session sign-out', async () => {
    const synthetic = clerkBridge({
      getSession: jest.fn(async () => ({
        ...liveSession,
        id: 'mock-session',
        userId: 'mock-user'
      }))
    });
    await expect(
      createLiveAuthService(synthetic).restoreSession()
    ).rejects.toMatchObject({
      code: 'contract_mismatch'
    });

    const bridge = clerkBridge();
    const service = createLiveAuthService(bridge);
    await service.signOut('local');
    await service.signOut('all');
    expect(bridge.signOut).toHaveBeenNthCalledWith(1, { scope: 'current' });
    expect(bridge.signOut).toHaveBeenNthCalledWith(2, { scope: 'all' });
  });

  test('touches only the profile endpoint for foreground activity', async () => {
    const request = jest.fn(async () => ({
      id: 'user-1',
      displayName: null,
      primaryEmailMasked: null,
      phoneMasked: null,
      locale: 'en',
      timezone: 'Asia/Riyadh',
      status: 'active',
      version: 1
    }));
    const service = createLiveAuthService(clerkBridge(), request);

    await service.touchActivity();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/v1/me', undefined);
  });
});

describe('live owner identity mappings', () => {
  const localProfile: UserProfile = {
    name: 'Local draft',
    avatar: 'LD',
    phone: null,
    birthday: '1995-05-10',
    gender: 'female',
    googleAccount: null,
    email: null,
    country: 'SA',
    currency: 'SAR',
    timeZone: 'Asia/Riyadh',
    completion: ['birthday'],
    version: 2
  };
  const localOnboarding: OnboardingProgress = {
    platformPath: 'android',
    status: 'in_progress',
    completedSteps: ['tracking_intro'],
    skippedSteps: ['permission_request'],
    currentStep: 'permission_education',
    permissionEducationSeen: true,
    trackingPreference: {
      mode: 'review_all',
      selectedAt: 500,
      isRecommended: false
    },
    updatedAt: 500
  };

  test('maps profile, onboarding, devices, and revocation without dropping local-only data', async () => {
    const request = jest.fn(async (path: string) => {
      if (path === '/api/v1/me')
        return {
          id: liveSession.userId,
          displayName: 'Authoritative name',
          primaryEmailMasked: 'au***@example.test',
          phoneMasked: '+966***55',
          locale: 'ar',
          timezone: 'Asia/Riyadh',
          status: 'active',
          version: 7
        };
      if (path === '/api/v1/me/preferences')
        return {
          defaultCurrency: 'SAR',
          language: 'ar',
          theme: 'system',
          calendar: 'gregorian',
          weekStart: 6,
          privacySettings: {},
          version: 4
        };
      if (path === '/api/v1/me/onboarding')
        return {
          step: 'keywords',
          completedSteps: ['welcome', 'tracking_intro', 'permission_education'],
          completedAt: null,
          version: 3
        };
      if (path.startsWith('/api/v1/me/devices?'))
        return {
          items: [
            {
              id: '8f47b766-3d34-4ce0-94df-4fc066a38bf2',
              platform: 'android',
              appVersion: '1.0.0',
              deviceName: 'Pixel',
              trusted: true,
              lastSeenAt: '2026-09-08T03:00:00.000Z',
              current: true,
              revokedAt: null,
              version: 2
            }
          ],
          nextCursor: null
        };
      if (path.includes('/api/v1/me/devices/')) return null;
      throw new Error(`unexpected path ${path}`);
    });
    const service = createLiveIdentityService({
      request,
      loadLocalProfile: async () => localProfile,
      loadLocalOnboarding: async () => localOnboarding
    });

    await expect(service.getProfile()).resolves.toEqual({
      ...localProfile,
      name: 'Authoritative name',
      phone: '+966***55',
      googleAccount: 'au***@example.test',
      email: null,
      currency: 'SAR',
      timeZone: 'Asia/Riyadh',
      version: 7
    });
    await expect(service.loadProgress()).resolves.toEqual({
      ...localOnboarding,
      completedSteps: ['tracking_intro', 'permission_education'],
      currentStep: 'keywords',
      updatedAt: 500
    });
    await expect(service.listSessions()).resolves.toEqual([
      {
        id: '8f47b766-3d34-4ce0-94df-4fc066a38bf2',
        deviceLabel: 'Pixel',
        platform: 'android',
        createdAt: Date.parse('2026-09-08T03:00:00.000Z'),
        lastActiveAt: Date.parse('2026-09-08T03:00:00.000Z'),
        isCurrentDevice: true,
        status: 'active'
      }
    ]);
    await service.revokeSession(
      '8f47b766-3d34-4ce0-94df-4fc066a38bf2',
      'revoke-device-123'
    );
    expect(request).toHaveBeenCalledWith(
      '/api/v1/me/devices/8f47b766-3d34-4ce0-94df-4fc066a38bf2',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'Idempotency-Key': 'revoke-device-123' }
      })
    );
  });

  test('loads every device page before exposing revocation choices', async () => {
    const device = (id: string) => ({
      id,
      platform: 'android',
      appVersion: '1.0.0',
      deviceName: 'Phone',
      trusted: true,
      lastSeenAt: '2026-09-08T03:00:00.000Z',
      current: false,
      revokedAt: null,
      version: 1
    });
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        items: [device('8f47b766-3d34-4ce0-94df-4fc066a38bf2')],
        nextCursor: 'page-2'
      })
      .mockResolvedValueOnce({
        items: [device('9f47b766-3d34-4ce0-94df-4fc066a38bf3')],
        nextCursor: null
      });

    await expect(
      createLiveIdentityService({ request }).listSessions()
    ).resolves.toHaveLength(2);
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/me/devices?limit=100&cursor=page-2',
      undefined
    );
  });

  test('submits live privacy requests and exposes only the mobile contract', async () => {
    const request = jest.fn(async (path: string) => {
      if (path === '/api/v1/me/privacy/exports')
        return {
          id: 'export-123',
          status: 'verified',
          scope: ['identity@1'],
          requestedAt: '2026-09-12T10:00:00.000Z',
          expiresAt: null,
          version: 1
        };
      if (path === '/api/v1/me/deletion-requests')
        return {
          id: 'deletion-123',
          status: 'processing',
          requestedAt: '2026-09-12T11:00:00.000Z',
          coolingOffEndsAt: '2026-09-13T11:00:00.000Z',
          completedAt: null,
          retainedCategories: [],
          version: 1
        };
      throw new Error(`unexpected path ${path}`);
    });
    const service = createLiveIdentityService({ request });

    await expect(
      service.requestPrivacyAction('data_export', 'export-operation-123')
    ).resolves.toEqual({
      value: {
        id: 'export-123',
        operationId: 'export-operation-123',
        kind: 'data_export',
        status: 'accepted',
        requestedAt: Date.parse('2026-09-12T10:00:00.000Z'),
        updatedAt: Date.parse('2026-09-12T10:00:00.000Z'),
        safeFailure: null
      },
      affectedScopes: ['settings.privacy-request.data_export']
    });
    await expect(
      service.requestPrivacyAction('account_deletion', 'delete-op')
    ).resolves.toEqual({
      value: {
        id: 'deletion-123',
        operationId: 'delete-op',
        kind: 'account_deletion',
        status: 'pending',
        requestedAt: Date.parse('2026-09-12T11:00:00.000Z'),
        updatedAt: Date.parse('2026-09-12T11:00:00.000Z'),
        safeFailure: null
      },
      affectedScopes: ['settings.privacy-request.account_deletion']
    });
    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/me/privacy/exports', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'export-operation-123' },
      body: {}
    });
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/me/deletion-requests', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'delete-op' },
      body: { confirmation: 'DELETE_MY_ACCOUNT' }
    });
  });

  test('rejects an unrecognized privacy status', async () => {
    const service = createLiveIdentityService({
      request: async () => ({
        id: 'export-123',
        status: 'unknown',
        scope: ['identity@1'],
        requestedAt: '2026-09-12T10:00:00.000Z',
        expiresAt: null,
        version: 1
      })
    });

    await expect(
      service.requestPrivacyAction('data_export', 'export-operation-123')
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  test.each([
    ['data_export', 'requested', 'review', null],
    ['data_export', 'verified', 'accepted', null],
    ['data_export', 'processing', 'pending', null],
    ['data_export', 'ready', 'accepted', null],
    ['data_export', 'expired', 'failed', 'expired'],
    ['data_export', 'failed', 'failed', 'representative_failure'],
    ['account_deletion', 'requested', 'review', null],
    ['account_deletion', 'verified', 'accepted', null],
    ['account_deletion', 'processing', 'pending', null],
    ['account_deletion', 'completed', 'accepted', null],
    ['account_deletion', 'cancelled', 'cancelled', null],
    ['account_deletion', 'failed', 'failed', 'representative_failure']
  ] as const)(
    'maps %s %s to the complete mobile privacy request',
    async (kind, serverStatus, status, safeFailure) => {
      const requestedAt = '2026-09-12T12:00:00.000Z';
      const service = createLiveIdentityService({
        request: async () =>
          kind === 'data_export'
            ? {
                id: 'export-status-123',
                status: serverStatus,
                scope: ['identity@1'],
                requestedAt,
                expiresAt: null,
                version: 1
              }
            : {
                id: 'deletion-status-123',
                status: serverStatus,
                requestedAt,
                coolingOffEndsAt: '2026-09-13T12:00:00.000Z',
                completedAt: null,
                retainedCategories: [],
                version: 1
              }
      });
      const operationId = `${kind}-${serverStatus}-123`;

      await expect(
        service.requestPrivacyAction(kind, operationId)
      ).resolves.toEqual({
        value: {
          id:
            kind === 'data_export'
              ? 'export-status-123'
              : 'deletion-status-123',
          operationId,
          kind,
          status,
          requestedAt: Date.parse(requestedAt),
          updatedAt: Date.parse(requestedAt),
          safeFailure
        },
        affectedScopes: [`settings.privacy-request.${kind}`]
      });
    }
  );
});

describe('live profile setup', () => {
  test.each(
    (['getProfile', 'getProfileSetup', 'saveProfileSetup'] as const).flatMap(
      (operation) =>
        [null, 'contact@example.test'].map((email) => ({ operation, email }))
    )
  )(
    '$operation persists masked Google identity while preserving contact email $email',
    async ({ operation, email }) => {
      const local = userProfileSchema.parse({
        name: null,
        avatar: 'default',
        phone: null,
        googleAccount: null,
        email,
        country: 'SA',
        currency: 'SAR',
        timeZone: 'Asia/Riyadh',
        completion: [],
        version: 1
      });
      const saveLocalProfile = jest.fn(async (value: UserProfile) => {
        userProfileSchema.parse(value);
      });
      const service = createLiveIdentityService({
        loadLocalProfile: async () => local,
        saveLocalProfile,
        request: async (path) =>
          path === '/api/v1/me'
            ? profile
            : path.endsWith('/preferences')
              ? {
                  ...preferences,
                  defaultCurrency: 'SAR',
                  currencySelectionRequired: false
                }
              : onboarding
      });
      if (operation === 'saveProfileSetup') {
        await service.saveProfileSetup(
          { name: 'Owner', currency: 'SAR' },
          { profile: local, preferences, onboarding, complete: false },
          'masked-contact'
        );
      } else {
        await service[operation]();
      }
      expect(saveLocalProfile).toHaveBeenCalledWith(
        expect.objectContaining({ googleAccount: 'a***@example.test', email }),
        undefined
      );
    }
  );

  test('stops the remaining profile setup writes when the owner changes during the first request', async () => {
    let owner = liveSession.userId;
    let finish!: (value: unknown) => void;
    const delayed = new Promise((resolve) => {
      finish = resolve;
    });
    const writes: string[] = [];
    const service = createLiveIdentityService({
      getOwnerId: () => owner,
      request: async (path, options) => {
        if (options?.method) {
          writes.push(path);
          if (path === '/api/v1/me') return delayed;
        }
        return path === '/api/v1/me'
          ? profile
          : path.endsWith('/preferences')
            ? preferences
            : onboarding;
      }
    });
    const snapshot = await service.getProfileSetup();
    const pending = service.saveProfileSetup(
      { name: 'Old owner edit', currency: 'SAR' },
      snapshot,
      'owner-switch-test'
    );
    owner = 'user_live_replacement';
    finish({ ...profile, displayName: 'Old owner edit' });
    await expect(pending).rejects.toMatchObject({ code: 'session_expired' });
    expect(writes).toEqual(['/api/v1/me']);
  });
  test('rejects a late profile response after an owner switch before writing local profile data', async () => {
    let owner = liveSession.userId;
    let finish!: (value: unknown) => void;
    const delayed = new Promise((resolve) => {
      finish = resolve;
    });
    const saveLocalProfile = jest.fn();
    const service = createLiveIdentityService({
      getOwnerId: () => owner,
      saveLocalProfile,
      request: async (path) =>
        path === '/api/v1/me'
          ? delayed
          : path.endsWith('/preferences')
            ? preferences
            : onboarding
    });
    const pending = service.getProfileSetup();
    owner = 'user_live_replacement';
    finish(profile);
    await expect(pending).rejects.toMatchObject({ code: 'session_expired' });
    expect(saveLocalProfile).not.toHaveBeenCalled();
  });
  const profile = {
    id: liveSession.userId,
    displayName: null,
    primaryEmailMasked: 'a***@example.test',
    phoneMasked: null,
    locale: 'ar' as const,
    timezone: 'Asia/Riyadh',
    status: 'active' as const,
    version: 2
  };
  const preferences = {
    defaultCurrency: 'XXX',
    language: 'ar' as const,
    theme: 'system' as const,
    calendar: 'gregorian' as const,
    weekStart: 6,
    privacySettings: {},
    version: 3
  };
  const onboarding = {
    step: 'welcome' as const,
    completedSteps: [] as string[],
    completedAt: null,
    version: 4
  };

  test('derives account completion from remote welcome and defaults unsupported currency to SAR', async () => {
    const request = jest.fn(async (path: string) => {
      if (path === '/api/v1/me') return profile;
      if (path === '/api/v1/me/preferences') return preferences;
      if (path === '/api/v1/me/onboarding') return onboarding;
      throw new Error(`unexpected path ${path}`);
    });
    const service = createLiveIdentityService({ request });

    await expect(service.getProfileSetup()).resolves.toMatchObject({
      complete: false,
      profile: { name: null, currency: 'SAR', version: 2 },
      preferences: { defaultCurrency: 'XXX', version: 3 },
      onboarding: { step: 'welcome', completedSteps: [], version: 4 }
    });
  });

  test('waits for new-owner provisioning before reading dependent setup records', async () => {
    let provisioned = false;
    const request = async (path: string) => {
      if (path === '/api/v1/me') {
        await Promise.resolve();
        provisioned = true;
        return profile;
      }
      if (!provisioned) throw new Error('PROFILE_INACTIVE');
      if (path === '/api/v1/me/preferences') return preferences;
      if (path === '/api/v1/me/onboarding') return onboarding;
      throw new Error(`unexpected path ${path}`);
    };
    await expect(
      createLiveIdentityService({ request }).getProfileSetup()
    ).resolves.toMatchObject({
      complete: false,
      onboarding: { completedSteps: [] }
    });
  });

  test('reopens legacy completed welcome when the server requires currency selection', async () => {
    const service = createLiveIdentityService({
      request: async (path) =>
        path === '/api/v1/me'
          ? profile
          : path.endsWith('/preferences')
            ? {
                ...preferences,
                defaultCurrency: 'SAR',
                currencySelectionRequired: true
              }
            : {
                ...onboarding,
                step: 'tracking_intro',
                completedSteps: ['welcome']
              }
    });
    await expect(service.getProfileSetup()).resolves.toMatchObject({
      complete: false,
      preferences: { currencySelectionRequired: true }
    });
  });

  test('keeps completed welcome incomplete when an old API omits currency provenance', async () => {
    const service = createLiveIdentityService({
      request: async (path) =>
        path === '/api/v1/me'
          ? profile
          : path.endsWith('/preferences')
            ? { ...preferences, defaultCurrency: 'SAR' }
            : {
                ...onboarding,
                step: 'complete',
                completedSteps: ['welcome', 'complete'],
                completedAt: '2026-10-10T00:00:00.000Z'
              }
    });
    await expect(service.getProfileSetup()).resolves.toMatchObject({
      complete: false
    });
  });

  test('preserves completed welcome when the negotiated server proves configured currency', async () => {
    const service = createLiveIdentityService({
      request: async (path) =>
        path === '/api/v1/me'
          ? profile
          : path.endsWith('/preferences')
            ? {
                ...preferences,
                defaultCurrency: 'SAR',
                currencySelectionRequired: false
              }
            : {
                ...onboarding,
                step: 'tracking_intro',
                completedSteps: ['welcome']
              }
    });
    await expect(service.getProfileSetup()).resolves.toMatchObject({
      complete: true
    });
  });

  test('rejects missing server currency confirmation before completing welcome or saving local setup', async () => {
    const writes: string[] = [];
    const localSaves: UserProfile[] = [];
    const service = createLiveIdentityService({
      saveLocalProfile: async (value) => {
        localSaves.push(value);
      },
      request: async (path, options) => {
        if (options?.method) writes.push(path);
        return path === '/api/v1/me'
          ? { ...profile, displayName: 'New customer' }
          : path.endsWith('/preferences')
            ? { ...preferences, defaultCurrency: 'AED' }
            : {
                ...onboarding,
                step: 'tracking_intro',
                completedSteps: ['welcome']
              };
      }
    });
    const snapshot = await service.getProfileSetup();
    localSaves.length = 0;
    await expect(
      service.saveProfileSetup(
        { name: 'New customer', currency: 'AED' },
        snapshot,
        'legacy-no-proof'
      )
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
    expect(writes).toEqual(['/api/v1/me', '/api/v1/me/preferences']);
    expect(localSaves).toEqual([]);
  });

  test('opts into currency onboarding status when the preference server preserves legacy clients', async () => {
    const service = createLiveIdentityService({
      request: async (path, options) => {
        if (path === '/api/v1/me') return profile;
        if (path.endsWith('/preferences')) {
          const current =
            (options?.headers as Record<string, string> | undefined)?.Accept ===
            'application/json; currency-onboarding=1';
          return {
            ...preferences,
            defaultCurrency: 'SAR',
            ...(current ? { currencySelectionRequired: true } : {})
          };
        }
        return {
          ...onboarding,
          step: 'tracking_intro',
          completedSteps: ['welcome']
        };
      }
    });
    await expect(service.getProfileSetup()).resolves.toMatchObject({
      complete: false,
      preferences: { currencySelectionRequired: true }
    });
  });

  test('keeps onboarding incomplete when a selected currency is unavailable on the server', async () => {
    const service = createLiveIdentityService({
      request: async (path, options) =>
        path === '/api/v1/me'
          ? profile
          : path.endsWith('/preferences')
            ? {
                ...preferences,
                defaultCurrency: options?.method ? 'AED' : 'SAR',
                currencySelectionRequired: true
              }
            : onboarding
    });
    const snapshot = await service.getProfileSetup();
    await expect(
      service.saveProfileSetup(
        { name: 'New customer', currency: 'AED' },
        snapshot,
        'disabled-currency'
      )
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  test('saves name and currency before marking welcome complete', async () => {
    const calls: { path: string; options: Record<string, unknown> }[] = [];
    const request = jest.fn(
      async (path: string, options: Record<string, unknown> = {}) => {
        if (!options.method) {
          if (path === '/api/v1/me') return profile;
          if (path === '/api/v1/me/preferences')
            return { ...preferences, defaultCurrency: 'SAR' };
          if (path === '/api/v1/me/onboarding') return onboarding;
        }
        calls.push({ path, options });
        if (path === '/api/v1/me')
          return { ...profile, displayName: 'Adel Mohamed', version: 3 };
        if (path === '/api/v1/me/preferences')
          return {
            ...preferences,
            defaultCurrency: 'AED',
            version: 4,
            currencySelectionRequired: false
          };
        if (path === '/api/v1/me/onboarding')
          return {
            step: 'tracking_intro',
            completedSteps: ['welcome'],
            completedAt: null,
            version: 5
          };
        throw new Error(`unexpected path ${path}`);
      }
    );
    const service = createLiveIdentityService({ request });
    const snapshot = await service.getProfileSetup();

    await expect(
      service.saveProfileSetup(
        { name: '  Adel Mohamed  ', currency: 'AED' },
        snapshot,
        'profile-setup-123'
      )
    ).resolves.toMatchObject({
      value: {
        complete: true,
        profile: { name: 'Adel Mohamed', currency: 'AED', version: 3 },
        preferences: { defaultCurrency: 'AED', version: 4 },
        onboarding: {
          step: 'tracking_intro',
          completedSteps: ['welcome'],
          version: 5
        }
      }
    });
    expect(calls.map(({ path }) => path)).toEqual([
      '/api/v1/me',
      '/api/v1/me/preferences',
      '/api/v1/me/onboarding'
    ]);
    expect(calls[0]?.options).toMatchObject({
      method: 'PATCH',
      headers: { 'Idempotency-Key': 'profile-setup-123-profile' },
      body: { displayName: 'Adel Mohamed', expectedVersion: 2 }
    });
    expect(calls[1]?.options).toMatchObject({
      method: 'PUT',
      headers: { 'Idempotency-Key': 'profile-setup-123-preferences' },
      body: {
        defaultCurrency: 'AED',
        currencySelectionConfirmed: true,
        language: 'ar',
        theme: 'system',
        calendar: 'gregorian',
        weekStart: 6,
        privacySettings: {},
        expectedVersion: 3
      }
    });
    expect(calls[2]?.options).toMatchObject({
      method: 'PUT',
      headers: { 'Idempotency-Key': 'profile-setup-123-onboarding' },
      body: {
        step: 'tracking_intro',
        completedSteps: ['welcome'],
        complete: false,
        expectedVersion: 4
      }
    });
  });

  test('preserves profile completion when later tracking onboarding is saved', async () => {
    const request = jest.fn(
      async (_path: string, options?: { body?: unknown }) => {
        if (!options)
          return {
            step: 'tracking_intro',
            completedSteps: ['welcome'],
            completedAt: null,
            version: 8
          };
        return {
          step: 'permission_education',
          completedSteps: ['welcome', 'tracking_intro'],
          completedAt: null,
          version: 9
        };
      }
    );
    const service = createLiveIdentityService({ request });
    await service.loadProgress();
    await service.saveProgress({
      platformPath: 'android',
      status: 'in_progress',
      completedSteps: ['tracking_intro'],
      skippedSteps: [],
      currentStep: 'permission_education',
      permissionEducationSeen: true,
      trackingPreference: null,
      updatedAt: 10
    });

    expect(request).toHaveBeenLastCalledWith(
      '/api/v1/me/onboarding',
      expect.objectContaining({
        body: expect.objectContaining({
          completedSteps: ['welcome', 'tracking_intro'],
          expectedVersion: 8
        })
      })
    );
  });
});
