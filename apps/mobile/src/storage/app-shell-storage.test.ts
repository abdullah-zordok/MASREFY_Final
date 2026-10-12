import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useAppShellStore } from '@/state/app-shell';
import { restoreAppShellSession } from '@/features/auth/session-controller';
import type { AuthService } from '@/services/contracts/app-shell-service';

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
  PinCredential,
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
const credential =
  `pbkdf2-sha256:120000:${'01'.repeat(16)}:${'ab'.repeat(32)}` as PinCredential;

beforeEach(() => {
  clearAppShellStorageOwner();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('createAppShellStorage', () => {
  it.each(['digest', 'migration'] as const)(
    'does not restore owner access when %s finishes after unavailable-session suspension',
    async (stage) => {
      let finish!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      if (stage === 'digest')
        jest.mocked(Crypto.digestStringAsync).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve('b'.repeat(64));
              entered();
            })
        );
      else
        secureGet.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = () => resolve(null);
              entered();
            })
        );
      await AsyncStorage.setItem(
        'masarifi.appShell.pendingDestination',
        '/welcome'
      );
      await AsyncStorage.setItem(
        `masarifi.appShell.pendingDestination.${'b'.repeat(24)}`,
        '/private'
      );
      const configuring = configureAppShellStorageOwner('owner-b');
      await started;
      process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
      jest.useFakeTimers();
      useAppShellStore.setState({ session: null });
      try {
        const auth = {
          restoreSession: () => new Promise(() => undefined)
        } as AuthService;
        const restoring = restoreAppShellSession(auth);
        const rejected = expect(restoring).rejects.toThrow(
          'bootstrap unavailable'
        );
        await jest.advanceTimersByTimeAsync(30_000);
        await rejected;
      } finally {
        jest.useRealTimers();
        delete process.env.EXPO_PUBLIC_CLIENT_MODE;
      }
      finish();
      await configuring;
      expect(await createAppShellStorage().loadPendingDestination()).toBe(
        '/welcome'
      );
    }
  );
  it('clears every native app-shell user record', async () => {
    await clearAppShellUserData();

    for (const key of [
      'masarifi.appShell.onboarding',
      'masarifi.appShell.keywords',
      'masarifi.appShell.trackingPreference',
      'masarifi.appShell.pendingDestination',
      'masarifi.appShell.profilePromptDismissed',
      'masarifi.appShell.trackingHomeCardDismissed'
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

    expect(asyncRemove).toHaveBeenCalledWith(
      'masarifi.appShell.preview.session'
    );
    expect(asyncRemove).toHaveBeenCalledWith(
      'masarifi.appShell.preview.privacyLock'
    );
    expect(asyncRemove).toHaveBeenCalledWith(
      'masarifi.appShell.preview.masarifi.appShell.pinCredential'
    );
    expect(secureDelete).not.toHaveBeenCalled();
  });

  it('stores native session, privacy lock, and PIN records in SecureStore', async () => {
    const storage = createAppShellStorage();

    await storage.saveSession(session);
    await storage.savePrivacyLock(lock);
    await storage.savePinCredential(credential);
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
      JSON.stringify(credential)
    );
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.session');
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.privacyLock');
    expect(secureDelete).toHaveBeenCalledWith(
      'masarifi.appShell.pinCredential'
    );
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
    await storage.saveTrackingHomeCardDismissed(true);
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
      'masarifi.appShell.trackingHomeCardDismissed',
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

  it('loads and saves PIN credentials only in the active owner namespace', async () => {
    const storage = createAppShellStorage();
    await configureAppShellStorageOwner('user_owner-a');
    jest.clearAllMocks();
    secureGet.mockImplementation(async (key) =>
      key === `masarifi.appShell.pinCredential.${'a'.repeat(24)}`
        ? JSON.stringify(credential)
        : null
    );

    await storage.savePinCredential(credential);

    await expect(storage.loadPinCredential()).resolves.toBe(credential);
    expect(secureSet).toHaveBeenCalledWith(
      `masarifi.appShell.pinCredential.${'a'.repeat(24)}`,
      JSON.stringify(credential)
    );
  });

  it('isolates the tracking-card dismissal between authenticated owners', async () => {
    const storage = createAppShellStorage();
    await configureAppShellStorageOwner('user_owner-a');
    await storage.saveTrackingHomeCardDismissed(true);
    const ownerAKey = asyncSet.mock.calls.at(-1)?.[0];

    await configureAppShellStorageOwner('user_owner-b');
    await storage.saveTrackingHomeCardDismissed(true);
    const ownerBKey = asyncSet.mock.calls.at(-1)?.[0];

    expect(ownerAKey).not.toBe(ownerBKey);
    expect(ownerAKey).toMatch(
      /^masarifi\.appShell\.trackingHomeCardDismissed\./
    );
    expect(ownerBKey).toMatch(
      /^masarifi\.appShell\.trackingHomeCardDismissed\./
    );
  });

  it('moves a valid legacy PIN and privacy lock into the first owner namespace', async () => {
    secureGet.mockImplementation(async (key) => {
      if (key === 'masarifi.appShell.privacyLock') return JSON.stringify(lock);
      if (key === 'masarifi.appShell.pinCredential')
        return JSON.stringify(credential);
      return null;
    });

    await configureAppShellStorageOwner('user_owner-a');

    expect(secureSet).toHaveBeenCalledWith(
      `masarifi.appShell.privacyLock.${'a'.repeat(24)}`,
      JSON.stringify(lock)
    );
    expect(secureSet).toHaveBeenCalledWith(
      `masarifi.appShell.pinCredential.${'a'.repeat(24)}`,
      JSON.stringify(credential)
    );
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.privacyLock');
    expect(secureDelete).toHaveBeenCalledWith(
      'masarifi.appShell.pinCredential'
    );
  });

  it.each(['pin:123456', 'corrupt'])(
    'removes an invalid legacy PIN without copying it: %s',
    async (invalidCredential) => {
      secureGet.mockImplementation(async (key) =>
        key === 'masarifi.appShell.pinCredential'
          ? JSON.stringify(invalidCredential)
          : null
      );

      await configureAppShellStorageOwner('user_owner-a');

      expect(secureSet).not.toHaveBeenCalledWith(
        expect.stringContaining('pinCredential'),
        expect.any(String)
      );
      expect(secureDelete).toHaveBeenCalledWith(
        'masarifi.appShell.pinCredential'
      );
    }
  );

  it('removes an invalid owner PIN when it is loaded', async () => {
    const ownerKey = `masarifi.appShell.pinCredential.${'a'.repeat(24)}`;
    secureGet.mockImplementation(async (key) =>
      key === ownerKey ? JSON.stringify('pin:123456') : null
    );

    await configureAppShellStorageOwner('user_owner-a');
    const storage = createAppShellStorage();

    await expect(storage.loadPinCredential()).resolves.toBeNull();
    expect(secureDelete).toHaveBeenCalledWith(ownerKey);
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
    await expect(storage.loadTrackingHomeCardDismissed()).resolves.toBe(false);
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
      await storage.savePinCredential(credential);
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
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.preview.masarifi.appShell.pinCredential',
      JSON.stringify(credential)
    );
    expect(secureSet).not.toHaveBeenCalled();
  });
});
