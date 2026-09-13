import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import { resolveDeepLinkEntry } from './deep-link-controller';
import {
  androidOnboarding,
  authenticatedSession,
  expiredSession,
  lockedPrivacy,
  signedOutSession
} from '@/test-utils/app-shell-fixtures';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';

const mockRouterPush = jest.fn();
const mockStack = jest.fn(() => null);
const mockRegisterCategories = jest.fn();
const mockGetLastResponse = jest.fn();
const mockSubscribeToResponses = jest.fn();
const mockResolveTarget = jest.fn();
const mockRevalidateAction = jest.fn();
const mockExecuteAction = jest.fn();
const mockRedirect = jest.fn(({ href }: { href: string }) => href);
let mockPathname = '/home';
const mockPrivacyGate = jest.fn(
  ({ children }: { children: React.ReactNode }) => <>{children}</>
);

jest.mock('expo-router', () => ({
  Stack: () => mockStack(),
  Redirect: (props: { href: string }) => mockRedirect(props),
  router: { push: mockRouterPush },
  usePathname: () => mockPathname
}));

jest.mock('@/design-system/typography', () => ({
  FontGate: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

jest.mock('@/state/FoundationProviders', () => ({
  FoundationProviders: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
}));

jest.mock('@/state/AppShellProvider', () => ({
  AppShellProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
}));

jest.mock('@/features/security/AppPrivacyGate', () => ({
  AppPrivacyGate: (props: { children: React.ReactNode; locked?: boolean }) =>
    mockPrivacyGate(props)
}));

jest.mock('@/services/platform/phone-notification-service', () => ({
  phoneNotificationService: {
    registerCategories: mockRegisterCategories,
    getLastResponse: mockGetLastResponse,
    subscribeToResponses: mockSubscribeToResponses
  }
}));

jest.mock('@/services/mocks/assistant-notifications-service', () => ({
  assistantNotificationsService: {
    resolveTarget: mockResolveTarget,
    revalidateAction: mockRevalidateAction,
    executeAction: mockExecuteAction
  }
}));

describe('protected navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/home';
    useAppShellStore.getState().reset();
    useAppShellStore.setState({
      hydrated: true,
      session: authenticatedSession,
      profileSetupStatus: 'complete',
      onboarding: null,
      privacyLock: null,
      unlock: jest.fn(async () => undefined),
      setPendingDestination: jest.fn(async () => undefined)
    });
    usePreferenceStore.setState({
      firstLaunchOnboardingCompleted: true,
      hydrated: true
    });
    mockRegisterCategories.mockResolvedValue(undefined);
    mockGetLastResponse.mockResolvedValue(null);
    mockSubscribeToResponses.mockReturnValue(jest.fn());
    mockResolveTarget.mockResolvedValue({
      status: 'exact',
      target: { kind: 'transaction', transactionId: 'tx-1' }
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'view'
    });
    mockExecuteAction.mockResolvedValue({
      value: {
        id: 'notification-1',
        target: { kind: 'transaction', transactionId: 'tx-1' }
      },
      affectedScopes: []
    });
  });

  it('routes a signed-out protected root to the Clerk placeholder', () => {
    useAppShellStore.setState({ session: signedOutSession, privacyLock: null });

    render(<RootLayout />);

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/(public)/auth-pending'
    });
  });

  it('redirects protected routes to first-launch onboarding when incomplete', () => {
    usePreferenceStore.setState({ firstLaunchOnboardingCompleted: false });
    useAppShellStore.setState({ session: signedOutSession });

    render(<RootLayout />);

    expect(mockRedirect).toHaveBeenCalledWith({ href: '/welcome' });
  });

  it('keeps tracking onboarding behind authentication', () => {
    mockPathname = '/tracking-intro';
    useAppShellStore.setState({ session: signedOutSession });

    render(<RootLayout />);

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/(public)/auth-pending'
    });
  });

  it('renders the selected Clerk placeholder without redirecting to itself', () => {
    mockPathname = '/auth-pending';
    useAppShellStore.setState({ session: signedOutSession });

    render(<RootLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('moves from the Clerk placeholder to profile setup without saving it as a return route', () => {
    mockPathname = '/auth-pending';
    useAppShellStore.setState({
      profileSetupStatus: 'incomplete',
      setPendingDestination: jest.fn(async (pendingDestination) => {
        useAppShellStore.setState({ pendingDestination });
      })
    });

    render(<RootLayout />);

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/(onboarding)/profile-setup'
    });
    expect(useAppShellStore.getState().pendingDestination).toBeNull();
  });

  it('redirects a stale unlock route home when no lock is active', async () => {
    mockPathname = '/security/unlock';

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRedirect).toHaveBeenCalledWith({ href: '/(tabs)/home' })
    );
  });

  it('renders the current onboarding step without redirecting to itself', () => {
    mockPathname = '/android-sms-permission';
    useAppShellStore.setState({ onboarding: androidOnboarding });

    render(<RootLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('keeps protected destinations behind authentication', () => {
    mockPathname = '/accounts/account-1/edit';
    useAppShellStore.setState({ session: signedOutSession });

    render(<RootLayout />);

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/(public)/auth-pending'
    });
  });

  it('renders profile setup only when the server marks it incomplete', () => {
    mockPathname = '/profile-setup';
    useAppShellStore.setState({ profileSetupStatus: 'incomplete' });

    render(<RootLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('keeps the profile currency picker reachable while profile setup is incomplete', () => {
    mockPathname = '/settings/currency';
    useAppShellStore.setState({ profileSetupStatus: 'incomplete' });

    render(<RootLayout />);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('passes the persisted lock state to the app privacy mask', () => {
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'locked' }
    });

    render(<RootLayout />);

    expect(mockPrivacyGate).toHaveBeenCalledWith(
      expect.objectContaining({ locked: true })
    );
  });

  it('resolves signed-out, locked, onboarding, valid, invalid, and unavailable targets', () => {
    const base = {
      hydrated: true,
      firstLaunchOnboardingCompleted: true,
      profileSetupStatus: 'complete' as const,
      session: authenticatedSession,
      privacyLock: null,
      onboarding: null
    };

    expect(
      resolveDeepLinkEntry('masarifi://reports', { ...base, session: null })
    ).toBe('/(public)/auth-pending');
    expect(
      resolveDeepLinkEntry('masarifi://reports', {
        ...base,
        privacyLock: lockedPrivacy
      })
    ).toBe('/security/unlock');
    expect(
      resolveDeepLinkEntry('masarifi://reports', {
        ...base,
        onboarding: androidOnboarding
      })
    ).toBe('/(tabs)/reports');
    expect(resolveDeepLinkEntry('masarifi://reports', base)).toBe(
      '/(tabs)/reports'
    );
    expect(resolveDeepLinkEntry('masarifi://tracking', base)).toBe('/tracking');
    expect(resolveDeepLinkEntry('masarifi://otp?code=123456', base)).toBe(
      '/(tabs)/home'
    );
    expect(resolveDeepLinkEntry('not a url', base)).toBe('/(tabs)/home');
  });

  it('registers notification categories once, handles cold and live responses, and cleans up', async () => {
    let live:
      | ((response: {
          notificationId: string;
          action: 'view' | 'edit' | 'undo';
        }) => void)
      | null = null;
    const remove = jest.fn();
    mockRegisterCategories.mockRejectedValueOnce(
      new Error('permission denied')
    );
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'cold',
      action: 'view'
    });
    mockSubscribeToResponses.mockImplementationOnce((listener) => {
      live = listener;
      return remove;
    });

    const rendered = render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/transactions/tx-1')
    );
    expect(mockRegisterCategories).toHaveBeenCalledTimes(1);
    expect(mockStack).toHaveBeenCalled();

    await act(async () => {
      live?.({ notificationId: 'live', action: 'edit' });
    });
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/transactions/tx-1/edit')
    );

    rendered.rerender(<RootLayout />);
    expect(mockRegisterCategories).toHaveBeenCalledTimes(1);
    rendered.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('continues protected undo responses only when the app is already unlocked', async () => {
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'undoable',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockExecuteAction).toHaveBeenCalledWith(
        'undoable',
        'undo',
        'notification-response-undoable-undo'
      )
    );
  });

  it('does not execute protected responses while signed out without a privacy lock', async () => {
    useAppShellStore.setState({ session: signedOutSession, privacyLock: null });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'signed-out-undo',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/notifications')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('does not execute protected responses after session expiry', async () => {
    useAppShellStore.setState({ session: expiredSession, privacyLock: null });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'expired-session-undo',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/notifications')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('does not execute protected responses while temporarily locked', async () => {
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'temporarily_locked' },
      setPendingDestination: jest.fn(async () => undefined)
    });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'temporarily-locked-undo',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/security/unlock')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('resumes locked protected responses only after verified unlock state', async () => {
    const unlock = jest.fn(async () => undefined);
    const setPendingDestination = jest.fn(async () => undefined);
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'locked' },
      unlock,
      setPendingDestination
    });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'locked-undo',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/security/unlock')
    );
    expect(setPendingDestination).toHaveBeenCalledWith('/notifications');
    expect(unlock).not.toHaveBeenCalled();
    expect(mockExecuteAction).not.toHaveBeenCalled();

    await act(async () => {
      useAppShellStore.setState({
        privacyLock: { ...lockedPrivacy, appLockStatus: 'unlocked' }
      });
    });
    await waitFor(() =>
      expect(mockExecuteAction).toHaveBeenCalledWith(
        'locked-undo',
        'undo',
        'notification-response-locked-undo-undo'
      )
    );
  });

  it('does not treat reset or sign-out lock removal as verified unlock', async () => {
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'locked' },
      setPendingDestination: jest.fn(async () => undefined)
    });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'reset-undo',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/security/unlock')
    );
    await act(async () => {
      useAppShellStore.setState({ privacyLock: null });
    });
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/notifications')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });

  it('resumes multiple distinct locked responses after one verified unlock', async () => {
    let live:
      ((response: { notificationId: string; action: 'undo' }) => void) | null =
      null;
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'locked' },
      setPendingDestination: jest.fn(async () => undefined)
    });
    mockSubscribeToResponses.mockImplementationOnce((listener) => {
      live = listener;
      return jest.fn();
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);
    await act(async () => {
      live?.({ notificationId: 'locked-a', action: 'undo' });
      live?.({ notificationId: 'locked-b', action: 'undo' });
    });

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/security/unlock')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();

    await act(async () => {
      useAppShellStore.setState({
        privacyLock: { ...lockedPrivacy, appLockStatus: 'unlocked' }
      });
    });

    await waitFor(() =>
      expect(mockExecuteAction).toHaveBeenCalledWith(
        'locked-a',
        'undo',
        'notification-response-locked-a-undo'
      )
    );
    expect(mockExecuteAction).toHaveBeenCalledWith(
      'locked-b',
      'undo',
      'notification-response-locked-b-undo'
    );
  });

  it('registers unlock waiters before the pending-destination write completes', async () => {
    let releasePendingDestination: (() => void) | null = null;
    const setPendingDestination = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releasePendingDestination = resolve;
        })
    );
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'locked' },
      setPendingDestination
    });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'slow-write',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/security/unlock')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();

    await act(async () => {
      useAppShellStore.setState({
        privacyLock: { ...lockedPrivacy, appLockStatus: 'unlocked' }
      });
    });

    await waitFor(() =>
      expect(mockExecuteAction).toHaveBeenCalledWith(
        'slow-write',
        'undo',
        'notification-response-slow-write-undo'
      )
    );
    await act(async () => {
      releasePendingDestination?.();
    });
  });

  it('cancels a waiting protected response if the session expires before unlock completes', async () => {
    useAppShellStore.setState({
      privacyLock: { ...lockedPrivacy, appLockStatus: 'locked' },
      setPendingDestination: jest.fn(async () => undefined)
    });
    mockGetLastResponse.mockResolvedValueOnce({
      notificationId: 'expires-while-waiting',
      action: 'undo'
    });
    mockRevalidateAction.mockResolvedValue({
      status: 'available',
      target: { kind: 'transaction', transactionId: 'tx-1' },
      action: 'undo'
    });

    render(<RootLayout />);
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/security/unlock')
    );

    await act(async () => {
      useAppShellStore.setState({
        session: expiredSession,
        privacyLock: { ...lockedPrivacy, appLockStatus: 'unlocked' }
      });
    });

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/notifications')
    );
    expect(mockExecuteAction).not.toHaveBeenCalled();
  });
});

function RootLayout() {
  const Component = require('@app/_layout').default;
  return <Component />;
}
