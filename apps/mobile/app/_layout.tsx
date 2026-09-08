/**
 * Root layout. Wraps every route in the foundation providers.
 */

import React, { useCallback } from 'react';
import { Stack, usePathname } from 'expo-router';

import { FontGate } from '@/design-system/typography';
import { AppPrivacyGate } from '@/features/security/AppPrivacyGate';
import { AppShellProvider } from '@/state/AppShellProvider';
import { FoundationProviders } from '@/state/FoundationProviders';
import { useAppShellStore } from '@/state/app-shell';
import {
  NotificationResponseRuntime,
  ProtectedRouteGate
} from '@/features/shell/ProtectedRouteGate';
import { useTheme } from '@/state/theme-context';
import { MobileIdentityProvider } from '@/services/live/clerk-provider';

export default function RootLayout() {
  const pathname = usePathname();
  const autoLockDuration = useAppShellStore(
    (state) => state.privacyLock?.autoLockDuration
  );
  const lockNow = useAppShellStore((state) => state.lockNow);
  const appLockStatus = useAppShellStore(
    (state) => state.privacyLock?.appLockStatus
  );
  const lockAfterMs =
    autoLockDuration === 'one_minute'
      ? 60_000
      : autoLockDuration === 'five_minutes'
        ? 300_000
        : autoLockDuration === 'fifteen_minutes'
          ? 900_000
          : null;
  const handleLock = useCallback(() => {
    void lockNow();
  }, [lockNow]);

  return (
    <MobileIdentityProvider>
      <FontGate>
        <FoundationProviders>
          <AppShellProvider>
            <AppPrivacyGate
              immediate={autoLockDuration === 'immediate'}
              lockAfterMs={lockAfterMs}
              locked={
                appLockStatus !== undefined &&
                appLockStatus !== 'unlocked' &&
                pathname !== '/security/unlock' &&
                pathname !== '/security/pin/forgot'
              }
              onLock={handleLock}
            >
              <NotificationResponseRuntime />
              <ProtectedRouteGate>
                <RootStack />
              </ProtectedRouteGate>
            </AppPrivacyGate>
          </AppShellProvider>
        </FoundationProviders>
      </FontGate>
    </MobileIdentityProvider>
  );
}

function RootStack() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: theme.colors.surfaces.page },
        headerShown: false
      }}
    />
  );
}
