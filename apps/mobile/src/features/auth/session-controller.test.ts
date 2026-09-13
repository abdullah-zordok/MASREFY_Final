import { createMockAuthService } from '@/services/mocks/auth-service';
import { buildPreferences } from '@/domain/foundation';
import type { ProfileSetupSnapshot } from '@/domain/settings';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { registerRuntimeIdentityReset } from '@/storage/runtime-user-data-reset';
import { loadPreferences, savePreferences } from '@/storage/secure-preferences';

import {
  completeAuthenticatedSession,
  restoreAppShellSession,
  signOutAppShellSession
} from './session-controller';
import { authenticatedSession } from '@/test-utils/app-shell-fixtures';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn()
}));
jest.mock('@/storage/local-data-reset', () => ({
  resetLocalUserData: jest.fn(async (operationId: string) => ({
    deletedRows: 0,
    operationId
  }))
}));
jest.mock('@/storage/secure-preferences', () => ({
  loadPreferences: jest.fn(),
  savePreferences: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('@/services/mocks/subscription-settings-service', () => ({
  settingsService: {
    getProfileSetup: jest.fn(async () => ({ complete: true }))
  }
}));

const aedProfileSetup: ProfileSetupSnapshot = {
  complete: true,
  profile: {
    name: 'Dana',
    avatar: 'default',
    phone: '+966500000000',
    googleAccount: null,
    email: 'dana@example.com',
    country: 'AE',
    currency: 'AED',
    timeZone: 'Asia/Dubai',
    completion: ['identity', 'currency'],
    version: 1
  },
  preferences: {
    defaultCurrency: 'AED',
    language: 'ar',
    theme: 'light',
    calendar: 'gregorian',
    weekStart: 6,
    privacySettings: {},
    version: 1
  },
  onboarding: {
    step: 'complete',
    completedSteps: ['welcome', 'complete'],
    completedAt: new Date(0).toISOString(),
    version: 1
  }
};

const mockLoadPreferences = jest.mocked(loadPreferences);
const mockSavePreferences = jest.mocked(savePreferences);

beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  mockLoadPreferences.mockResolvedValue(
    buildPreferences({ baseCurrencyCode: 'SAR' })
  );
  useAppShellStore.getState().reset();
  usePreferenceStore.setState({
    ...buildPreferences({ baseCurrencyCode: 'SAR' }),
    hydrated: true
  });
});

afterAll(() => {
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
});

describe('session-controller', () => {
  it('loads server profile setup after restoring an authenticated session', async () => {
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();
    const snapshot = {
      complete: false,
      profile: { name: null },
      preferences: {},
      onboarding: {}
    };

    await restoreAppShellSession(auth, () => true, {
      getProfileSetup: jest.fn(async () => snapshot)
    } as never);

    expect(useAppShellStore.getState()).toMatchObject({
      profileSetupStatus: 'incomplete',
      profileSetupSnapshot: snapshot,
      session: { status: 'authenticated' }
    });
  });

  it('keeps a valid session and exposes retry when the server check fails', async () => {
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();

    await restoreAppShellSession(auth, () => true, {
      getProfileSetup: jest.fn(async () => {
        throw new Error('offline');
      })
    } as never);

    expect(useAppShellStore.getState()).toMatchObject({
      profileSetupStatus: 'error',
      profileSetupSnapshot: null,
      session: { status: 'authenticated' }
    });
  });

  it('restores an authenticated mock session into the app shell store', async () => {
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();

    await restoreAppShellSession(auth);

    expect(useAppShellStore.getState().session).toMatchObject({
      status: 'authenticated',
      method: 'google'
    });
  });

  it('restores the server profile currency into local preferences', async () => {
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();
    await restoreAppShellSession(auth, () => true, {
      getProfileSetup: jest.fn(async () => aedProfileSetup)
    });

    expect(usePreferenceStore.getState().baseCurrencyCode).toBe('AED');
  });

  it('applies server currency after concurrent preference hydration', async () => {
    let finishHydration!: () => void;
    mockLoadPreferences.mockReturnValueOnce(
      new Promise((resolve) => {
        finishHydration = () =>
          resolve(
            buildPreferences({ locale: 'en', baseCurrencyCode: 'SAR' })
          );
      })
    );
    usePreferenceStore.setState({
      ...buildPreferences({}),
      hydrated: false
    });
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();
    let profileRequested!: () => void;
    const profileRequest = new Promise<void>((resolve) => {
      profileRequested = resolve;
    });

    const hydration = usePreferenceStore.getState().hydrate();
    const restoration = restoreAppShellSession(auth, () => true, {
      getProfileSetup: jest.fn(async () => {
        profileRequested();
        return aedProfileSetup;
      })
    });
    await profileRequest;
    finishHydration();
    await Promise.all([hydration, restoration]);

    expect(usePreferenceStore.getState()).toMatchObject({
      hydrated: true,
      locale: 'en',
      baseCurrencyCode: 'AED'
    });
  });

  it('waits for an active preference normalization before saving server currency', async () => {
    let finishNormalization!: () => void;
    let normalizationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      normalizationStarted = resolve;
    });
    mockLoadPreferences.mockResolvedValueOnce(
      buildPreferences({ theme: 'dark', baseCurrencyCode: 'SAR' })
    );
    mockSavePreferences.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishNormalization = resolve;
          normalizationStarted();
        })
    );
    usePreferenceStore.setState({
      ...buildPreferences({}),
      hydrated: false
    });
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();

    const hydration = usePreferenceStore.getState().hydrate();
    await started;
    let restored = false;
    let profileRequested!: () => void;
    const profileRequest = new Promise<void>((resolve) => {
      profileRequested = resolve;
    });
    const restoration = restoreAppShellSession(auth, () => true, {
      getProfileSetup: jest.fn(async () => {
        profileRequested();
        return aedProfileSetup;
      })
    }).then(() => {
      restored = true;
    });
    await profileRequest;
    await Promise.resolve();

    expect(mockSavePreferences).toHaveBeenCalledTimes(1);
    expect(restored).toBe(false);
    finishNormalization();
    await Promise.all([hydration, restoration]);
    expect(usePreferenceStore.getState().baseCurrencyCode).toBe('AED');
  });

  it('preserves server profile status when preference hydration fails', async () => {
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();
    usePreferenceStore.setState({
      ...buildPreferences({}),
      hydrated: false,
      hydrate: jest.fn().mockRejectedValue(new Error('storage unavailable'))
    });

    await restoreAppShellSession(auth, () => true, {
      getProfileSetup: jest.fn(async () => aedProfileSetup)
    });

    expect(useAppShellStore.getState()).toMatchObject({
      profileSetupStatus: 'complete',
      profileSetupSnapshot: aedProfileSetup
    });
  });

  it('clears local shell state after local or all-device sign-out simulation', async () => {
    const auth = createMockAuthService();
    await auth.signInWithGoogle();
    await restoreAppShellSession(auth);

    await signOutAppShellSession(auth, 'all');

    expect(useAppShellStore.getState().session?.status).toBe('signed_out');
    await expect(auth.restoreSession()).resolves.toMatchObject({
      status: 'signed_out'
    });
  });

  it('clears local private state when provider sign-out fails', async () => {
    const auth = createMockAuthService();
    await auth.signInWithGoogle();
    await restoreAppShellSession(auth);
    const resetIdentity = jest.fn();
    const unregister = registerRuntimeIdentityReset(resetIdentity);
    const providerFailure = new Error('provider unavailable');
    jest.spyOn(auth, 'signOut').mockRejectedValueOnce(providerFailure);

    await expect(signOutAppShellSession(auth, 'all')).rejects.toBe(providerFailure);

    expect(useAppShellStore.getState().session?.status).toBe('signed_out');
    expect(resetIdentity).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('starts the correct onboarding path after authentication', async () => {
    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'android', smsAvailable: true },
        now: () => 10
      })
    ).resolves.toBe('/(onboarding)/tracking-intro');

    expect(useAppShellStore.getState().onboarding).toMatchObject({
      platformPath: 'android',
      currentStep: 'tracking_intro'
    });

    useAppShellStore.getState().reset();
    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'ios', smsAvailable: false },
        now: () => 10
      })
    ).resolves.toBe('/(onboarding)/ios-capture-options');

    useAppShellStore.getState().reset();
    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'windows', smsAvailable: false },
        now: () => 10
      })
    ).resolves.toBe('/(onboarding)/tracking-demo');
  });

  it('does not repeat completed onboarding after re-authentication', async () => {
    useAppShellStore.setState({
      onboarding: {
        platformPath: 'android',
        status: 'completed',
        completedSteps: ['complete'],
        skippedSteps: [],
        currentStep: null,
        permissionEducationSeen: true,
        trackingPreference: null,
        updatedAt: 10
      }
    });

    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'android', smsAvailable: true },
        now: () => 20
      })
    ).resolves.toBe('/(tabs)/home');

    expect(useAppShellStore.getState().onboarding?.status).toBe('completed');
  });

  it('routes from the newly authenticated owner state instead of the previous owner view', async () => {
    useAppShellStore.setState({
      onboarding: {
        platformPath: 'android',
        status: 'completed',
        completedSteps: ['complete'],
        skippedSteps: [],
        currentStep: null,
        permissionEducationSeen: true,
        trackingPreference: null,
        updatedAt: 10
      }
    });
    const authenticate = jest
      .spyOn(useAppShellStore.getState(), 'authenticate')
      .mockImplementation(async () => {
        useAppShellStore.setState({ onboarding: null });
      });

    await expect(
      completeAuthenticatedSession(authenticatedSession, {
        platform: { os: 'android', smsAvailable: true },
        now: () => 20
      })
    ).resolves.toBe('/(onboarding)/tracking-intro');
    authenticate.mockRestore();
  });
});
