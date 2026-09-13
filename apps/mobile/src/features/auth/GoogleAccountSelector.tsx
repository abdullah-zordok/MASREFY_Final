import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { mapAppShellError } from '@/features/shell/app-shell-errors';
import { translate } from '@/localization/i18n';
import type { MessageKey } from '@/localization/messages/en';
import type {
  AuthResult,
  ReverificationInput
} from '@/services/contracts/app-shell-service';

interface GoogleAccountSelectorProps {
  signIn: () => Promise<AuthResult>;
  reverify?: (input: ReverificationInput) => Promise<AuthResult>;
  onResult: (result: AuthResult) => void;
}

export function GoogleAccountSelector({
  signIn,
  reverify,
  onResult
}: GoogleAccountSelectorProps) {
  const [pending, setPending] = useState(false);
  const [messageKey, setMessageKey] = useState<MessageKey | null>(null);
  const [conflict, setConflict] = useState<
    Extract<AuthResult, { status: 'conflict' }> | null
  >(null);

  async function submit() {
    if (pending) return;
    setPending(true);
    const result = await signIn();
    setPending(false);

    if (result.status === 'authenticated') {
      onResult(result);
      return;
    }
    if (result.status === 'cancelled') {
      setMessageKey('appShell.auth.google.cancelled');
      return;
    }
    if (result.status === 'conflict') {
      setConflict(result);
      setMessageKey('appShell.auth.conflict.title');
      return;
    }
    setMessageKey(mapAppShellError(new Error(result.errorCode)).code as MessageKey);
  }

  async function confirmConflict() {
    if (!conflict || !reverify || pending) return;
    setPending(true);
    const result = await reverify({
      conflictId: conflict.conflictId,
      method: conflict.existingMethod,
      verificationToken: 'mock-reverified'
    });
    setPending(false);
    if (result.status === 'authenticated') {
      setConflict(null);
      onResult(result);
      return;
    }
    setMessageKey('appShell.auth.conflict.body');
  }

  return (
    <View style={styles.stack}>
      {messageKey ? <StyledText>{translate(messageKey)}</StyledText> : null}
      <ActionButton
        label={translate('appShell.auth.google.choose')}
        loading={pending}
        onPress={submit}
      />
      {conflict && reverify ? (
        <ActionButton
          label={translate('appShell.auth.conflict.reverify')}
          loading={pending}
          onPress={confirmConflict}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
