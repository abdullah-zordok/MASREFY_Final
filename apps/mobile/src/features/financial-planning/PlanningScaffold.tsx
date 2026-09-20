import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon } from '@/design-system/icons';
import { minTouchTarget, spacing } from '@/design-system/tokens';
import type { CalculationReason } from '@/domain/financial-planning';
import { translate, type MessageKey } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';

export function planningReason(reason: CalculationReason): string {
  return translate(`planning.reason.${reason}` as MessageKey);
}

export function PlanningScreen({
  titleKey,
  title,
  children,
  action,
  backgroundColor,
  onBack,
  centeredTitle = false,
  hideHeader = false
}: {
  titleKey: MessageKey;
  title?: string;
  children: React.ReactNode;
  action?: { labelKey: MessageKey; onPress: () => void };
  backgroundColor?: string;
  onBack?: () => void;
  centeredTitle?: boolean;
  hideHeader?: boolean;
}) {
  const rtl = usePreferenceStore((state) => state.direction === 'rtl');
  return (
    <ScrollView
      style={backgroundColor ? { backgroundColor } : undefined}
      contentContainerStyle={styles.stack}
    >
      {hideHeader ? null : (
        <View style={styles.header}>
          <StyledText
            variant="title"
            style={[
              styles.headerTitle,
              centeredTitle ? styles.centeredTitle : rtl ? styles.rtlTitle : styles.ltrTitle,
              !centeredTitle && !rtl && onBack ? styles.ltrTitleWithBack : undefined
            ]}
          >
            {title ?? translate(titleKey)}
          </StyledText>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('common.back')}
              onPress={onBack}
              style={styles.backButton}
            >
              <DesignIcon name="back" decorative direction="ltr" />
            </Pressable>
          ) : null}
        </View>
      )}
      {children}
      {action ? (
        <ActionButton label={translate(action.labelKey)} onPress={action.onPress} />
      ) : null}
    </ScrollView>
  );
}

export function PlanningState({
  state,
  onRetry
}: {
  state: 'loading' | 'empty' | 'error' | 'partial' | 'offline';
  onRetry?: () => void;
}) {
  const key =
    state === 'loading'
      ? 'planning.state.loading'
      : state === 'empty'
        ? 'planning.state.empty'
        : state === 'partial'
          ? 'planning.state.partial'
          : state === 'offline'
            ? 'planning.state.offline'
            : 'planning.state.error';
  return (
    <StateView
      state={state === 'partial' ? 'review' : state}
      title={translate(key)}
      actionLabel={onRetry ? translate('planning.action.retry') : undefined}
      onAction={onRetry}
    />
  );
}

export function PlanningMetric({
  labelKey,
  value
}: {
  labelKey: MessageKey;
  value: string;
}) {
  return (
    <SurfaceCard>
      <View style={styles.metric}>
        <StyledText variant="caption">{translate(labelKey)}</StyledText>
        <StyledText variant="subtitle">{value}</StyledText>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  header: {
    justifyContent: 'center',
    minHeight: minTouchTarget,
    position: 'relative'
  },
  headerTitle: { width: '100%' },
  centeredTitle: { paddingHorizontal: 52, textAlign: 'center' },
  rtlTitle: { textAlign: 'right' },
  ltrTitle: { textAlign: 'left' },
  ltrTitleWithBack: { paddingLeft: 52 },
  backButton: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    position: 'absolute',
    top: 0
  },
  metric: {
    gap: spacing.xs
  }
});
