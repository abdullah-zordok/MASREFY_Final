import React, { type ReactNode, useEffect, useRef } from 'react';
import { Redirect, router, usePathname } from 'expo-router';

import { resolveProtectedAccessGate } from './resolve-entry-route';
import { sanitizeReturnRoute } from './navigation-context';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { createNotificationResponseController } from '@/features/notifications/notification-response-controller';
import { notificationService } from '@/services/engagement-service';
import { phoneNotificationService } from '@/services/platform/phone-notification-service';

export function ProtectedRouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useAppShellStore((state) => state.hydrated);
  const session = useAppShellStore((state) => state.session);
  const onboarding = useAppShellStore((state) => state.onboarding);
  const pendingDestination = useAppShellStore(
    (state) => state.pendingDestination
  );
  const privacyLock = useAppShellStore((state) => state.privacyLock);
  const profileSetupStatus = useAppShellStore(
    (state) => state.profileSetupStatus
  );
  const firstLaunchOnboardingCompleted = usePreferenceStore(
    (state) => state.firstLaunchOnboardingCompleted
  );
  const setPendingDestination = useAppShellStore(
    (state) => state.setPendingDestination
  );
  const gate = resolveProtectedAccessGate({
    hydrated,
    firstLaunchOnboardingCompleted,
    profileSetupStatus,
    session,
    onboarding,
    pendingDestination,
    privacyLock
  });
  const destination = pathnameDestination(pathname);
  const returnDestination = sanitizeReturnRoute(destination);
  const legalRoute = pathname === '/legal';

  useEffect(() => {
    if (legalRoute) return;
    if (
      gate &&
      returnDestination &&
      gate !== returnDestination &&
      pendingDestination !== returnDestination
    ) {
      void setPendingDestination(returnDestination);
      return;
    }
    if (!gate && returnDestination === pendingDestination) {
      void setPendingDestination(null);
    }
  }, [
    gate,
    pendingDestination,
    returnDestination,
    setPendingDestination,
    legalRoute
  ]);

  if (legalRoute) return <>{children}</>;

  const isLockRecovery =
    gate === '/security/unlock' &&
    (pathname === '/security/unlock' || pathname === '/security/pin/forgot');
  const isProfileSetupCurrencyPicker =
    gate === '/(onboarding)/profile-setup' && pathname === '/settings/currency';
  if (
    gate &&
    gate !== destination &&
    !isLockRecovery &&
    !isProfileSetupCurrencyPicker
  ) {
    return <Redirect href={gate} />;
  }
  if (!gate && pathname === '/security/unlock') {
    return <Redirect href="/(tabs)/home" />;
  }
  return <>{children}</>;
}

export function NotificationResponseRuntime() {
  const hydrated = useAppShellStore((state) => state.hydrated);
  const session = useAppShellStore((state) => state.session);
  const privacyLock = useAppShellStore((state) => state.privacyLock);
  const pendingUnlocks = useRef(new Set<(unlocked: boolean) => void>());

  useEffect(() => {
    if (!isCurrentAuthenticatedSession({ hydrated, session })) {
      resolvePendingUnlocks(pendingUnlocks.current, false);
    } else if (privacyLock?.appLockStatus === 'unlocked') {
      resolvePendingUnlocks(pendingUnlocks.current, true);
    } else if (privacyLock === null) {
      resolvePendingUnlocks(pendingUnlocks.current, false);
    }
  }, [hydrated, privacyLock, session]);

  useEffect(() => {
    const unlocks = pendingUnlocks.current;
    void phoneNotificationService.registerCategories().catch(() => undefined);
    const controller = createNotificationResponseController({
      notificationService,
      phoneService: phoneNotificationService,
      navigate: (destination) => router.push(destination),
      unlock: async () => {
        const state = useAppShellStore.getState();
        if (!isCurrentAuthenticatedSession(state)) return false;
        if (!state.privacyLock) return true;
        if (state.privacyLock.appLockStatus === 'unlocked') return true;
        const waitForVerifiedUnlock = new Promise<boolean>((resolve) => {
          unlocks.add(resolve);
        });
        void state
          .setPendingDestination('/notifications')
          .catch(() => undefined);
        router.push('/security/unlock');
        return waitForVerifiedUnlock;
      }
    });
    void controller.start();
    return () => {
      resolvePendingUnlocks(unlocks, false);
      controller.stop();
    };
  }, []);

  return null;
}

function isCurrentAuthenticatedSession({
  hydrated,
  session
}: Pick<ReturnType<typeof useAppShellStore.getState>, 'hydrated' | 'session'>) {
  return (
    hydrated &&
    session?.status === 'authenticated' &&
    session.expiresAt !== null &&
    session.expiresAt > Date.now()
  );
}

function resolvePendingUnlocks(
  pending: Set<(unlocked: boolean) => void>,
  unlocked: boolean
) {
  for (const resolve of pending) resolve(unlocked);
  pending.clear();
}

function pathnameDestination(pathname: string): string | null {
  const routes: Record<string, string> = {
    '/home': '/(tabs)/home',
    '/auth-pending': '/(public)/auth-pending',
    '/transactions': '/(tabs)/transactions',
    '/add': '/(tabs)/add',
    '/reports': '/(tabs)/reports',
    '/more': '/(tabs)/more',
    '/accounts': '/accounts',
    '/assistant': '/assistant',
    '/tracking': '/tracking',
    '/profile': '/profile',
    '/security/settings': '/security/settings',
    '/tracking-intro': '/(onboarding)/tracking-intro',
    '/android-sms-permission': '/(onboarding)/android-sms-permission',
    '/tracking-keywords': '/(onboarding)/tracking-keywords',
    '/tracking-preferences': '/(onboarding)/tracking-preferences',
    '/tracking-demo': '/(onboarding)/tracking-demo',
    '/ios-capture-options': '/(onboarding)/ios-capture-options',
    '/ios-automation': '/(onboarding)/ios-automation',
    '/complete': '/(onboarding)/complete',
    '/profile-setup': '/(onboarding)/profile-setup'
  };
  return routes[pathname] ?? pathname;
}
