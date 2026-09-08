import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { OnboardingProgress } from '@/domain/app-shell';
import type { UserProfile } from '@/domain/settings';
import { createAuthService } from '@/features/auth/auth-flow';
import { requestJson } from './http-client';
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
    expect(selected.metadata).toMatchObject({ kind: 'live', availability: 'available' });
    await expect(selected.restoreSession()).resolves.toMatchObject({
      status: 'authenticated',
      userId: liveSession.userId,
      method: 'google',
      restoration: 'restored'
    });

    const request = jest.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await requestJson('/api/v1/me', z.object({ ok: z.literal(true) }).strict(), {
      baseUrl: 'https://api.example.test',
      request
    });
    expect(bridge.getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(request).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer clerk-token' })
      })
    );
  });

  test('rejects synthetic sessions and maps local versus all-session sign-out', async () => {
    const synthetic = clerkBridge({
      getSession: jest.fn(async () => ({ ...liveSession, id: 'mock-session', userId: 'mock-user' }))
    });
    await expect(createLiveAuthService(synthetic).restoreSession()).rejects.toMatchObject({
      code: 'contract_mismatch'
    });

    const bridge = clerkBridge();
    const service = createLiveAuthService(bridge);
    await service.signOut('local');
    await service.signOut('all');
    expect(bridge.signOut).toHaveBeenNthCalledWith(1, { scope: 'current' });
    expect(bridge.signOut).toHaveBeenNthCalledWith(2, { scope: 'all' });
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
      email: 'au***@example.test',
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

    await expect(createLiveIdentityService({ request }).listSessions()).resolves.toHaveLength(2);
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/v1/me/devices?limit=100&cursor=page-2',
      undefined
    );
  });
});
