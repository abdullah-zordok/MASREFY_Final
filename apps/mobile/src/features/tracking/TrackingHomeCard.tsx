import React, { useEffect } from 'react';
import { router } from 'expo-router';
import {
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
  const { width } = useWindowDimensions();
  const status = trackingQuery.data;
  const direction = usePreferenceStore((state) => state.direction);
  const session = useAppShellStore((state) => state.session);
  const profileSetupStatus = useAppShellStore(
    (state) => state.profileSetupStatus
  );
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
    !notificationPermission.isLoading &&
    !notificationPermission.isError &&
    notificationPermission.data !== 'granted';
  const canRequestNotificationPermission =
    notificationPermission.data === 'not_requested';
  const hasSourcePreferences =
    status?.smsTrackingEnabled !== undefined ||
    status?.notificationTrackingEnabled !== undefined;
  const smsPermission = status?.smsPermissionStatus ?? status?.permissionStatus;
  const notificationAccess = status?.notificationAccessStatus ?? 'denied';
  const trackingReady =
    !trackingQuery.isLoading &&
    !trackingQuery.isError &&
    status?.platform === 'android';
  const showSmsTracking =
    trackingReady &&
    smsPermission !== 'unavailable' &&
    !(
      status.mode !== 'paused' &&
      smsPermission === 'granted' &&
      (hasSourcePreferences
        ? status.smsTrackingEnabled === true
        : status.permissionStatus === 'granted')
    );
  const showNotificationTracking =
    trackingReady &&
    notificationAccess !== 'unavailable' &&
    !(
      status.mode !== 'paused' &&
      notificationAccess === 'granted' &&
      status.notificationTrackingEnabled === true
    );

  if (!showNotifications && !showSmsTracking && !showNotificationTracking)
    return null;

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
          <SetupCard
            actionLabel={
              canRequestNotificationPermission
                ? translate('notifications.home.enableAction')
                : translate('notifications.preferences.openSettings')
            }
            body={translate('notifications.home.enableBody')}
            mark={<NotificationMark />}
            onPress={() =>
              canRequestNotificationPermission
                ? requestNotificationPermission.mutate()
                : openNotificationSettings.mutate()
            }
            testID="notification-home-card"
            title={translate('notifications.home.enableTitle')}
            width={cardWidth}
          />
        ) : null}
        {showSmsTracking ? (
          <SetupCard
            actionLabel={translate('tracking.home.enableAction')}
            body={translate('tracking.source.smsTrackingDescription')}
            mark={<TrackingMark testID="sms-tracking-home-icon" />}
            onPress={() => router.push('/tracking')}
            testID="sms-tracking-home-card"
            title={translate('tracking.source.smsTracking')}
            width={cardWidth}
          />
        ) : null}
        {showNotificationTracking ? (
          <SetupCard
            actionLabel={translate('tracking.home.enableAction')}
            body={translate('tracking.source.notificationTrackingDescription')}
            mark={<TrackingMark testID="notification-tracking-home-icon" />}
            onPress={() => router.push('/tracking')}
            testID="notification-tracking-home-card"
            title={translate('tracking.source.notificationTracking')}
            width={cardWidth}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function SetupCard({
  actionLabel,
  body,
  mark,
  onPress,
  testID,
  title,
  width
}: {
  actionLabel: string;
  body: string;
  mark: React.ReactNode;
  onPress: () => void;
  testID: string;
  title: string;
  width: number;
}) {
  const direction = usePreferenceStore((state) => state.direction);
  const theme = useTheme();
  return (
    <SurfaceCard testID={testID} style={[styles.setupCard, { width }]}>
      <View style={styles.stack}>
        <View
          testID={`${testID}-header`}
          style={[
            styles.header,
            { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }
          ]}
        >
          {mark}
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
            {title}
          </StyledText>
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
          {body}
        </StyledText>
        <ActionButton
          label={actionLabel}
          onPress={onPress}
          style={styles.action}
          labelStyle={styles.actionLabel}
          variant="secondary"
        />
      </View>
    </SurfaceCard>
  );
}

function TrackingMark({ testID }: { testID: string }) {
  return (
    <View accessible={false} testID={testID} style={styles.trackingMark}>
      <Svg
        accessibilityElementsHidden
        height={30 * CARD_SCALE}
        testID={`${testID}-sync-icon`}
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
        <Circle cx={23.5} cy={7.5} fill={colorTokens.financial.expense} r={4} />
        <Circle cx={23.5} cy={7.5} fill={colorTokens.raw['FFFFFF']} r={1.35} />
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
