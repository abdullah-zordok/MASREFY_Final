import { useAppShellStore } from './app-shell';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { buildPreferences } from '@/domain/foundation';
import { seedClientDemoData } from '@/storage/client-demo-seeder';
import { resetLocalUserData } from '@/storage/local-data-reset';
import { resetRuntimeUserData } from '@/storage/runtime-user-data-reset';
import { usePreferenceStore } from './preferences';
import type {
  AuthenticationSession,
  OnboardingProgress,
  PrivacyLockPreference
} from '@/domain/app-shell';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn()
}));
jest.mock('@/storage/client-demo-seeder', () => ({
  seedClientDemoData: jest.fn(async () => true)
}));
jest.mock('@/storage/local-data-reset', () => ({
  resetLocalUserData: jest.fn(async (operationId: string) => ({
    deletedRows: 4,
    operationId
  }))
}));

const secureGet = jest.mocked(SecureStore.getItemAsync);
const secureSet = jest.mocked(SecureStore.setItemAsync);
const secureDelete = jest.mocked(SecureStore.deleteItemAsync);
const asyncGet = jest.mocked(AsyncStorage.getItem);
const asyncSet = jest.mocked(AsyncStorage.setItem);
const seedDemo = jest.mocked(seedClientDemoData);
const resetUserData = jest.mocked(resetLocalUserData);

const session: AuthenticationSession = {
  status: 'authenticated',
  userId: 'mock-user',
  method: 'google',
  issuedAt: 10,
  expiresAt: 20,
  restoration: 'restored'
};

const onboarding: OnboardingProgress = {
  platformPath: 'android',
  status: 'completed',
  completedSteps: ['complete'],
  skippedSteps: [],
  currentStep: null,
  permissionEducationSeen: true,
  trackingPreference: null,
  updatedAt: 20
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
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
  jest.clearAllMocks();
  useAppShellStore.getState().reset();
  usePreferenceStore.setState({ ...buildPreferences({}), hydrated: true });
  secureGet.mockImplementation(async (key) =>
    key === 'masarifi.appShell.session'
      ? JSON.stringify(session)
      : JSON.stringify(lock)
  );
  asyncGet.mockImplementation(async (key) => {
    if (key === 'masarifi.appShell.onboarding')
      return JSON.stringify(onboarding);
    if (key === 'masarifi.appShell.pendingDestination') return '/reports';
    return null;
  });
});

