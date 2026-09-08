import React, { useEffect, useRef, type ReactNode } from 'react';
import { router } from 'expo-router';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { parseDeepLinkDestination } from '@/features/shell/deep-link-controller';
import { resolveEntryRoute } from '@/features/shell/resolve-entry-route';
import { useAppShellStore } from '@/state/app-shell';
import { resolveClientMode } from '@/config/client-runtime';
import { authService } from '@/features/auth/auth-flow';
import { restoreAppShellSession } from '@/features/auth/session-controller';
import { useLiveClerkSessionKey } from '@/services/live/clerk-provider';
import { synchronizeLiveCoreFinance } from '@/services/live/core-finance-service';

interface AppShellProviderProps {
  children: ReactNode;
  onAppStateChange?: (state: AppStateStatus) => void;
}

/**
 * AppShellProvider always renders its children so the Expo Router navigator
 * mounts on the first render. The hydration/loading gate is owned by the
 * entry route (`app/index.tsx`), which stays on a loading StateView until the
 * shell is hydrated — blocking navigation to protected destinations without
 * unmounting the Stack. Returning a plain View instead of children before
 * hydration caused "Attempted to navigate before mounting the Root Layout"
 * at runtime.
 */
export function AppShellProvider({
  children,
  onAppStateChange
}: AppShellProviderProps) {
  const hydrated = useAppShellStore((state) => state.hydrated);
  const hydrate = useAppShellStore((state) => state.hydrate);
  const setPendingDestination = useAppShellStore(
    (state) => state.setPendingDestination
  );
  const liveClerkSessionKey = useLiveClerkSessionKey();
  const restoredLiveSession = useRef<string | null | undefined>(undefined);
  const restoreQueue = useRef(Promise.resolve());

  useEffect(() => {
    let current = true;
    if (resolveClientMode() !== 'live') {
      if (!hydrated) void hydrate();
      return () => {
        current = false;
      };
    }
    if (
      liveClerkSessionKey === undefined ||
      restoredLiveSession.current === liveClerkSessionKey
    )
      return () => {
        current = false;
      };
    restoredLiveSession.current = liveClerkSessionKey;
    restoreQueue.current = restoreQueue.current
      .catch(() => undefined)
      .then(() =>
        current ? restoreAppShellSession(authService, () => current) : undefined
      )
      .then(() => {
        if (current && liveClerkSessionKey)
          void synchronizeLiveCoreFinance().catch(() => undefined);
      })
      .catch(() =>
        current ? useAppShellStore.getState().signOut() : undefined
      );
    return () => {
      current = false;
    };
  }, [hydrate, hydrated, liveClerkSessionKey]);

  useEffect(() => {
    async function retainSafeDestination(url: string | null, navigate = false) {
      if (!url) return;
      const destination = parseDeepLinkDestination(url);
      if (!destination) return;
      await setPendingDestination(destination);
      if (!navigate) return;
      const { hydrated, session, onboarding, privacyLock } =
        useAppShellStore.getState();
      router.replace(
        resolveEntryRoute({
          hydrated,
          session,
          onboarding,
          pendingDestination: destination,
          privacyLock
        })
      );
    }

    void Linking.getInitialURL()
      .then((url) => retainSafeDestination(url))
      .catch(() => undefined);
    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      void retainSafeDestination(url, true);
    });
    return () => linkSubscription?.remove?.();
  }, [setPendingDestination]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      onAppStateChange?.(state);
      if (
        state === 'active' &&
        resolveClientMode() === 'live' &&
        liveClerkSessionKey
      )
        void synchronizeLiveCoreFinance().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [liveClerkSessionKey, onAppStateChange]);

  return <>{children}</>;
}
