import React from 'react';
import { router } from 'expo-router';

import { UnlockScreen } from '@/features/security/UnlockScreen';
import { createBiometricService } from '@/services/platform/biometric-service';
import { resolveEntryRoute } from '@/features/shell/resolve-entry-route';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';

export default function UnlockRoute() {
  const session = useAppShellStore((state) => state.session);
  const privacyLock = useAppShellStore((state) => state.privacyLock);
  const pinCredential = useAppShellStore((state) => state.pinCredential);
  const recordFailedUnlock = useAppShellStore((state) => state.recordFailedUnlock);
  const unlock = useAppShellStore((state) => state.unlock);
  const configurePrivacyLock = useAppShellStore(
    (state) => state.configurePrivacyLock
  );
  const firstLaunchOnboardingCompleted = usePreferenceStore(
    (state) => state.firstLaunchOnboardingCompleted
  );
  return (
    <UnlockScreen
      biometricEnabled={privacyLock?.biometricStatus === 'enabled'}
      biometricService={createBiometricService()}
      expectedHash={pinCredential ?? ''}
      lockedUntil={privacyLock?.lockedUntil}
      onForgotPin={() => router.push('/security/pin/forgot')}
      onInvalidPin={() => void recordFailedUnlock(Date.now())}
      onCredentialUpgrade={(hash) => configurePrivacyLock(hash)}
      onUnlock={async () => {
        await unlock();
        router.replace(
          resolveEntryRoute({
            ...useAppShellStore.getState(),
            firstLaunchOnboardingCompleted
          })
        );
      }}
      sessionExpired={
        session?.status !== 'authenticated' ||
        session.expiresAt === null ||
        session.expiresAt <= Date.now()
      }
    />
  );
}
