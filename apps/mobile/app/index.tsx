import React from 'react';
import { Redirect } from 'expo-router';

import { StateView } from '@/design-system/components/feedback/StateView';
import { resolveEntryRoute } from '@/features/shell/resolve-entry-route';
import { translate } from '@/localization/i18n';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';

/**
 * Entry route. Uses the mount-safe <Redirect> instead of an imperative
 * router.replace() inside useEffect — imperative navigation from the initial
 * route fires before the Root Layout navigator is committed, which raised
 * "Attempted to navigate before mounting the Root Layout component". The
 * <Redirect> element is evaluated by Expo Router during render, so it never
 * races the navigator mount. While the shell is hydrating, stay on a loading
 * view (destination '/index').
 */
export default function AppEntry() {
  const shellHydrated = useAppShellStore((state) => state.hydrated);
  const preferencesHydrated = usePreferenceStore((state) => state.hydrated);
  const firstLaunchOnboardingCompleted = usePreferenceStore(
    (state) => state.firstLaunchOnboardingCompleted
  );
  const session = useAppShellStore((state) => state.session);
  const onboarding = useAppShellStore((state) => state.onboarding);
  const pendingDestination = useAppShellStore(
    (state) => state.pendingDestination
  );
  const privacyLock = useAppShellStore((state) => state.privacyLock);
  const profileSetupStatus = useAppShellStore(
    (state) => state.profileSetupStatus
  );

  const destination = resolveEntryRoute({
    hydrated: shellHydrated && preferencesHydrated,
    firstLaunchOnboardingCompleted,
    profileSetupStatus,
    session,
    onboarding,
    pendingDestination,
    privacyLock
  });

  if (destination !== '/index') {
    return <Redirect href={destination} />;
  }

  return (
    <StateView state="loading" title={translate('appShell.state.loading')} />
  );
}
