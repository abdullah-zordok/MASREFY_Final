import React from 'react';
import { router } from 'expo-router';

import { GoogleAccountSelector } from '@/features/auth/GoogleAccountSelector';
import { StateView } from '@/design-system/components/feedback/StateView';
import { authService } from '@/features/auth/auth-flow';
import { StyledText } from '@/components/StyledText';
import { translate } from '@/localization/i18n';
import { useAppShellStore } from '@/state/app-shell';

export default function ForgotPinRoute() {
  const resetPrivacyLock = useAppShellStore((state) => state.resetPrivacyLock);
  if (authService.metadata.availability === 'unavailable') {
    return (
      <StateView
        message={translate('appShell.auth.unavailable')}
        state="disabled"
        title={translate('appShell.state.disabled')}
      />
    );
  }
  return (
    <>
      <StyledText variant="title">
        {translate('appShell.security.pin.forgot')}
      </StyledText>
      <StyledText>{translate('appShell.security.reauthenticate')}</StyledText>
      <GoogleAccountSelector
        onResult={async (result) => {
          if (result.status !== 'authenticated') return;
          await resetPrivacyLock();
          router.replace('/security/pin/create');
        }}
        signIn={authService.signInWithGoogle}
      />
    </>
  );
}
