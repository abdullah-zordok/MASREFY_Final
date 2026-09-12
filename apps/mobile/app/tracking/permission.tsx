import React, { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import type { PermissionState } from '@/domain/app-shell';
import type { TrackingMode } from '@/domain/automatic-tracking';
import { PermissionEducation } from '@/features/onboarding/PermissionEducation';
import { translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import { createTrackingPermissionService } from '@/services/platform/tracking-permission-service';

export default function TrackingPermissionRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const selectedMode: TrackingMode =
    mode === 'review_all' ? 'review_all' : 'automatic_clear';
  const service = useMemo(createTrackingPermissionService, []);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [failed, setFailed] = useState(false);
  const requiresSettings = permission?.recoveryAction === 'open_settings';

  useEffect(() => {
    const refresh = () =>
      void service
        .getState()
        .then(setPermission)
        .catch(() => setFailed(true));
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [service]);

  async function enable() {
    setFailed(false);
    try {
      const result =
        permission?.status === 'granted'
          ? permission
          : await service.requestAfterEducation();
      setPermission(result);
      if (result.status !== 'granted') return;
      await automaticTrackingService.setMode(selectedMode);
      router.replace('/tracking');
    } catch {
      setFailed(true);
    }
  }

  async function openSettings() {
    setFailed(false);
    try {
      await service.openSettings();
    } catch {
      setFailed(true);
    }
  }

  return (
    <>
      <PermissionEducation
        onEnable={requiresSettings ? openSettings : enable}
        onSkip={() => router.replace('/tracking')}
        primaryLabel={
          requiresSettings
            ? translate('appShell.permission.openSettings')
            : permission?.status === 'granted'
              ? translate('appShell.onboarding.continue')
              : permission?.status === 'denied'
                ? translate('appShell.permission.retry')
                : undefined
        }
      />
      {permission ? (
        <StyledText accessibilityRole="alert">
          {translate(
            `appShell.permission.status.${statusKey(permission.status)}` as never
          )}
        </StyledText>
      ) : null}
      {failed ? (
        <StyledText accessibilityRole="alert">
          {translate('appShell.error.unknown')}
        </StyledText>
      ) : null}
    </>
  );
}

function statusKey(status: string) {
  return status.replace(/_([a-z])/g, (_match, letter: string) =>
    letter.toUpperCase()
  );
}
