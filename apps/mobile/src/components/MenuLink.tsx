/**
/**
 * MenuLink — a tappable list row for the validation menu.
 *
 * Enforces the 44x44 minimum touch target (Constitution Principle III,
 * UI Contract §8) and uses semantic tokens only.
 */

import React, { forwardRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityProps
} from 'react-native';

import { useTheme } from '@/state/theme-context';
import { StyledText } from './StyledText';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import { minTouchTarget, radius, spacing } from '@/design-system/tokens';
import { usePreferenceStore } from '@/state/preferences';

export interface MenuLinkProps extends AccessibilityProps {
  label: string;
  onPress?: () => void;
  icon?: DesignIconName;
  iconBackground?: string;
  iconColor?: string;
  subtitle?: string;
  showChevron?: boolean;
  accessory?: ReactNode;
  hideBorder?: boolean;
}

export const MenuLink = forwardRef<View, MenuLinkProps>(function MenuLink(
  {
    label,
    onPress,
    icon,
    iconBackground,
    iconColor,
    subtitle,
    showChevron = false,
    accessory,
    hideBorder = false,
    ...a11y
  },
  ref
) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      {...a11y}
      accessibilityRole="link"
      accessibilityLabel={a11y.accessibilityLabel ?? (subtitle ? `${label}, ${subtitle}` : label)}
      style={({ pressed }) => [
        styles.row,
        styles.physicalLtr,
        {
          backgroundColor: hideBorder ? 'transparent' : theme.colors.surface,
          borderColor: hideBorder ? 'transparent' : theme.colors.border,
          borderWidth: hideBorder ? 0 : StyleSheet.hairlineWidth,
          borderRadius: hideBorder ? 0 : radius.control,
          flexDirection: isRtl ? 'row-reverse' : 'row',
          minHeight: Math.max(48, minTouchTarget)
        },
        pressed && { backgroundColor: theme.colors.surfaceMuted }
      ]}
    >
      {icon ? (
        iconBackground ? (
          <View style={[styles.iconBadge, { backgroundColor: iconBackground }]}>
            <DesignIcon
              name={icon}
              label={label}
              color={iconColor ?? theme.colors.primary}
              direction={direction}
              decorative
              size="control"
            />
          </View>
        ) : (
          <DesignIcon
            name={icon}
            label={label}
            color={iconColor ?? theme.colors.primary}
            direction={direction}
            decorative
          />
        )
      ) : null}
      <View
        testID="menu-link-text"
        style={[
          styles.textContainer,
          { alignItems: isRtl ? 'flex-end' : 'flex-start' }
        ]}
      >
        <StyledText
          accessible={false}
          style={[styles.label, { textAlign: isRtl ? 'right' : 'left' }]}
        >
          {label}
        </StyledText>
        {subtitle ? (
          <StyledText
            accessible={false}
            style={[
              styles.subtitle,
              {
                color: theme.colors.content.secondary,
                textAlign: isRtl ? 'right' : 'left'
              }
            ]}
          >
            {subtitle}
          </StyledText>
        ) : null}
      </View>
      {accessory}
      {showChevron ? (
        <DesignIcon
          name="chevronEnd"
          label={label}
          color={theme.colors.textSecondary}
          direction={direction}
          decorative
        />
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.md
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center'
  },
  textContainer: {
    flex: 1
  },
  label: {
    fontSize: 15,
    fontWeight: '600'
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2
  }
});
