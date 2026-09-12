import React, { useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { useTheme } from '@/state/theme-context';
import { StyledText } from '@/components/StyledText';
import { translate } from '@/localization/i18n';
import { radius, spacing } from '@/design-system/tokens';
import { usePreferenceStore } from '@/state/preferences';
import { colorTokens } from '@/design-system/tokens';

export function AppSheet({
  title,
  visible,
  onDismiss,
  appearance = 'default',
  children
}: {
  title: string;
  visible: boolean;
  onDismiss: () => void;
  appearance?: 'default' | 'menu';
  children: ReactNode;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const reducedMotion = usePreferenceStore((state) => state.reducedMotion);
  const translateY = useRef(new Animated.Value(0)).current;
  const menu = appearance === 'menu';
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 6,
        onPanResponderMove: (_event, gesture) =>
          translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (shouldDismissMenuSheet(gesture.dy, gesture.vy)) {
            translateY.setValue(0);
            onDismiss();
            return;
          }
          if (reducedMotion) {
            translateY.setValue(0);
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true
            }).start();
          }
        }
      }),
    [onDismiss, reducedMotion, translateY]
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onDismiss}
      transparent
      visible={visible}
      testID="app-sheet-modal"
    >
      <KeyboardAvoidingView
        accessibilityLabel={title}
        accessibilityViewIsModal
        behavior="padding"
        style={styles.wrap}
      >
        <Pressable
          testID="app-sheet-backdrop"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onDismiss}
          style={[
            StyleSheet.absoluteFillObject,
            menu
              ? { backgroundColor: theme.colors.horizon.scrim }
              : { backgroundColor: theme.colors.content.primary, opacity: 0.32 }
          ]}
        />
        <Animated.View
          testID={menu ? 'app-sheet-menu' : undefined}
          style={[
            styles.sheet,
            menu && styles.menuSheet,
            {
              backgroundColor: menu ? theme.colors.horizon.sheet : theme.colors.surface,
              borderColor: menu ? theme.colors.horizon.sheetBorder : theme.colors.border,
              direction
            },
            menu && { transform: [{ translateY }] }
          ]}
        >
          {menu ? (
            <View testID="app-sheet-handle" style={styles.handleArea} {...panResponder.panHandlers}>
              <View style={[styles.handle, { backgroundColor: theme.colors.borders.default }]} />
            </View>
          ) : null}
          {!menu ? (
            <View style={styles.sheetHandleArea}>
              <View style={[styles.handle, { backgroundColor: theme.colors.borders?.subtle ?? colorTokens.raw["E0E6E2"] }]} />
            </View>
          ) : null}
          <View style={[styles.header, menu && styles.menuHeader]}>
            <StyledText
              accessible={false}
              variant="title"
              style={[
                styles.title,
                menu && styles.menuTitle,
                {
                  color: menu ? theme.colors.horizon.ink : theme.colors.textPrimary,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {title}
            </StyledText>
            {!menu ? (
              <Pressable
                accessibilityLabel={translate('appShell.navigation.close')}
                accessibilityRole="button"
                onPress={onDismiss}
                style={[
                  styles.closeButton,
                  direction === 'rtl' ? styles.closeButtonRtl : styles.closeButtonLtr,
                  { backgroundColor: theme.colors.surfaces?.page ?? colorTokens.raw["F4F6F5"] }
                ]}
              >
                <Text style={[styles.closeIconText, { color: theme.colors.textPrimary }]}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function shouldDismissMenuSheet(distance: number, velocity: number): boolean {
  return distance > 72 || velocity > 0.8;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  sheet: {
    borderTopLeftRadius: radius.overlay,
    borderTopRightRadius: radius.overlay,
    borderWidth: 1,
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl
  },
  menuSheet: {
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    paddingHorizontal: spacing.lg,
    paddingTop: 0
  },
  sheetHandleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs
  },
  handleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28
  },
  handle: { borderRadius: radius.pill, height: 4, width: 36 },
  header: {
    alignItems: 'stretch',
    justifyContent: 'center',
    minHeight: 48,
    position: 'relative',
    marginBottom: spacing.sm
  },
  title: {
    fontWeight: '700',
    fontSize: 17,
    paddingHorizontal: 48
  },
  menuHeader: { alignItems: 'stretch', justifyContent: 'flex-start', minHeight: 52 },
  menuTitle: { alignSelf: 'stretch', flex: 1, fontSize: 20, lineHeight: 28, paddingHorizontal: 0 },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: 48,
    height: 48,
    borderRadius: 24
  },
  closeButtonLtr: {
    right: 0
  },
  closeButtonRtl: {
    left: 0
  },
  closeIconText: {
    fontSize: 14,
    fontWeight: '700'
  }
});
