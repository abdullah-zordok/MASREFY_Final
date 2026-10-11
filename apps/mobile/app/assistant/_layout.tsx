import React from 'react';
import { Stack } from 'expo-router';

import { ProtectedRouteGate } from '@/features/shell/ProtectedRouteGate';
import { assistantService } from '@/services/assistant-service';
import { BackendUnavailableState } from '@/features/shell/BackendUnavailableState';
import { translate } from '@/localization/i18n';

export default function AssistantLayout() {
  if (assistantService.metadata.availability !== 'available')
    return <BackendUnavailableState title={translate('assistant.backendUnavailable')} />;
  return (
    <ProtectedRouteGate>
      <Stack screenOptions={{ headerShown: false }} />
    </ProtectedRouteGate>
  );
}
