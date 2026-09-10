import React from 'react';
import { AppState, Linking, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AppShellProvider } from './AppShellProvider';
import { useAppShellStore } from './app-shell';
import { usePreferenceStore } from './preferences';

const mockRestoreAppShellSession = jest.fn(
  async (..._args: unknown[]) => undefined
);
const mockSynchronizeLiveCoreFinance = jest.fn(async () => undefined);
const mockRefreshPlatformOperations = jest.fn(async () => undefined);
let mockLiveClerkSessionKey: string | null | undefined;

jest.mock('@/features/auth/session-controller', () => ({
  restoreAppShellSession: (...args: unknown[]) =>
    mockRestoreAppShellSession(...args)
}));
jest.mock('@/features/auth/auth-flow', () => ({ authService: {} }));
jest.mock('@/services/live/clerk-provider', () => ({
  useLiveClerkSessionKey: () => mockLiveClerkSessionKey
}));
jest.mock('@/services/live/core-finance-service', () => ({
  synchronizeLiveCoreFinance: () => mockSynchronizeLiveCoreFinance()
}));
jest.mock('@/services/platform-operations-service', () => ({
  refreshPlatformOperations: () => mockRefreshPlatformOperations()
}));

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn()
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() }
}));

describe('AppShellProvider', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_CLIENT_MODE;
    mockLiveClerkSessionKey = undefined;
    useAppShellStore.getState().reset();
    usePreferenceStore.setState({ locale: 'en', direction: 'ltr' });
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_CLIENT_MODE;
  });

  it('always renders children on first render so the navigator mounts immediately', () => {
    // Before hydration, children must still render. The entry route — not the
    // provider — owns the loading gate, so the Expo Router Stack is never
    // unmounted (which previously caused "navigate before mounting Root Layout").
    useAppShellStore.setState({ hydrated: false });
    const hydrate = jest
      .spyOn(useAppShellStore.getState(), 'hydrate')
      .mockResolvedValue(undefined);
    render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );

    expect(screen.getByText('protected child')).toBeOnTheScreen();
    hydrate.mockRestore();
  });

  it('triggers hydration once when not yet hydrated', async () => {
    const hydrate = jest
      .spyOn(useAppShellStore.getState(), 'hydrate')
      .mockResolvedValue(undefined);

    render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('waits for Clerk and restores the authoritative live session', async () => {
    process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
    mockLiveClerkSessionKey = 'sess_live_123';
    const hydrate = jest
      .spyOn(useAppShellStore.getState(), 'hydrate')
      .mockResolvedValue(undefined);

    render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRestoreAppShellSession).toHaveBeenCalledTimes(1);
    expect(mockSynchronizeLiveCoreFinance).toHaveBeenCalledTimes(1);
    expect(hydrate).not.toHaveBeenCalled();
    hydrate.mockRestore();
  });

  it('serializes live restores and rejects a stale session result', async () => {
    process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
    let releaseFirst: (() => void) | undefined;
    mockLiveClerkSessionKey = 'sess_old';
    mockRestoreAppShellSession
      .mockImplementationOnce(async (_service, isCurrent) => {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        if ((isCurrent as () => boolean)())
          useAppShellStore.setState({ pendingDestination: '/stale' });
      })
      .mockImplementationOnce(async (_service, isCurrent) => {
        if ((isCurrent as () => boolean)())
          useAppShellStore.setState({ pendingDestination: '/current' });
      });

    const view = render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );
    await act(async () => Promise.resolve());

    mockLiveClerkSessionKey = 'sess_current';
    view.rerender(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );
    expect(mockRestoreAppShellSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirst?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRestoreAppShellSession).toHaveBeenCalledTimes(2);
    expect(useAppShellStore.getState().pendingDestination).toBe('/current');
  });

  it('forwards app state changes and preserves locale preferences', async () => {
    let listener: ((state: string) => void) | null = null;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, callback) => {
        listener = callback as (state: string) => void;
        return { remove: jest.fn() };
      });
    useAppShellStore.setState({ hydrated: true });
    const onAppStateChange = jest.fn();

    render(
      <AppShellProvider onAppStateChange={onAppStateChange}>
        <ProtectedContent />
      </AppShellProvider>
    );
    const emitAppState = listener as ((state: string) => void) | null;
    emitAppState?.('background');

    expect(onAppStateChange).toHaveBeenCalledWith('background');
    expect(usePreferenceStore.getState()).toMatchObject({
      locale: 'en',
      direction: 'ltr'
    });
  });

  it('retries live core-finance sync when an authenticated app becomes active', async () => {
    process.env.EXPO_PUBLIC_CLIENT_MODE = 'live';
    mockLiveClerkSessionKey = 'sess_live_123';
    let listener: ((state: string) => void) | null = null;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, callback) => {
        listener = callback as (state: string) => void;
        return { remove: jest.fn() };
      });

    render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    mockSynchronizeLiveCoreFinance.mockClear();
    const emitAppState = listener as ((state: string) => void) | null;
    emitAppState?.('active');

    expect(mockSynchronizeLiveCoreFinance).toHaveBeenCalledTimes(1);
  });

  it('retains only a safe initial deep-link destination across authentication gates', async () => {
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('masarifi://reports');
    useAppShellStore.setState({ hydrated: true });

    render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppShellStore.getState().pendingDestination).toBe(
      '/(tabs)/reports'
    );
  });

  it('opens a safe runtime deep link through the current access gate', async () => {
    let linkListener: ((event: { url: string }) => void) | null = null;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((_type, listener) => {
        linkListener = listener;
        return { remove: jest.fn() } as never;
      });
    useAppShellStore.setState({
      hydrated: true,
      session: {
        status: 'authenticated',
        userId: 'user-1',
        method: 'google',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        restoration: 'restored'
      },
      onboarding: null,
      privacyLock: null
    });

    render(
      <AppShellProvider>
        <ProtectedContent />
      </AppShellProvider>
    );
    await act(async () => {
      linkListener?.({ url: 'masarifi://tracking' });
      await Promise.resolve();
    });

    expect(router.replace).toHaveBeenCalledWith('/tracking');
  });
});

function ProtectedContent() {
  return <Text>protected child</Text>;
}
