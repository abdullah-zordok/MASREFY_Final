import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';

import { StyledText } from '@/components/StyledText';
import { AppBar } from '@/design-system/components/navigation/AppNavigation';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { Toggle } from '@/design-system/components/forms/SelectionControls';
import { DesignIcon } from '@/design-system/icons';
import { useTrackingStatus } from './useAutomaticTracking';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { automaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import { createTrackingPermissionService } from '@/services/platform/tracking-permission-service';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import type { KeywordRule } from '@/domain/app-shell';
import { TrackingKeywordChips } from './components/TrackingKeywordChips';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';

export function TrackingStatusScreen() {
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  const query = useTrackingStatus();
  const refetchTrackingStatus = query.refetch;
  const permissionService = useMemo(createTrackingPermissionService, []);

  const [updating, setUpdating] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);

  useEffect(() => {
    void automaticTrackingService.listKeywordRules().then(setKeywordRules);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refetchTrackingStatus();
        void automaticTrackingService.listKeywordRules().then(setKeywordRules);
      }
    });
    return () => subscription.remove();
  }, [refetchTrackingStatus]);

  async function handleKeywordsChange(newRules: KeywordRule[]) {
    setKeywordRules(newRules);
    try {
      await automaticTrackingService.saveKeywordRules(newRules);
    } catch {
      setActionFailed(true);
    }
  }

  async function recoverPermission(status: string | null) {
    setActionFailed(false);
    try {
      if (status === 'revoked' || status === 'permanently_denied') {
        await permissionService.openSettings();
      } else {
        await permissionService.requestAfterEducation();
        await query.refetch();
      }
    } catch {
      setActionFailed(true);
    }
  }

  async function handleToggle(nextValue: boolean) {
    if (updating) return;
    setActionFailed(false);
    setUpdating(true);
    try {
      if (nextValue) {
        // User wants to enable tracking
        await automaticTrackingService.setMode('automatic_clear');
        if (query.data?.permissionStatus !== 'granted') {
          try {
            await permissionService.requestAfterEducation();
          } catch {
            // Permission flow was cancelled or denied
          }
        }
      } else {
        // User wants to disable tracking
        await automaticTrackingService.setMode('paused');
      }
      await query.refetch();
    } catch {
      setActionFailed(true);
    } finally {
      setUpdating(false);
    }
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
    }
  };

  if (query.isLoading) {
    return (
      <StateView state="loading" title={translate('tracking.state.loading')} />
    );
  }

  if (query.isError || !query.data) {
    return (
      <StateView
        state="error"
        title={translate('tracking.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => void query.refetch()}
      />
    );
  }

  const status = query.data;
  const permissionUnavailable =
    status.permissionStatus === 'unavailable' ||
    status.serviceState === 'unavailable';
  const isEnabled = status.mode !== 'paused' && !permissionUnavailable;
  const hasPermission = status.permissionStatus === 'granted';
  const permissionMessage = translate(
    permissionUnavailable
      ? 'tracking.permission.unavailableMessage'
      : 'tracking.permission.warning'
  );

  return (
    <View testID="tracking-status-screen" style={[styles.root, { direction }]}>
      {/* 1. Header with back navigation and localized title */}
      <AppBar
        title={translate('tracking.header.title')}
        onBack={handleBack}
        direction={direction}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Tracking Status Card */}
        <SurfaceCard style={styles.card}>
          {/* Status Row: START = Status text (Right in RTL, Left in LTR), END = Switch (Left in RTL, Right in LTR) */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusTextGroup,
                { alignItems: isRtl ? 'flex-start' : 'flex-start' }
              ]}
            >
              <StyledText
                variant="caption"
                style={[
                  styles.statusLabel,
                  { textAlign: isRtl ? 'right' : 'left' }
                ]}
              >
                {translate('tracking.status.label')}
              </StyledText>
              <StyledText
                variant="title"
                style={[
                  styles.statusValue,
                  { textAlign: isRtl ? 'right' : 'left' }
                ]}
              >
                {permissionUnavailable
                  ? translate('tracking.status.unavailable')
                  : isEnabled
                    ? translate('tracking.status.enabled')
                    : translate('tracking.status.disabled')}
              </StyledText>
            </View>

            <View style={styles.toggleWrapper}>
              <Toggle
                testID="tracking-mode-switch"
                value={isEnabled}
                onValueChange={(val) => void handleToggle(val)}
                disabled={updating || permissionUnavailable}
                accessibilityLabel={translate('tracking.status.mode')}
              />
            </View>
          </View>

          <TrackingDemoNotice />

          {/* Actionable Permission Warning: START = Warning Icon, MIDDLE = Warning Text, END = Chevron */}
          {!hasPermission && (
            <Pressable
              testID="tracking-permission-warning-banner"
              disabled={permissionUnavailable}
              onPress={
                permissionUnavailable
                  ? undefined
                  : () => void recoverPermission(status.permissionStatus)
              }
              style={({ pressed }) => [
                styles.warningBanner,
                pressed && styles.bannerPressed
              ]}
              accessibilityRole="button"
              accessibilityLabel={permissionMessage}
              accessibilityState={{ disabled: permissionUnavailable }}
            >
              {/* START: Warning Icon */}
              <View style={styles.warningIconBadge}>
                <DesignIcon
                  name="warning"
                  size="sm"
                  color={colorTokens.status.warning}
                  direction={direction}
                  decorative
                />
              </View>

              {/* MIDDLE: Warning Text */}
              <StyledText
                style={[
                  styles.warningText,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {permissionMessage}
              </StyledText>

              {/* END: Chevron pointing in reading direction (left in RTL, right in LTR) */}
              {!permissionUnavailable ? (
                <DesignIcon
                  name="chevronEnd"
                  size="sm"
                  color={colorTokens.status.warning}
                  direction={direction}
                  decorative
                />
              ) : null}
            </Pressable>
          )}
        </SurfaceCard>

        {/* 3. Explanation Section: START = Semantic Icon Circle, END = Concise Text */}
        <SurfaceCard style={styles.card}>
          <View style={styles.explanationList}>
            {/* Automatic Detection */}
            <View style={styles.explanationItem}>
              <View style={styles.iconCircle}>
                <DesignIcon
                  name="obligation"
                  size="sm"
                  color={colorTokens.teal['700']}
                  direction={direction}
                  decorative
                />
              </View>
              <StyledText
                style={[
                  styles.explanationItemText,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('tracking.howItWorks.detection')}
              </StyledText>
            </View>

            {/* Privacy */}
            <View style={styles.explanationItem}>
              <View style={styles.iconCircle}>
                <DesignIcon
                  name="privacy"
                  size="sm"
                  color={colorTokens.teal['700']}
                  direction={direction}
                  decorative
                />
              </View>
              <StyledText
                style={[
                  styles.explanationItemText,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('tracking.howItWorks.privacy')}
              </StyledText>
            </View>

            {/* Background Execution */}
            <View style={styles.explanationItem}>
              <View style={styles.iconCircle}>
                <DesignIcon
                  name="settings"
                  size="sm"
                  color={colorTokens.teal['700']}
                  direction={direction}
                  decorative
                />
              </View>
              <StyledText
                style={[
                  styles.explanationItemText,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('tracking.howItWorks.background')}
              </StyledText>
            </View>

            {/* Manufacturer / Battery optimization guidance */}
            {!permissionUnavailable ? (
              <Pressable
                onPress={() => void recoverPermission(status.permissionStatus)}
                style={({ pressed }) => [
                  styles.explanationItem,
                  pressed && styles.bannerPressed
                ]}
              >
                <View style={styles.warningCircle}>
                  <DesignIcon
                    name="warning"
                    size="sm"
                    color={colorTokens.status.warning}
                    direction={direction}
                    decorative
                  />
                </View>
                <StyledText
                  style={[
                    styles.explanationItemText,
                    styles.manufacturerWarningText,
                    {
                      textAlign: isRtl ? 'right' : 'left',
                      writingDirection: direction
                    }
                  ]}
                >
                  {translate('tracking.howItWorks.deviceWarning')}
                </StyledText>
              </Pressable>
            ) : null}
          </View>
        </SurfaceCard>

        {/* 4. Keyword Management Card */}
        <SurfaceCard style={styles.card}>
          <TrackingKeywordChips
            rules={keywordRules}
            onChange={(rules) => void handleKeywordsChange(rules)}
            disabled={updating || permissionUnavailable}
          />
        </SurfaceCard>

        {/* Error notification if action fails */}
        {actionFailed ? (
          <View style={styles.errorBanner}>
            <StyledText accessibilityRole="alert" style={styles.errorText}>
              {translate('tracking.state.error')}
            </StyledText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function TrackingRecoveryPanel({
  permission,
  service,
  onRecoverPermission
}: {
  permission: string | null;
  service: string;
  onRecoverPermission?: () => void;
}) {
  if (permission === 'granted' && service === 'healthy') return null;
  return (
    <SurfaceCard>
      <StyledText>{translate('tracking.recovery.message')}</StyledText>
      {permission !== 'granted' && onRecoverPermission ? (
        <ActionButton
          label={translate(
            permission === 'revoked' || permission === 'permanently_denied'
              ? 'appShell.permission.openSettings'
              : 'appShell.permission.retry'
          )}
          onPress={onRecoverPermission}
        />
      ) : null}
      <ActionButton
        label={translate('tracking.action.manual')}
        onPress={() => router.push('/(tabs)/add')}
        variant="secondary"
      />
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colorTokens.sand['100'],
    flex: 1
  },
  scrollContent: {
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: spacing.xxl
  },
  card: {
    backgroundColor: colorTokens.sand['50'],
    borderColor: colorTokens.sand['400'],
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52
  },
  toggleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 54
  },
  statusTextGroup: {
    gap: 2
  },
  statusLabel: {
    color: colorTokens.ink['500'],
    fontSize: 13
  },
  statusValue: {
    color: colorTokens.ink['900'],
    fontSize: 22,
    fontWeight: '700'
  },
  warningBanner: {
    alignItems: 'center',
    backgroundColor: colorTokens.sand['200'],
    borderColor: colorTokens.status.warning,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    padding: spacing.md
  },
  bannerPressed: {
    opacity: 0.8
  },
  warningIconBadge: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  warningText: {
    color: colorTokens.ink['900'],
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18
  },
  explanationList: {
    gap: spacing.lg
  },
  explanationItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['100'],
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  warningCircle: {
    alignItems: 'center',
    backgroundColor: colorTokens.sand['200'],
    borderColor: colorTokens.status.warning,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  explanationItemText: {
    color: colorTokens.ink['700'],
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20
  },
  manufacturerWarningText: {
    color: colorTokens.status.warning,
    textDecorationLine: 'underline'
  },
  errorBanner: {
    backgroundColor: colorTokens.financial.expenseSurface,
    borderColor: colorTokens.status.danger,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: spacing.md
  },
  errorText: {
    color: colorTokens.status.danger,
    fontSize: 13,
    textAlign: 'center'
  }
});
