import React, { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';

import { StyledText } from '@/components/StyledText';
import { layoutDirectionStyle } from '@/design-system/direction';
import { AppBar } from '@/design-system/components/navigation/AppNavigation';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { Toggle } from '@/design-system/components/forms/SelectionControls';
import { DesignIcon } from '@/design-system/icons';
import {
  useAutomaticTrackingSyncState,
  useTrackingStatus
} from './useAutomaticTracking';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import { createTrackingPermissionService } from '@/services/platform/tracking-permission-service';
import { bankNotificationService } from '@/services/platform/bank-notification-service';
import { trackingSourcePreferences } from '@/services/tracking-source-preferences';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import type { KeywordRule } from '@/domain/app-shell';
import { TrackingKeywordChips } from './components/TrackingKeywordChips';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';
import {
  syncAutomaticTracking,
  type AutomaticTrackingSyncState
} from '@/services/automatic-tracking-coordinator';

export function TrackingStatusScreen() {
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  const query = useTrackingStatus();
  const syncState = useAutomaticTrackingSyncState();
  const refetchTrackingStatus = query.refetch;
  const permissionService = useMemo(createTrackingPermissionService, []);

  const [updating, setUpdating] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([]);
  const awaitingNotificationAccess = useRef(false);

  useEffect(() => {
    void automaticTrackingService.listKeywordRules().then(setKeywordRules);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void (async () => {
          if (awaitingNotificationAccess.current) {
            awaitingNotificationAccess.current = false;
            if (
              (await bankNotificationService.getAccessState()) === 'granted'
            ) {
              await bankNotificationService.setCaptureEnabled(true);
              await trackingSourcePreferences.set('notification', true);
              const current = await automaticTrackingService.getStatus();
              if (current.mode === 'paused')
                await automaticTrackingService.setMode('automatic_clear');
            }
          }
          await refetchTrackingStatus();
        })().catch(() => setActionFailed(true));
        void automaticTrackingService.listKeywordRules().then(setKeywordRules);
      }
    });
    return () => subscription.remove();
  }, [refetchTrackingStatus]);

  async function handleKeywordsChange(newRules: KeywordRule[]) {
    const previousRules = keywordRules;
    setKeywordRules(newRules);
    try {
      const savedRules =
        await automaticTrackingService.saveKeywordRules(newRules);
      setKeywordRules(savedRules.value);
    } catch {
      setKeywordRules(previousRules);
      setActionFailed(true);
    }
  }

  async function restoreKeywords() {
    setActionFailed(false);
    try {
      const restored = await automaticTrackingService.restoreDefaultKeywords();
      setKeywordRules(restored.value);
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
        router.push({
          pathname: '/tracking/permission',
          params: {
            mode:
              query.data?.mode === 'review_all'
                ? 'review_all'
                : 'automatic_clear'
          }
        });
      }
    } catch {
      setActionFailed(true);
    }
  }

  async function toggleSmsTracking(nextValue: boolean) {
    if (updating) return;
    setActionFailed(false);
    setUpdating(true);
    try {
      if (nextValue) {
        const permissionStatus =
          query.data?.smsPermissionStatus ?? query.data?.permissionStatus;
        if (permissionStatus !== 'granted') {
          if (permissionStatus === 'permanently_denied') {
            await permissionService.openSettings();
            return;
          }
          const permission = await permissionService.requestAfterEducation();
          if (permission.status === 'permanently_denied') {
            await permissionService.openSettings();
            return;
          }
          if (permission.status !== 'granted') {
            await query.refetch();
            return;
          }
        }
        await trackingSourcePreferences.set('sms', true);
        if (query.data?.mode === 'paused')
          await automaticTrackingService.setMode('automatic_clear');
      } else {
        await trackingSourcePreferences.set('sms', false);
        if (!query.data?.notificationTrackingEnabled)
          await automaticTrackingService.setMode('paused');
      }
      await query.refetch();
    } catch {
      setActionFailed(true);
    } finally {
      setUpdating(false);
    }
  }

  async function toggleTrackingMode(nextValue: boolean) {
    if (updating) return;
    setUpdating(true);
    setActionFailed(false);
    try {
      await automaticTrackingService.setMode(
        nextValue ? 'automatic_clear' : 'paused'
      );
      await query.refetch();
    } catch {
      setActionFailed(true);
    } finally {
      setUpdating(false);
    }
  }

  async function toggleNotificationTracking(nextValue: boolean) {
    if (updating) return;
    setActionFailed(false);
    setUpdating(true);
    try {
      if (nextValue) {
        const access = await bankNotificationService.getAccessState();
        if (access !== 'granted') {
          awaitingNotificationAccess.current = true;
          await bankNotificationService.openSettings();
          return;
        }
        await bankNotificationService.setCaptureEnabled(true);
        await trackingSourcePreferences.set('notification', true);
        if (query.data?.mode === 'paused')
          await automaticTrackingService.setMode('automatic_clear');
      } else {
        await bankNotificationService.setCaptureEnabled(false);
        await trackingSourcePreferences.set('notification', false);
        if (!query.data?.smsTrackingEnabled)
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
  const smsPermission = status.smsPermissionStatus ?? status.permissionStatus;
  const notificationAccess = status.notificationAccessStatus ?? 'denied';
  const smsEnabled =
    isEnabled &&
    smsPermission === 'granted' &&
    status.smsTrackingEnabled !== false;
  const notificationEnabled =
    isEnabled &&
    notificationAccess === 'granted' &&
    (status.notificationTrackingEnabled ?? true);
  const isAndroid = status.platform === 'android';

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
          {!isAndroid ? (
            <View
              testID="tracking-status-row"
              style={[
                styles.statusRow,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <View
                testID="tracking-status-text"
                style={[
                  styles.statusTextGroup,
                  { alignItems: isRtl ? 'flex-end' : 'flex-start' }
                ]}
              >
                <StyledText
                  variant="caption"
                  style={[
                    styles.statusLabel,
                    {
                      textAlign: isRtl ? 'right' : 'left',
                      writingDirection: direction
                    }
                  ]}
                >
                  {translate('tracking.status.label')}
                </StyledText>
                <StyledText
                  variant="title"
                  style={[
                    styles.statusValue,
                    {
                      textAlign: isRtl ? 'right' : 'left',
                      writingDirection: direction
                    }
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
                  onValueChange={(value) => void toggleTrackingMode(value)}
                  disabled={updating || permissionUnavailable}
                  accessibilityLabel={translate('tracking.status.label')}
                />
              </View>
            </View>
          ) : (
            <View style={styles.sourceList}>
              <TrackingSourceToggleRow
                testID="tracking-sms-switch"
                isRtl={isRtl}
                label={translate('tracking.source.smsTracking')}
                description={translate(
                  'tracking.source.smsTrackingDescription'
                )}
                value={smsEnabled}
                disabled={updating || smsPermission === 'unavailable'}
                onValueChange={(value) => void toggleSmsTracking(value)}
              />
              <View style={styles.sourceDivider} />
              <TrackingSourceToggleRow
                testID="tracking-notification-switch"
                isRtl={isRtl}
                label={translate('tracking.source.notificationTracking')}
                description={translate(
                  'tracking.source.notificationTrackingDescription'
                )}
                value={notificationEnabled}
                disabled={updating || notificationAccess === 'unavailable'}
                onValueChange={(value) =>
                  void toggleNotificationTracking(value)
                }
              />
            </View>
          )}

          <TrackingDemoNotice />
          <TrackingSyncPanel
            state={syncState}
            onRetry={() => void syncAutomaticTracking()}
          />

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
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' },
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
            <View
              testID="tracking-explanation-row"
              style={[
                styles.explanationItem,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
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
            <View
              testID="tracking-explanation-row"
              style={[
                styles.explanationItem,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
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
            <View
              testID="tracking-explanation-row"
              style={[
                styles.explanationItem,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
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
                  styles.physicalLtr,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' },
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
        <SurfaceCard
          testID="tracking-keywords-card"
          style={[styles.card, styles.keywordCard]}
        >
          <TrackingKeywordChips
            rules={keywordRules}
            onChange={(rules) => void handleKeywordsChange(rules)}
            onRestore={() => void restoreKeywords()}
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

function TrackingSourceToggleRow({
  testID,
  isRtl,
  label,
  description,
  value,
  disabled,
  onValueChange
}: {
  testID: string;
  isRtl: boolean;
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View
      testID={`${testID}-row`}
      style={[
        styles.sourceRow,
        styles.physicalLtr,
        { flexDirection: isRtl ? 'row-reverse' : 'row' }
      ]}
    >
      <View
        testID={`${testID}-text`}
        style={[
          styles.sourceText,
          { alignItems: isRtl ? 'flex-end' : 'flex-start' }
        ]}
      >
        <StyledText
          variant="title"
          style={[
            styles.sourceTitle,
            {
              textAlign: isRtl ? 'right' : 'left',
              writingDirection: isRtl ? 'rtl' : 'ltr'
            }
          ]}
        >
          {label}
        </StyledText>
        <StyledText
          variant="caption"
          style={[
            styles.sourceDescription,
            {
              textAlign: isRtl ? 'right' : 'left',
              writingDirection: isRtl ? 'rtl' : 'ltr'
            }
          ]}
        >
          {description}
        </StyledText>
      </View>
      <Toggle
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onValueChange}
        testID={testID}
        value={value}
      />
    </View>
  );
}

export function TrackingSyncPanel({
  state,
  onRetry
}: {
  state: AutomaticTrackingSyncState;
  onRetry: () => void;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'scanning' || state.status === 'processing')
    return (
      <StateView state="loading" title={translate('tracking.state.loading')} />
    );
  if (state.status === 'queued')
    return (
      <StateView
        state="offline"
        title={translate('tracking.service.offline')}
        message={translate('tracking.recovery.message')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={onRetry}
      />
    );
  if (state.status === 'imported')
    return (
      <StateView state="success" title={translate('tracking.status.enabled')} />
    );
  if (state.status === 'review' && state.reviewId)
    return (
      <StateView
        state="review"
        title={translate('tracking.review.title')}
        actionLabel={translate('tracking.action.review')}
        onAction={() => router.push(`/tracking/review/${state.reviewId}`)}
      />
    );
  if (state.status === 'duplicate' && state.duplicateId)
    return (
      <StateView
        state="review"
        title={translate('tracking.duplicate.title')}
        actionLabel={translate('tracking.action.open')}
        onAction={() =>
          router.push(`/tracking/duplicates/${state.duplicateId}`)
        }
      />
    );
  if (state.status === 'account_required')
    return (
      <StateView
        state="review"
        title={translate('coreFinance.accounts.noEligible')}
        actionLabel={translate('coreFinance.accounts.open')}
        onAction={() => router.push('/accounts')}
      />
    );
  return (
    <StateView
      state="error"
      title={translate('tracking.state.error')}
      actionLabel={translate('coreFinance.action.retry')}
      onAction={onRetry}
    />
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
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
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
  keywordCard: {
    marginHorizontal: -4,
    padding: 18
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52
  },
  sourceList: {
    gap: spacing.sm
  },
  sourceDivider: {
    backgroundColor: colorTokens.sand['300'],
    height: 1
  },
  sourceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 64
  },
  sourceText: {
    flex: 1,
    gap: spacing.xs
  },
  sourceTitle: {
    fontSize: 18,
    fontWeight: '700'
  },
  sourceDescription: {
    color: colorTokens.ink['500']
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
    color: colorTokens.ink['900'],
    fontSize: 18,
    fontWeight: '700'
  },
  statusValue: {
    color: colorTokens.ink['500'],
    fontSize: 13,
    fontWeight: '600'
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
