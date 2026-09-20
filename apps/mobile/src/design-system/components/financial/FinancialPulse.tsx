import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import {
  minTouchTarget,
  radius,
  spacing,
  typography
} from '@/design-system/tokens';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

export function FinancialPulse({
  statement,
  scope,
  scopeIcon,
  supportingValue,
  evidenceLabel,
  onEvidence,
  accessibilityLabel,
  children
}: {
  statement: string;
  scope: string;
  scopeIcon?: DesignIconName;
  supportingValue?: string;
  evidenceLabel?: string;
  onEvidence?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surfaces.financialHero,
          borderColor: theme.colors.surfaces.financialHero
        }
      ]}
    >
      <View
        testID="financial-pulse-orbit"
        accessible={false}
        style={[styles.orbit, { borderColor: theme.colors.accent }]}
      />
      <View
        testID="financial-pulse-orbit"
        accessible={false}
        style={[
          styles.orbit,
          styles.orbitInner,
          { borderColor: theme.colors.accent }
        ]}
      />
      <View
        testID="financial-pulse-scope"
        style={[
          styles.scopeRow,
          {
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        <Text
          style={[
            styles.scope,
            { color: theme.colors.content.onFinancialHero }
          ]}
        >
          {scope}
        </Text>
        {scopeIcon ? (
          <DesignIcon
            name={scopeIcon}
            label={scope}
            color={theme.colors.content.onFinancialHero}
            size="sm"
            decorative
          />
        ) : null}
      </View>
      <Text
        testID="financial-pulse-statement"
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        numberOfLines={1}
        style={[
          styles.statement,
          {
            color: theme.colors.content.onFinancialHero,
            textAlign: direction === 'rtl' ? 'right' : 'left'
          }
        ]}
      >
        {statement}
      </Text>
      {supportingValue ? (
        <Text
          style={[
            styles.support,
            {
              color: theme.colors.content.onFinancialHero,
              textAlign: direction === 'rtl' ? 'right' : 'left',
              writingDirection: direction
            }
          ]}
        >
          {supportingValue}
        </Text>
      ) : null}
      {children}
      {evidenceLabel && onEvidence ? (
        <Pressable
          accessibilityLabel={evidenceLabel}
          accessibilityRole="button"
          onPress={onEvidence}
          style={styles.evidence}
        >
          <Text
            style={[
              styles.evidenceText,
              { color: theme.colors.content.onFinancialHero }
            ]}
          >
            {evidenceLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radius.overlay,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.xl
  },
  orbit: {
    borderRadius: 96,
    borderWidth: StyleSheet.hairlineWidth,
    height: 192,
    opacity: 0.26,
    position: 'absolute',
    right: -54,
    top: -38,
    width: 192
  },
  orbitInner: {
    borderRadius: 72,
    height: 144,
    opacity: 0.18,
    right: -18,
    top: -2,
    width: 144
  },
  scopeRow: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.sm,
    writingDirection: 'ltr'
  },
  scope: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24
  },
  statement: {
    ...typography.amount,
    alignSelf: 'stretch',
    fontSize: 44,
    letterSpacing: -1,
    lineHeight: 54,
    writingDirection: 'ltr'
  },
  support: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.84
  },
  evidence: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: minTouchTarget
  },
  evidenceText: {
    fontSize: 14,
    fontWeight: '700'
  }
});
