import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  Pressable,
  ScrollView,
  View,
  StyleSheet,
  AppState,
  useWindowDimensions
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, spacing } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import {
  useNotificationPermission,
  useOpenNotificationSettings,
  useRequestNotificationPermission
} from '@/features/notifications/notification-preferences-queries';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { useTrackingStatus } from './useAutomaticTracking';

const CARD_SCALE = 1.05;

export function TrackingHomeCard() {
  const trackingQuery = useTrackingStatus();
  const notificationPermission = useNotificationPermission();
  const requestNotificationPermission = useRequestNotificationPermission();
  const openNotificationSettings = useOpenNotificationSettings();
  const [notificationDismissed, setNotificationDismissed] = useState(false);
  const { width } = useWindowDimensions();
  const status = trackingQuery.data;
  const direction = usePreferenceStore((state) => state.direction);
  const session = useAppShellStore((state) => state.session);
  const profileSetupStatus = useAppShellStore(
    (state) => state.profileSetupStatus
  );
  const dismissed = useAppShellStore(
    (state) => state.trackingHomeCardDismissed
  );
  const dismiss = useAppShellStore((state) => state.dismissTrackingHomeCard);
  const theme = useTheme();
  const refetchNotificationPermission = notificationPermission.refetch;
  const refetchTrackingStatus = trackingQuery.refetch;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refetchNotificationPermission();
        void refetchTrackingStatus();
      }
    });
    return () => subscription.remove();
  }, [refetchNotificationPermission, refetchTrackingStatus]);

  if (
    session?.status !== 'authenticated' ||
    profileSetupStatus !== 'complete'
  ) {
    return null;
  }

  const showNotifications =
    !notificationDismissed &&
    !notificationPermission.isLoading &&
    !notificationPermission.isError &&
    notificationPermission.data !== 'granted';
  const hasSourceStatuses =
    status !== undefined &&
    ('smsPermissionStatus' in status || 'notificationAccessStatus' in status);
  const trackingSourceActive = hasSourceStatuses
    ? status.smsPermissionStatus === 'granted' ||
      status.notificationAccessStatus === 'granted'
    : status?.permissionStatus === 'granted';
  const trackingSourceAvailable = hasSourceStatuses
    ? status.smsPermissionStatus !== 'unavailable' ||
      status.notificationAccessStatus !== 'unavailable'
    : status?.serviceState !== 'unavailable';
  const showTracking =
    !dismissed &&
    !trackingQuery.isLoading &&
    !trackingQuery.isError &&
    status?.platform === 'android' &&
    trackingSourceAvailable &&
    !(trackingSourceActive && status.mode !== 'paused');

  if (!showNotifications && !showTracking) return null;

  const cardWidth = Math.min(
    312 * CARD_SCALE,
    Math.max(248 * CARD_SCALE, (width - spacing.xxl * 2) * CARD_SCALE)
  );
  const railInset = Math.max(
    1,
    (width - spacing.xxl * CARD_SCALE - cardWidth) / 2
  );

  return (
    <View testID="tracking-home-onboarding" style={styles.section}>
      <StyledText
        testID="tracking-home-heading"
        variant="title"
        style={{
          textAlign: direction === 'rtl' ? 'right' : 'left',
          writingDirection: direction
        }}
      >
        {translate('tracking.home.onboardingHeading')}
      </StyledText>
      <ScrollView
        contentContainerStyle={[
          styles.railContent,
          { paddingHorizontal: railInset }
        ]}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="home-setup-cards-rail"
      >
        {showNotifications ? (
          <SurfaceCard
            testID="notification-home-card"
            style={[styles.setupCard, { width: cardWidth }]}
          >
            <View style={styles.stack}>
              <View
                testID="notification-home-card-header"
                style={[
                  styles.header,
                  {
                    flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
                  }
                ]}
              >
                <NotificationMark />
                <StyledText
                  variant="subtitle"
                  style={[
                    styles.title,
                    {
                      textAlign: direction === 'rtl' ? 'right' : 'left',
                      writingDirection: direction
                    }
                  ]}
                >
                  {translate('notifications.home.enableTitle')}
                </StyledText>
                <Pressable
                  accessibilityLabel={translate(
                    'notifications.home.dismissAction'
                  )}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setNotificationDismissed(true)}
                  style={styles.dismiss}
                >
                  <DesignIcon
                    color={theme.colors.content.muted}
                    decorative
                    name="close"
                    size="sm"
                  />
                </Pressable>
              </View>
              <StyledText
                variant="caption"
                style={[
                  styles.description,
                  {
                    color: theme.colors.content.secondary,
                    textAlign: direction === 'rtl' ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('notifications.home.enableBody')}
              </StyledText>
              <ActionButton
                label={
                  notificationPermission.data === 'permanently_denied'
                    ? translate('notifications.preferences.openSettings')
                    : translate('notifications.home.enableAction')
                }
                onPress={() =>
                  notificationPermission.data === 'permanently_denied'
                    ? openNotificationSettings.mutate()
                    : requestNotificationPermission.mutate()
                }
                style={styles.action}
                labelStyle={styles.actionLabel}
                variant="secondary"
              />
            </View>
          </SurfaceCard>
        ) : null}
        {showTracking ? (
          <SurfaceCard
            testID="tracking-home-card"
            style={[styles.setupCard, { width: cardWidth }]}
          >
            <View style={styles.stack}>
              <View
                testID="tracking-home-card-header"
                style={[
                  styles.header,
                  { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }
                ]}
              >
                <TrackingMark />
                <StyledText
                  variant="subtitle"
                  style={[
                    styles.title,
                    {
                      textAlign: direction === 'rtl' ? 'right' : 'left',
                      writingDirection: direction
                    }
                  ]}
                >
                  {translate('tracking.home.enableTitle')}
                </StyledText>
                <Pressable
                  accessibilityLabel={translate('tracking.home.dismissAction')}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => void dismiss()}
                  style={styles.dismiss}
                >
                  <DesignIcon
                    color={theme.colors.content.muted}
                    decorative
                    label=""
                    name="close"
                    size="sm"
                  />
                </Pressable>
              </View>
              <StyledText
                variant="caption"
                style={[
                  styles.description,
                  {
                    color: theme.colors.content.secondary,
                    textAlign: direction === 'rtl' ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('tracking.home.enableBody')}
              </StyledText>
              <ActionButton
                label={translate('tracking.home.enableAction')}
                onPress={() => router.push('/tracking')}
                style={styles.action}
                labelStyle={styles.actionLabel}
                variant="secondary"
              />
            </View>
          </SurfaceCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function TrackingMark() {
  return (
    <View
      accessible={false}
      testID="tracking-home-message-icon"
      style={styles.trackingMark}
    >
      <Svg
        accessibilityElementsHidden
        height={30 * CARD_SCALE}
        testID="tracking-home-sync-icon"
        viewBox="0 0 32 32"
        width={30 * CARD_SCALE}
      >
        <Path
          d="M7 4.5h16v21.75l-3-2-3 2-3-2-3 2-4-2V4.5Z"
          fill="none"
          stroke={colorTokens.raw['42A5F5']}
          strokeLinejoin="round"
          strokeWidth={2.6}
        />
        <Path
          d="M11 9h8M11 13h5"
          fill="none"
          stroke={colorTokens.raw['42A5F5']}
          strokeLinecap="round"
          strokeWidth={2.2}
        />
        <Circle
          cx={19.5}
          cy={18.5}
          fill={colorTokens.raw['FFFFFF']}
          r={4.25}
          stroke={colorTokens.financial.expense}
          strokeWidth={2.4}
        />
        <Path
          d="m22.7 21.7 3.3 3.3"
          fill="none"
          stroke={colorTokens.financial.expense}
          strokeLinecap="round"
          strokeWidth={2.7}
        />
      </Svg>
    </View>
  );
}

function NotificationMark() {
  return (
    <View
      accessible={false}
      testID="notification-home-icon"
      style={styles.notificationMark}
    >
      <Svg
        accessibilityElementsHidden
        height={30 * CARD_SCALE}
        testID="notification-home-bell"
        viewBox="0 0 32 32"
        width={30 * CARD_SCALE}
      >
        <Path
          d="M16 4.5a6 6 0 0 0-6 6v4.25c0 2.1-.78 4.12-2.2 5.67L6.3 22h19.4l-1.5-1.58A8.35 8.35 0 0 1 22 14.75V10.5a6 6 0 0 0-6-6Z"
          fill={colorTokens.raw['42A5F5']}
        />
        <Path
          d="M12.8 24.2a3.35 3.35 0 0 0 6.4 0h-6.4Z"
          fill={colorTokens.financial.expense}
        />
        <Circle
          cx={23.5}
          cy={7.5}
          fill={colorTokens.financial.expense}
          r={4}
        />
        <Circle
          cx={23.5}
          cy={7.5}
          fill={colorTokens.raw['FFFFFF']}
          r={1.35}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignSelf: 'stretch',
    borderRadius: 16 * CARD_SCALE,
    borderWidth: 0,
    marginTop: 'auto',
    minHeight: 48 * CARD_SCALE
  },
  actionLabel: {
    fontSize: 15,
    lineHeight: 22
  },
  description: {
    fontSize: 13,
    lineHeight: 20
  },
  dismiss: {
    alignItems: 'center',
    backgroundColor: colorTokens.sand['200'],
    borderRadius: 14 * CARD_SCALE,
    height: 28 * CARD_SCALE,
    justifyContent: 'center',
    width: 28 * CARD_SCALE
  },
  header: {
    alignItems: 'center',
    ...layoutDirectionStyle('ltr'),
    gap: spacing.sm * CARD_SCALE
  },
  trackingMark: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexShrink: 0,
    height: 36 * CARD_SCALE,
    justifyContent: 'center',
    position: 'relative',
    width: 36 * CARD_SCALE
  },
  notificationMark: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexShrink: 0,
    height: 36 * CARD_SCALE,
    justifyContent: 'center',
    position: 'relative',
    width: 36 * CARD_SCALE
  },
  railContent: {
    ...layoutDirectionStyle('ltr'),
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.md * CARD_SCALE,
    paddingBottom: spacing.sm * CARD_SCALE,
    justifyContent: 'center'
  },
  section: { ...layoutDirectionStyle('ltr'), gap: spacing.md },
  setupCard: {
    borderRadius: 18 * CARD_SCALE,
    height: (168 + spacing.sm) * CARD_SCALE,
    padding: spacing.lg * CARD_SCALE
  },
  stack: { flex: 1, gap: spacing.sm * CARD_SCALE },
  title: { flex: 1, fontSize: 16, lineHeight: 22 }
});
