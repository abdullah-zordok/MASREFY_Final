import React, { type ReactNode } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  elevation,
  minTouchTarget,
  radius,
  spacing
} from '@/design-system/tokens';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

export function GroupedList({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={[
        styles.group,
        {
          backgroundColor: theme.colors.surfaces.card,
          borderColor: theme.colors.borders.default
        }
      ]}
    >
      {children}
    </View>
  );
}

export function NavigationRow({
  label,
  description,
  value,
  status,
  disabled = false,
  onPress
}: {
  label: string;
  description?: string;
  value?: string;
  status?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const largeText = PixelRatio.getFontScale() >= 1.2;
  const accessibleLabel = [label, description, value, status]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityLabel={accessibleLabel}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          alignItems: largeText ? 'stretch' : 'center',
          borderBottomColor: theme.colors.borders.subtle,
          direction: 'ltr',
          writingDirection: 'ltr',
          flexDirection: largeText
            ? 'column'
            : direction === 'rtl'
              ? 'row-reverse'
              : 'row',
          minHeight: minTouchTarget,
          opacity: disabled ? 0.56 : 1
        },
        pressed &&
          !disabled && {
            backgroundColor: theme.colors.interactions.quietPressed
          }
      ]}
    >
      <View style={styles.text}>
        <Text
          style={[
            styles.label,
            {
              color: theme.colors.content.primary,
              textAlign: direction === 'rtl' ? 'right' : 'left'
            }
          ]}
        >
          {label}
        </Text>
        {description ? (
          <Text
            style={[
              styles.description,
              {
                color: theme.colors.content.secondary,
                textAlign: direction === 'rtl' ? 'right' : 'left'
              }
            ]}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {status ? (
        <Text style={[styles.status, { color: theme.colors.status.review }]}>
          {status}
        </Text>
      ) : null}
      {value ? (
        <Text style={[styles.value, { color: theme.colors.content.secondary }]}>
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <Text
          accessible={false}
          testID="navigation-row-disclosure"
          style={[styles.disclosure, { color: theme.colors.content.muted }]}
        >
          {direction === 'rtl' ? '‹' : '›'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    ...elevation.card,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden'
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  text: {
    flex: 1,
    gap: spacing.xs
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24
  },
  description: {
    fontSize: 14,
    lineHeight: 20
  },
  status: {
    fontSize: 12,
    fontWeight: '700'
  },
  value: {
    fontSize: 14,
    lineHeight: 20
  },
  disclosure: {
    fontSize: 24,
    lineHeight: 24
  }
});
