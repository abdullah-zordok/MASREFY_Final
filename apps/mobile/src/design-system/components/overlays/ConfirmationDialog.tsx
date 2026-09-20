import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/design-system/components/ActionButton';
import { useTheme } from '@/state/theme-context';
import { translate, translateDynamic } from '@/localization/i18n';

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onCancel,
  onConfirm
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.dialog, { borderColor: theme.colors.border }]}
    >
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
        {translateDynamic(title)}
      </Text>
      <Text style={{ color: theme.colors.textSecondary }}>{translateDynamic(message)}</Text>
      <View style={styles.actions}>
        <ActionButton
          label={cancelLabel ?? translate('coreFinance.cancel')}
          variant="secondary"
          onPress={onCancel}
        />
        <ActionButton
          label={confirmLabel}
          variant={destructive ? 'destructive' : 'primary'}
          onPress={onConfirm}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16
  },
  title: {
    fontWeight: '700'
  },
  actions: {
    gap: 8
  }
});
