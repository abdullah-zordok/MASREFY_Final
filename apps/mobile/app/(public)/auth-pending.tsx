import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveClientMode } from '@/config/client-runtime';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { translate } from '@/localization/i18n';
import type { SettingsService } from '@/services/contracts/assistant-notifications-service';
import { settingsService } from '@/services/mocks/subscription-settings-service';
import { useAppShellStore } from '@/state/app-shell';

// REMOVE_WITH_CLERK_UI: Delete this temporary route when the real Clerk sign-in/sign-up UI is connected.
export default function AuthPendingRoute() {
  return (
    <AuthPendingScreen
      previewEnabled={resolveClientMode() !== 'live'}
      previewService={settingsService}
    />
  );
}

export function AuthPendingScreen({
  previewEnabled,
  previewService
}: {
  previewEnabled: boolean;
  previewService: Pick<SettingsService, 'getProfileSetup'>;
}) {
  const [loading, setLoading] = useState(false);
  const setProfileSetup = useAppShellStore((state) => state.setProfileSetup);

  async function openProfileSetupPreview() {
    if (loading) return;
    setLoading(true);
    const snapshot = await previewService.getProfileSetup();
    setProfileSetup('incomplete', {
      ...snapshot,
      complete: false,
      onboarding: {
        ...snapshot.onboarding,
        step: 'welcome',
        completedAt: null,
        completedSteps: snapshot.onboarding.completedSteps.filter(
          (step) => step !== 'welcome'
        )
      }
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <StateView
          state="disabled"
          title={translate('appShell.auth.pending.title')}
          message={translate('appShell.auth.pending.message')}
        />
        {previewEnabled ? (
          <ActionButton
            label={translate('appShell.auth.pending.preview')}
            loading={loading}
            onPress={() => void openProfileSetupPreview()}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flex: 1, gap: 24, justifyContent: 'center', paddingHorizontal: 24 }
});
