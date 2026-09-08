import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  clearAppShellStorageOwner,
  clearAppShellUserData,
  configureAppShellStorageOwner,
  createAppShellStorage
} from './app-shell-storage';
import type {
  AuthenticationSession,
  KeywordRule,
  OnboardingProgress,
  PrivacyLockPreference,
  TrackingPreference
} from '@/domain/app-shell';
import { defaultKeywordRules } from '@/services/mocks/default-keywords';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn()
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
    value.includes('owner-b') ? 'b'.repeat(64) : 'a'.repeat(64)
  )
}));

const secureGet = jest.mocked(SecureStore.getItemAsync);
const secureSet = jest.mocked(SecureStore.setItemAsync);
const secureDelete = jest.mocked(SecureStore.deleteItemAsync);
const asyncGet = jest.mocked(AsyncStorage.getItem);
const asyncSet = jest.mocked(AsyncStorage.setItem);
const asyncRemove = jest.mocked(AsyncStorage.removeItem);
const session: AuthenticationSession = {
  status: 'authenticated',
  userId: 'mock-user',
  method: 'phone',
  issuedAt: 10,
  expiresAt: 20,
  restoration: 'restored'
};

const onboarding: OnboardingProgress = {
  platformPath: 'android',
  status: 'in_progress',
  completedSteps: ['tracking_intro'],
  skippedSteps: [],
  currentStep: 'permission_education',
  permissionEducationSeen: false,
  trackingPreference: null,
  updatedAt: 10
};

const keyword: KeywordRule = {
  id: 'kw-1',
  group: 'expense',
  language: 'en',
  value: 'Grocery',
  normalizedValue: 'grocery',
  origin: 'default',
  enabled: true
};

const tracking: TrackingPreference = {
  mode: 'automatic_clear',
  selectedAt: 10,
  isRecommended: true
};

const lock: PrivacyLockPreference = {
  pinConfigured: true,
  biometricStatus: 'disabled',
  autoLockDuration: 'immediate',
  invalidAttempts: 0,
  lockedUntil: null,
  appLockStatus: 'locked'
};

beforeEach(() => {
  clearAppShellStorageOwner();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createAppShellStorage', () => {
  it('clears every native app-shell user record', async () => {
    await clearAppShellUserData();

    for (const key of [
      'masarifi.appShell.onboarding',
      'masarifi.appShell.keywords',
      'masarifi.appShell.trackingPreference',
      'masarifi.appShell.pendingDestination',
      'masarifi.appShell.profilePromptDismissed'
    ]) {
      expect(asyncRemove).toHaveBeenCalledWith(key);
    }
    for (const key of [
      'masarifi.appShell.session',
      'masarifi.appShell.privacyLock',
      'masarifi.appShell.pinCredential'
    ]) {
      expect(secureDelete).toHaveBeenCalledWith(key);
    }
  });

  it('clears web fallback app-shell user records without SecureStore', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });

    try {
      await clearAppShellUserData();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatform
      });
    }

    expect(asyncRemove).toHaveBeenCalledWith('masarifi.appShell.preview.session');
    expect(asyncRemove).toHaveBeenCalledWith('masarifi.appShell.preview.privacyLock');
    expect(asyncRemove).toHaveBeenCalledWith(
      'masarifi.appShell.preview.masarifi.appShell.pinCredential'
    );
    expect(secureDelete).not.toHaveBeenCalled();
  });

  it('stores native session and privacy lock records in SecureStore', async () => {
    const storage = createAppShellStorage();

    await storage.saveSession(session);
    await storage.savePrivacyLock(lock);
    await storage.savePinCredential('pin:123456');
    await storage.clearSession();
    await storage.clearPrivacyLock();
    await storage.clearPinCredential();

    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.session',
      JSON.stringify(session)
    );
    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.privacyLock',
      JSON.stringify(lock)
    );
    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.pinCredential',
      JSON.stringify('pin:123456')
    );
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.session');
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.privacyLock');
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.pinCredential');
    expect(asyncSet).not.toHaveBeenCalledWith(
      'masarifi.appShell.session',
      expect.any(String)
    );
  });

  it('stores non-sensitive shell records in AsyncStorage', async () => {
    const storage = createAppShellStorage();

    await storage.saveOnboarding(onboarding);
    await storage.saveKeywords([keyword]);
    await storage.saveTrackingPreference(tracking);
    await storage.saveProfilePromptDismissed(true);
    await storage.savePendingDestination('/(tabs)/home');
    await storage.savePendingDestination(null);

    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.onboarding',
      JSON.stringify(onboarding)
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.keywords',
      JSON.stringify([keyword])
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.trackingPreference',
      JSON.stringify(tracking)
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.profilePromptDismissed',
      JSON.stringify(true)
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.pendingDestination',
      '/(tabs)/home'
    );
    expect(asyncRemove).toHaveBeenCalledWith(
      'masarifi.appShell.pendingDestination'
    );
  });

  it('uses distinct owner namespaces for local shell records', async () => {
    const storage = createAppShellStorage();
    await configureAppShellStorageOwner('user_owner-a');
    await storage.savePendingDestination('/reports');
    const ownerAKey = asyncSet.mock.calls.at(-1)?.[0];

    await configureAppShellStorageOwner('user_owner-b');
    await storage.savePendingDestination('/tracking');
    const ownerBKey = asyncSet.mock.calls.at(-1)?.[0];

    expect(ownerAKey).not.toBe(ownerBKey);
    expect(ownerAKey).toMatch(/^masarifi\.appShell\.pendingDestination\./);
    expect(ownerBKey).toMatch(/^masarifi\.appShell\.pendingDestination\./);
  });

  it('moves a legacy PIN and privacy lock into the first verified owner namespace', async () => {
    secureGet.mockImplementation(async (key) => {
      if (key === 'masarifi.appShell.privacyLock') return JSON.stringify(lock);
      if (key === 'masarifi.appShell.pinCredential')
        return JSON.stringify('pin:123456');
      return null;
    });

    await configureAppShellStorageOwner('user_owner-a');

    expect(secureSet).toHaveBeenCalledWith(
      `masarifi.appShell.privacyLock.${'a'.repeat(24)}`,
      JSON.stringify(lock)
    );
    expect(secureSet).toHaveBeenCalledWith(
      `masarifi.appShell.pinCredential.${'a'.repeat(24)}`,
      JSON.stringify('pin:123456')
    );
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.privacyLock');
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.pinCredential');
  });

  it('returns null or empty defaults for missing and corrupt records', async () => {
    const storage = createAppShellStorage();
    secureGet.mockResolvedValue('{bad json');
    asyncGet.mockResolvedValue('{bad json');

    await expect(storage.loadSession()).resolves.toBeNull();
    await expect(storage.loadOnboarding()).resolves.toBeNull();
    await expect(storage.loadKeywords()).resolves.toEqual(defaultKeywordRules);
    await expect(storage.loadTrackingPreference()).resolves.toBeNull();
    await expect(storage.loadPrivacyLock()).resolves.toBeNull();
    await expect(storage.loadPinCredential()).resolves.toBeNull();
    await expect(storage.loadProfilePromptDismissed()).resolves.toBe(false);
  });

  it('uses explicit AsyncStorage preview fallback on web', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web'
    });
    const storage = createAppShellStorage();

    try {
      await storage.saveSession(session);
      await storage.savePrivacyLock(lock);
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatform
      });
    }

    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.preview.session',
      JSON.stringify(session)
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.preview.privacyLock',
      JSON.stringify(lock)
    );
    expect(secureSet).not.toHaveBeenCalled();
  });
});
