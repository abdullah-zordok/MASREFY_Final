import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SwitchRow } from '@/design-system/components/forms/SelectionControls';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import { spacing } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import type { PrivacyLockPreference } from '@/domain/app-shell';
import type { BiometricAvailability } from '@/services/contracts/app-shell-service';
import { createBiometricService } from '@/services/platform/biometric-service';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { usePrivacyRequest } from '@/features/settings/settings-queries';

export default function SecuritySettingsRoute() {
  const service = useMemo(createBiometricService, []);
  const [availability, setAvailability] = useState<BiometricAvailability | null>(
    null
  );
  const privacyLock = useAppShellStore((state) => state.privacyLock);
  const setPrivacyLock = useAppShellStore((state) => state.setPrivacyLock);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const toggleHideBalances = usePreferenceStore(
    (state) => state.toggleHideBalances
  );
  const deletionRequest = usePrivacyRequest();

  useEffect(() => {
    void service.getAvailability().then((result) => setAvailability(result));
  }, [service]);

  async function updateLock(update: Partial<PrivacyLockPreference>) {
    if (!privacyLock) return;
    await setPrivacyLock({ ...privacyLock, ...update });
  }

  function confirmAccountDeletion() {
    Alert.alert(
      translate('appShell.security.deleteAccount'),
      translate('appShell.security.deleteAccount.confirmation'),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: translate('settings.privacy.confirmRequest'),
          style: 'destructive',
          onPress: () =>
            deletionRequest.mutate({
              kind: 'account_deletion',
              operationId: `security-account-deletion-${Date.now()}`
            })
        }
      ]
    );
  }

  const biometricKinds =
    availability?.status === 'supported' ? (availability.kinds ?? []) : [];
  const biometricReady =
    privacyLock !== null &&
    availability?.status === 'supported' &&
    biometricKinds.length > 0;
  const prefersFace = biometricKinds.includes('face');
  const biometricBlockedKey = !privacyLock
    ? ('appShell.security.biometric.requiresPin' as const)
    : availability === null
      ? undefined
      : availability.status === 'not_enrolled'
        ? ('appShell.security.biometric.notEnrolled' as const)
        : availability.status !== 'supported' || biometricKinds.length === 0
          ? ('appShell.security.biometricUnavailable' as const)
          : undefined;

  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <StyledText variant="title">
        {translate('appShell.security.settingsTitle')}
      </StyledText>

      <GroupedList label={translate('appShell.security.sections.appLock')}>
        <NavigationRow
          label={translate(
            privacyLock
              ? 'appShell.security.pin.change'
              : 'appShell.security.pin.create'
          )}
          onPress={() =>
            router.push(
              privacyLock ? '/security/pin/change' : '/security/pin/create'
            )
          }
        />
        {privacyLock ? (
          <NavigationRow
            label={translate('appShell.security.forgotPin')}
            onPress={() => router.push('/security/pin/forgot')}
          />
        ) : null}
        <View style={styles.insetRow}>
          <SwitchRow
            disabled={!biometricReady}
            icon={prefersFace ? 'faceId' : 'fingerprint'}
            label={
              prefersFace
                ? 'appShell.security.biometric.face'
                : 'appShell.security.biometric.fingerprint'
            }
            subtext={
              biometricBlockedKey ?? 'appShell.security.biometric.subtitle'
            }
            value={privacyLock?.biometricStatus === 'enabled'}
            onValueChange={(next) =>
              void updateLock({
                biometricStatus: next ? 'enabled' : 'disabled'
              })
            }
          />
        </View>
      </GroupedList>

      <GroupedList label={translate('appShell.security.sections.privacy')}>
        <View style={styles.insetRow}>
          <SwitchRow
            icon="eyeSlash"
            label="appShell.security.hideBalances"
            value={hideBalances}
            onValueChange={toggleHideBalances}
          />
        </View>
      </GroupedList>

      <GroupedList label={translate('appShell.security.settingsTitle')}>
        <NavigationRow
          label={translate('appShell.security.sessions')}
          onPress={() => router.push('/security/sessions')}
        />
      </GroupedList>

      <ActionButton
        label={translate('appShell.security.deleteAccount')}
        loading={deletionRequest.isPending}
        onPress={confirmAccountDeletion}
        variant="destructive"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
    padding: 16
  },
  insetRow: {
    paddingHorizontal: spacing.lg
  }
});
