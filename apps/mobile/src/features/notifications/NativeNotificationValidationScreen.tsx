import React from 'react';
import { ScrollView } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import type { NotificationActionKind } from '@/domain/notifications';
import { phoneNotificationService } from '@/services/platform/phone-notification-service';

export function NativeNotificationValidationScreen() {
  const [status, setStatus] = React.useState('notifications.validation.ready');

  async function present(action: NotificationActionKind, expired = false) {
    setStatus('notifications.validation.presenting');
    const createdAt = Date.now();
    const id = `native-validation-${action}-${expired ? 'expired' : 'active'}-${createdAt}`;
    try {
      await phoneNotificationService.registerCategories();
      const result = await phoneNotificationService.presentLocal({
        notificationId: id,
        title: 'Masarifi validation',
        body: 'Open the requested validation action.',
        categoryId: 'financial-change'
      });
      setStatus(result.status === 'presented' ? 'notifications.validation.presented' : 'notifications.validation.failed');
    } catch {
      setStatus('notifications.validation.failed');
    }
  }

  return (
    <ScrollView contentContainerStyle={{ gap: 12, padding: 16 }}>
      <StyledText variant="title">notifications.validation.title</StyledText>
      <StyledText>{status}</StyledText>
      <ActionButton label="notifications.validation.view" onPress={() => void present('view')} />
      <ActionButton label="notifications.validation.edit" onPress={() => void present('edit')} />
      <ActionButton label="notifications.validation.undo" onPress={() => void present('undo')} />
      <ActionButton label="notifications.validation.expired" onPress={() => void present('undo', true)} />
    </ScrollView>
  );
}
