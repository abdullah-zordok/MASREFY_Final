import { useAppShellStore } from './app-shell';
import { resetLocalUserData } from '@/storage/local-data-reset';
import { registerRuntimeIdentityReset } from '@/storage/runtime-user-data-reset';
import { usePreferenceStore } from './preferences';
import * as database from '@/storage/database';
import { waitFor } from '@testing-library/react-native';
import type {
  AuthenticationSession,
  OnboardingProgress
} from '@/domain/app-shell';

jest.mock('@/storage/local-data-reset', () => ({
  resetLocalUserData: jest.fn(async () => ({
    deletedRows: 0,
    operationId: 'unused'
  }))
}));

const liveSession: AuthenticationSession = {
  status: 'authenticated',
  userId: 'user_live_123456',
  method: 'google',
  issuedAt: 1_000,
  expiresAt: 61_000,
  restoration: 'restored'
};
const onboarding: OnboardingProgress = {
  platformPath: 'android',
  status: 'in_progress',
  completedSteps: ['tracking_intro'],
  skippedSteps: [],
  currentStep: 'permission_education',
  permissionEducationSeen: true,
  trackingPreference: null,
  updatedAt: 1_000
};

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
  process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
  jest.clearAllMocks();
  useAppShellStore.getState().reset();
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_CLIENT_MODE;
});

test('rejects a synthetic authenticated session outside demo mode', async () => {
  await expect(
    useAppShellStore.getState().authenticate({
      ...liveSession,
      userId: 'mock-user'
    })
  ).rejects.toThrow('invalid live session');
  expect(useAppShellStore.getState().session).toBeNull();
});

test('sign-out hides the previous owner view while preserving its stored data', async () => {
  const clearPrivateCache = jest.fn();
  const unregister = registerRuntimeIdentityReset(clearPrivateCache);
  useAppShellStore.setState({
    hydrated: true,
    session: liveSession,
    onboarding,
    pendingDestination: '/reports'
  });
  usePreferenceStore.setState({ locale: 'ar', baseCurrencyCode: 'SAR' });

  try {
    await useAppShellStore.getState().signOut();
  } finally {
    unregister();
  }

  expect(resetLocalUserData).not.toHaveBeenCalled();
  expect(clearPrivateCache).toHaveBeenCalledTimes(1);
  expect(usePreferenceStore.getState()).toMatchObject({
    locale: 'ar',
    baseCurrencyCode: 'SAR'
  });
  expect(useAppShellStore.getState()).toMatchObject({
    session: { status: 'signed_out' },
    onboarding: null,
    pendingDestination: null,
    privacyLock: null,
    pinCredential: null
  });
});

test('hides the previous owner before switching the live database owner', async () => {
  let releaseOwnerSwitch: (() => void) | undefined;
  const configureOwner = jest
    .spyOn(database, 'configureDatabaseOwner')
    .mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseOwnerSwitch = resolve;
        })
    );
  useAppShellStore.setState({
    hydrated: true,
    session: liveSession,
    onboarding,
    privacyLock: {
      pinConfigured: true,
      biometricStatus: 'disabled',
      autoLockDuration: 'immediate',
      invalidAttempts: 0,
      lockedUntil: null,
      appLockStatus: 'unlocked'
    }
  });

  const switching = useAppShellStore.getState().authenticate({
    ...liveSession,
    userId: 'user_live_654321'
  });
  await waitFor(() => expect(configureOwner).toHaveBeenCalled());

  expect(useAppShellStore.getState()).toMatchObject({
    hydrated: false,
    session: null,
    onboarding: null,
    privacyLock: null
  });

  releaseOwnerSwitch?.();
  await switching;
  configureOwner.mockRestore();
});
