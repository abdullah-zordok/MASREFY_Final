import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View
} from 'react-native';

import { useTheme } from '@/state/theme-context';
import { translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { radius } from '@/design-system/tokens';

type FormFieldVariant = 'text' | 'phone' | 'otp' | 'search' | 'amount';

export interface FormFieldProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  variant?: FormFieldVariant;
  helperText?: string;
  errorText?: string;
  labelPlacement?: 'above' | 'accessibility-only';
}

export function FormField({
  label,
  variant = 'text',
  helperText,
  errorText,
  labelPlacement = 'above',
  keyboardType: requestedKeyboardType,
  style,
  ...props
}: FormFieldProps) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const localizedLabel = translateDynamic(label);
  const localizedHelper = helperText ? translateDynamic(helperText) : undefined;
  const localizedError = errorText ? translateDynamic(errorText) : undefined;
  const keyboardType =
    requestedKeyboardType ??
    (variant === 'amount'
      ? 'decimal-pad'
      : variant === 'phone' || variant === 'otp'
        ? 'number-pad'
        : variant === 'search'
          ? 'web-search'
          : 'default');
  const physicalLtr =
    variant === 'amount' ||
    variant === 'phone' ||
    variant === 'otp' ||
    keyboardType === 'decimal-pad' ||
    keyboardType === 'number-pad' ||
    keyboardType === 'numeric' ||
    keyboardType === 'phone-pad';
  const directionalText = {
    textAlign: 'auto' as const,
    writingDirection: direction
  };

  return (
    <View style={styles.stack}>
      {labelPlacement === 'above' ? (
        <Text
          style={[
            styles.label,
            directionalText,
            { color: theme.colors.textPrimary }
          ]}
        >
          {localizedLabel}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={localizedLabel}
        keyboardType={keyboardType}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surfaces.card,
            borderColor: errorText
              ? theme.colors.borders.error
              : theme.colors.borders.subtle,
            color: theme.colors.textPrimary,
            textAlign: direction === 'rtl' ? 'right' : 'left',
            writingDirection: physicalLtr ? 'ltr' : direction
          },
          style
        ]}
        {...props}
      />
      {localizedHelper ? (
        <Text style={[directionalText, { color: theme.colors.textSecondary }]}>
          {localizedHelper}
        </Text>
      ) : null}
      {localizedError ? (
        <Text
          accessibilityRole="alert"
          style={[directionalText, { color: theme.colors.status.danger }]}
        >
          {localizedError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 6
  },
  label: {
    fontWeight: '600'
  },
  input: {
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    paddingHorizontal: 12
  }
});
