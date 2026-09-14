import React from 'react';
import { router } from 'expo-router';

import { FirstLaunchOnboardingScreen } from '@/features/onboarding/FirstLaunchOnboardingScreen';
import { firstLaunchDestination } from '@/features/onboarding/first-launch-navigation';
import { usePreferenceStore } from '@/state/preferences';

export default function WelcomeRoute() {
  const complete = usePreferenceStore(
    (state) => state.completeFirstLaunchOnboarding
  );

  return (
    <FirstLaunchOnboardingScreen
      onStart={async () => {
        await complete();
        router.replace(firstLaunchDestination);
      }}
    />
  );
}