describe('useAppShellStore', () => {
  it('opens an enabled client demo as a completed local user', async () => {
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    secureGet.mockResolvedValue(null);
    asyncGet.mockResolvedValue(null);

    await useAppShellStore.getState().hydrate(100);

    expect(useAppShellStore.getState()).toMatchObject({
      hydrated: true,
      session: {
        status: 'authenticated',
        userId: 'client-demo',
        restoration: 'restored'
      },
      onboarding: { status: 'completed', currentStep: null },
      privacyLock: null
    });
    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.session',
      expect.stringContaining('client-demo')
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.onboarding',
      expect.stringContaining('completed')
    );
    expect(seedDemo).toHaveBeenCalledWith({ locale: 'ar', now: 100 });
  });

  it('hydrates a persisted English preference before demo startup', async () => {
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    usePreferenceStore.setState({ ...buildPreferences({}), hydrated: false });
    secureGet.mockImplementation(async (key) => {
      if (key === 'masarifi.preferences')
        return JSON.stringify({ locale: 'en' });
      if (key === 'masarifi.appShell.session') return JSON.stringify(session);
      return JSON.stringify(lock);
    });

    await useAppShellStore.getState().hydrate(100);

    expect(seedDemo).toHaveBeenCalledWith({ locale: 'en', now: 100 });
  });

  it('waits for demo seeding before exposing a hydrated shell', async () => {
    process.env.EXPO_PUBLIC_DEMO_MODE = '1';
    let finishSeed!: () => void;
    seedDemo.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finishSeed = () => resolve(true);
      })
    );

    const hydration = useAppShellStore.getState().hydrate(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(seedDemo).toHaveBeenCalledTimes(1);
    expect(useAppShellStore.getState().hydrated).toBe(false);
    finishSeed();
    await hydration;
    expect(useAppShellStore.getState().hydrated).toBe(true);
  });

  it('hydrates session, onboarding, pending route, and lock atomically', async () => {
    await useAppShellStore.getState().hydrate(15);

    expect(useAppShellStore.getState()).toMatchObject({
      hydrated: true,
      session,
      onboarding,
      pendingDestination: '/reports',
      privacyLock: lock
    });
  });

  it('marks an expired persisted session before protected routes can render', async () => {
    await useAppShellStore.getState().hydrate(21);

    expect(useAppShellStore.getState().session?.status).toBe('expired');
  });

  it('fails closed instead of hanging when secure hydration rejects', async () => {
    secureGet.mockRejectedValueOnce(new Error('secure storage unavailable'));

    await useAppShellStore.getState().hydrate(15);

    expect(useAppShellStore.getState()).toMatchObject({
      hydrated: true,
      session: { status: 'signed_out' },
      pendingDestination: null,
      privacyLock: null
    });
  });

  it('persists authentication, expiry, sign-out, onboarding, route, and lock actions', async () => {
    await useAppShellStore.getState().authenticate(session);
    await useAppShellStore.getState().expireSession();
    await useAppShellStore.getState().setOnboarding(onboarding);
    await useAppShellStore.getState().setTrackingPreference({
      mode: 'automatic_clear',
      selectedAt: 20,
      isRecommended: true
    });
    await useAppShellStore.getState().setPendingDestination('/(tabs)/home');
    await useAppShellStore.getState().setPrivacyLock(lock);
    await useAppShellStore.getState().configurePrivacyLock('pin:123456', 30);
    await useAppShellStore.getState().recordFailedUnlock(40);
    await useAppShellStore.getState().lockNow();
    await useAppShellStore.getState().unlock();
    await useAppShellStore.getState().resetPrivacyLock();
    await useAppShellStore.getState().signOut();

    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.session',
      JSON.stringify(session)
    );
    expect(useAppShellStore.getState().session?.status).toBe('signed_out');
    expect(resetUserData).toHaveBeenCalledWith(
      expect.stringMatching(/^sign-out-/)
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.onboarding',
      JSON.stringify(onboarding)
    );
    expect(asyncSet).toHaveBeenCalledWith(
      'masarifi.appShell.pendingDestination',
      '/(tabs)/home'
    );
    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.privacyLock',
      JSON.stringify(lock)
    );
    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.pinCredential',
      JSON.stringify('pin:123456')
    );
    expect(secureDelete).toHaveBeenCalledWith(
      'masarifi.appShell.pinCredential'
    );
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.session');
  });

  it('preserves lock preferences when replacing a legacy pin credential', async () => {
    const preferredLock: PrivacyLockPreference = {
      ...lock,
      biometricStatus: 'enabled',
      autoLockDuration: 'fifteen_minutes'
    };
    useAppShellStore.setState({
      privacyLock: preferredLock,
      pinCredential: 'pin:123456'
    });

    await useAppShellStore
      .getState()
      .configurePrivacyLock('pbkdf2-sha256:upgraded', 30);

    expect(useAppShellStore.getState()).toMatchObject({
      privacyLock: preferredLock,
      pinCredential: 'pbkdf2-sha256:upgraded'
    });
    expect(secureSet).toHaveBeenCalledWith(
      'masarifi.appShell.privacyLock',
      JSON.stringify(preferredLock)
    );
  });

  it('does not duplicate locale or theme preference state', () => {
    const state = useAppShellStore.getState();

    expect('locale' in state).toBe(false);
    expect('theme' in state).toBe(false);
  });

  it('clears authentication even when local user-data deletion fails', async () => {
    useAppShellStore.setState({ session, privacyLock: lock, pinCredential: 'pin:123456' });
    resetUserData.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(useAppShellStore.getState().signOut()).rejects.toThrow(
      'database unavailable'
    );

    expect(useAppShellStore.getState()).toMatchObject({
      session: { status: 'signed_out' },
      privacyLock: null,
      pinCredential: null
    });
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.session');
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.privacyLock');
    expect(secureDelete).toHaveBeenCalledWith('masarifi.appShell.pinCredential');
  });

  it('drops in-memory shell user data during a runtime user-data reset', () => {
    useAppShellStore.setState({
      session,
      onboarding,
      pendingDestination: '/reports',
      privacyLock: lock,
      profilePromptDismissed: true,
      pinCredential: 'pin:123456'
    });

    resetRuntimeUserData();

    expect(useAppShellStore.getState()).toMatchObject({
      session: { status: 'signed_out' },
      onboarding: null,
      pendingDestination: null,
      privacyLock: null,
      profilePromptDismissed: false,
      pinCredential: null
    });
  });
});
