import React from 'react';
import { router } from 'expo-router';
import { Pressable, View, StyleSheet } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, minTouchTarget, spacing } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import { useAppShellStore } from '@/state/app-shell';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { useTrackingStatus } from './useAutomaticTracking';

export function TrackingHomeCard() {
  const query = useTrackingStatus();
  const status = query.data;
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

  if (
    query.isLoading ||
    query.isError ||
    session?.status !== 'authenticated' ||
    profileSetupStatus !== 'complete' ||
    dismissed ||
    status?.platform !== 'android' ||
    status.permissionStatus !== 'not_requested'
  ) {
    return null;
  }

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
      <SurfaceCard>
        <View style={styles.stack}>
          <View
            testID="tracking-home-card-header"
            style={[
              styles.header,
              { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }
            ]}
          >
            <MessageTrackingMark />
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
            style={{
              color: theme.colors.content.secondary,
              textAlign: direction === 'rtl' ? 'right' : 'left',
              writingDirection: direction
            }}
          >
            {translate('tracking.home.enableBody')}
          </StyledText>
          <ActionButton
            label={translate('tracking.home.enableAction')}
            onPress={() => router.push('/tracking')}
            style={styles.action}
            variant="secondary"
          />
        </View>
      </SurfaceCard>
    </View>
  );
}

function MessageTrackingMark() {
  const theme = useTheme();
  const dotStyle = [
    styles.messageDot,
    { backgroundColor: theme.colors.content.inverse }
  ];

  return (
    <View
      accessible={false}
      testID="tracking-home-message-icon"
      style={styles.messageMark}
    >
      <View
        testID="tracking-home-message-bubble"
        style={[
          styles.messageBubble,
          { backgroundColor: colorTokens.teal['500'] }
        ]}
      >
        <View
          style={[
            styles.messageTail,
            { backgroundColor: colorTokens.teal['500'] }
          ]}
        />
        <View style={styles.messageDots}>
          <View testID="tracking-home-message-dot-1" style={dotStyle} />
          <View testID="tracking-home-message-dot-2" style={dotStyle} />
          <View testID="tracking-home-message-dot-3" style={dotStyle} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignSelf: 'stretch' },
  dismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: minTouchTarget
  },
  header: {
    alignItems: 'center',
    ...layoutDirectionStyle('ltr'),
    gap: spacing.sm
  },
  messageBubble: {
    alignItems: 'center',
    borderRadius: 7.2,
    height: 21.6,
    justifyContent: 'center',
    width: 27
  },
  messageDot: { borderRadius: 1.8, height: 3.6, width: 3.6 },
  messageDots: { flexDirection: 'row', gap: 2.7, zIndex: 1 },
  messageMark: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  messageTail: {
    bottom: -1.8,
    height: 7.2,
    position: 'absolute',
    right: 4.5,
    transform: [{ rotate: '45deg' }],
    width: 7.2
  },
  section: { ...layoutDirectionStyle('ltr'), gap: spacing.md },
  stack: { gap: spacing.md },
  title: { flex: 1 }
});
