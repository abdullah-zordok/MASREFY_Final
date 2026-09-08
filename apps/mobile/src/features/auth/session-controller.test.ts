import { createMockAuthService } from '@/services/mocks/auth-service';
import { useAppShellStore } from '@/state/app-shell';
import { registerRuntimeIdentityReset } from '@/storage/runtime-user-data-reset';

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

beforeEach(() => {
  process.env.EXPO_PUBLIC_DEMO_MODE = '1';
  useAppShellStore.getState().reset();
});

afterAll(() => {
  delete process.env.EXPO_PUBLIC_DEMO_MODE;
});

describe('session-controller', () => {
  it('restores an authenticated mock session into the app shell store', async () => {
    const auth = createMockAuthService({ now: () => 1_000 });
    await auth.signInWithGoogle();

    await restoreAppShellSession(auth);

    expect(useAppShellStore.getState().session).toMatchObject({
      status: 'authenticated',
      method: 'google'
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
