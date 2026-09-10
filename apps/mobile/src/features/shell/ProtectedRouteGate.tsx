import React, { type ReactNode, useEffect, useRef } from 'react';
import { Redirect, router, usePathname } from 'expo-router';

import { resolveProtectedAccessGate } from './resolve-entry-route';
import { useAppShellStore } from '@/state/app-shell';
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
  const setPendingDestination = useAppShellStore(
    (state) => state.setPendingDestination
  );
  const gate = resolveProtectedAccessGate({
    hydrated,
    session,
    onboarding,
    pendingDestination,
    privacyLock
  });
  const destination = pathnameDestination(pathname);
  const unprotected = isUnprotectedRoute(pathname);

  useEffect(() => {
    if (unprotected) return;
    if (
      gate &&
      destination &&
      gate !== destination &&
      pendingDestination !== destination
    ) {
      void setPendingDestination(destination);
      return;
    }
    if (!gate && destination === pendingDestination) {
      void setPendingDestination(null);
    }
  }, [destination, gate, pendingDestination, setPendingDestination, unprotected]);

  if (
    unprotected &&
    (pathname !== '/security/unlock' || gate === '/(public)/language')
  )
    return <>{children}</>;

  const isLockRecovery =
    gate === '/security/unlock' &&
    (pathname === '/security/unlock' || pathname === '/security/pin/forgot');
  if (gate && gate !== destination && !isLockRecovery) {
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
        void state.setPendingDestination('/notifications').catch(() => undefined);
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

export function isUnprotectedRoute(pathname: string): boolean {
  return unprotectedRoutes.has(pathname);
}

const unprotectedRoutes = new Set([
  '/',
  '/index',
  '/language',
  '/welcome',
  '/sign-in',
  '/sign-up',
  '/phone',
  '/otp',
  '/google',
  '/legal',
  '/security/unlock',
  '/security/pin/forgot'
]);

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
    '/complete': '/(onboarding)/complete'
  };
  return routes[pathname] ?? pathname;
}
