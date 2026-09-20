import React from 'react';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import {
  SymbolView,
  type SymbolViewProps,
  type SymbolWeight
} from 'expo-symbols';
import medium from 'expo-symbols/androidWeights/medium';
import regular from 'expo-symbols/androidWeights/regular';

import type { LayoutDirection } from '@/domain/foundation';
import { useTheme } from '@/state/theme-context';
import { iconSize } from './tokens';

type PlatformIconName = Extract<SymbolViewProps['name'], object>;

export const directionalIconNames = [
  'back',
  'forward',
  'chevronStart',
  'chevronEnd'
] as const;

const appIconMap = {
  back: { ios: 'chevron.backward', android: 'arrow_back', web: 'arrow_back' },
  forward: {
    ios: 'chevron.forward',
    android: 'arrow_forward',
    web: 'arrow_forward'
  },
  chevronStart: {
    ios: 'chevron.backward',
    android: 'chevron_left',
    web: 'chevron_left'
  },
  chevronEnd: {
    ios: 'chevron.forward',
    android: 'chevron_right',
    web: 'chevron_right'
  },
  chevronDown: {
    ios: 'chevron.down',
    android: 'keyboard_arrow_down',
    web: 'keyboard_arrow_down'
  },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  checkCircle: {
    ios: 'checkmark.circle.fill',
    android: 'check_circle',
    web: 'check_circle'
  },
  feedback: {
    ios: 'bubble.left',
    android: 'chat_bubble_outline',
    web: 'chat_bubble_outline'
  },
  assistant: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  save: { ios: 'checkmark.circle', android: 'save', web: 'save' },
  calendar: {
    ios: 'calendar',
    android: 'calendar_month',
    web: 'calendar_month'
  },
  work: { ios: 'briefcase', android: 'work', web: 'work' },
  bolt: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  notifications: {
    ios: 'bell',
    android: 'notifications',
    web: 'notifications'
  },
  edit: { ios: 'pencil', android: 'edit', web: 'edit' },
  trash: { ios: 'trash', android: 'delete', web: 'delete' },
  folder: { ios: 'folder', android: 'folder', web: 'folder' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  more: { ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' },
  home: { ios: 'house', android: 'home', web: 'home' },
  transactions: {
    ios: 'arrow.left.arrow.right',
    android: 'swap_horiz',
    web: 'swap_horiz'
  },
  reports: { ios: 'chart.bar.xaxis', android: 'bar_chart', web: 'bar_chart' },
  wallet: {
    ios: 'wallet.pass',
    android: 'account_balance_wallet',
    web: 'account_balance_wallet'
  },
  account: {
    ios: 'building.columns',
    android: 'account_balance',
    web: 'account_balance'
  },
  accounts: {
    ios: 'wallet.pass',
    android: 'account_balance_wallet',
    web: 'account_balance_wallet'
  },
  card: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  transfer: {
    ios: 'arrow.left.arrow.right',
    android: 'swap_horiz',
    web: 'swap_horiz'
  },
  income: {
    ios: 'arrow.down.circle',
    android: 'arrow_circle_down',
    web: 'arrow_circle_down'
  },
  expense: {
    ios: 'arrow.up.circle',
    android: 'arrow_circle_up',
    web: 'arrow_circle_up'
  },
  salary: { ios: 'banknote', android: 'payments', web: 'payments' },
  budget: { ios: 'chart.pie', android: 'donut_small', web: 'donut_small' },
  savings: { ios: 'target', android: 'track_changes', web: 'track_changes' },
  target: { ios: 'target', android: 'track_changes', web: 'track_changes' },
  goal: { ios: 'target', android: 'track_changes', web: 'track_changes' },
  flag: { ios: 'flag', android: 'flag', web: 'flag' },
  trophy: { ios: 'trophy', android: 'emoji_events', web: 'emoji_events' },
  obligation: { ios: 'doc.text', android: 'assignment', web: 'assignment' },
  bill: { ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' },
  subscription: {
    ios: 'repeat',
    android: 'subscriptions',
    web: 'subscriptions'
  },
  refund: { ios: 'arrow.uturn.backward.circle', android: 'undo', web: 'undo' },
  trendUp: {
    ios: 'chart.line.uptrend.xyaxis',
    android: 'trending_up',
    web: 'trending_up'
  },
  trendDown: {
    ios: 'chart.line.downtrend.xyaxis',
    android: 'trending_down',
    web: 'trending_down'
  },
  food: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  restaurant: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  car: { ios: 'car', android: 'directions_car', web: 'directions_car' },
  transport: { ios: 'car', android: 'directions_car', web: 'directions_car' },
  fuel: {
    ios: 'fuelpump',
    android: 'local_gas_station',
    web: 'local_gas_station'
  },
  shopping: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
  health: {
    ios: 'cross.case',
    android: 'medical_services',
    web: 'medical_services'
  },
  education: { ios: 'graduationcap', android: 'school', web: 'school' },
  entertainment: {
    ios: 'gamecontroller',
    android: 'sports_esports',
    web: 'sports_esports'
  },
  travel: { ios: 'airplane', android: 'flight', web: 'flight' },
  housing: { ios: 'house', android: 'home_work', web: 'home_work' },
  gifts: { ios: 'gift', android: 'redeem', web: 'redeem' },
  receipt: { ios: 'receipt', android: 'receipt_long', web: 'receipt_long' },
  communication: { ios: 'phone', android: 'phone_iphone', web: 'phone_iphone' },
  phone: { ios: 'phone', android: 'phone', web: 'phone' },
  google: {
    ios: 'shield.checkered',
    android: 'account_circle',
    web: 'account_circle'
  },
  charity: {
    ios: 'heart',
    android: 'volunteer_activism',
    web: 'volunteer_activism'
  },
  category: { ios: 'tag', android: 'category', web: 'category' },
  success: {
    ios: 'checkmark.circle',
    android: 'check_circle',
    web: 'check_circle'
  },
  warning: {
    ios: 'exclamationmark.triangle',
    android: 'warning',
    web: 'warning'
  },
  error: { ios: 'xmark.circle', android: 'error', web: 'error' },
  pending: { ios: 'clock', android: 'schedule', web: 'schedule' },
  sync: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' },
  privacy: { ios: 'hand.raised', android: 'privacy_tip', web: 'privacy_tip' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  eyeSlash: {
    ios: 'eye.slash',
    android: 'visibility_off',
    web: 'visibility_off'
  },
  gift: { ios: 'gift', android: 'card_giftcard', web: 'card_giftcard' },
  lock: { ios: 'lock', android: 'lock', web: 'lock' },
  fingerprint: {
    ios: 'touchid',
    android: 'fingerprint',
    web: 'fingerprint'
  },
  faceId: { ios: 'faceid', android: 'face', web: 'face' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  security: {
    ios: 'shield.checkered',
    android: 'verified_user',
    web: 'verified_user'
  },
  tracking: { ios: 'location', android: 'location_on', web: 'location_on' },
  profile: { ios: 'person.crop.circle', android: 'person', web: 'person' },
  voice: { ios: 'mic', android: 'mic', web: 'mic' },
  stop: { ios: 'stop.fill', android: 'stop', web: 'stop' },
  signOut: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout'
  }
} as const satisfies Record<string, PlatformIconName>;

export type AppIconName = keyof typeof appIconMap;
export type DesignIconName = AppIconName;
export type AppIconTone =
  | 'default'
  | 'primary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'income'
  | 'expense'
  | 'transfer';
export type IconBadgeTone = Exclude<AppIconTone, 'default'> | 'neutral';

type IconSize = keyof typeof iconSize;
type AppIconWeight = 'regular' | 'medium';
type IconBadgeSize = 'sm' | 'md' | 'lg';

const iconBadgeSizes: Record<IconBadgeSize, number> = {
  sm: 36,
  md: 44,
  lg: 52
};

const iconBadgeIconSizes: Record<IconBadgeSize, IconSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg'
};

const rtlMaterialIcons: Partial<Record<AppIconName, string>> = {
  back: 'arrow_forward',
  forward: 'arrow_back',
  chevronStart: 'chevron_right',
  chevronEnd: 'chevron_left'
};

const iconWeights: Record<
  AppIconWeight,
  { ios: SymbolWeight; android: typeof regular }
> = {
  regular: { ios: 'regular', android: regular },
  medium: { ios: 'medium', android: medium }
};

interface AppIconBaseProps {
  name: AppIconName;
  size?: IconSize;
  tone?: AppIconTone;
  weight?: AppIconWeight;
  color?: string;
  direction?: LayoutDirection;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

type AppIconAccessibilityProps =
  { decorative: true; label?: string } | { decorative?: false; label: string };

export type AppIconProps = AppIconBaseProps & AppIconAccessibilityProps;

export interface IconBadgeProps {
  icon: AppIconName;
  label: string;
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
  shape?: 'rounded' | 'circle';
  testID?: string;
  decorative?: boolean;
}

function iconName(
  name: AppIconName,
  direction: LayoutDirection
): PlatformIconName {
  const mappedName = appIconMap[name] ?? appIconMap.category;
  const rtlName = direction === 'rtl' ? rtlMaterialIcons[name] : undefined;
  if (!rtlName) return mappedName;
  return { ...mappedName, android: rtlName, web: rtlName } as PlatformIconName;
}

export function AppIcon({
  name,
  label,
  size = 'md',
  tone = 'default',
  weight = 'regular',
  color,
  direction = 'ltr',
  testID,
  style,
  decorative = false
}: AppIconProps) {
  const theme = useTheme();
  const resolvedSize = iconSize[size];
  const toneColors: Record<AppIconTone, string> = {
    default: theme.colors.content.primary,
    primary: theme.colors.primary,
    accent: theme.colors.accent,
    success: theme.colors.status.success,
    warning: theme.colors.status.warning,
    danger: theme.colors.status.danger,
    info: theme.colors.status.info,
    income: theme.colors.financial.income,
    expense: theme.colors.financial.expense,
    transfer: theme.colors.financial.transfer
  };

  return (
    <View
      testID={testID}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : label}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityElementsHidden={decorative || undefined}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={[{ height: resolvedSize, width: resolvedSize }, style]}
    >
      <SymbolView
        testID={testID ? `${testID}-symbol` : undefined}
        name={iconName(name, direction)}
        size={resolvedSize}
        tintColor={color ?? toneColors[tone]}
        type="monochrome"
        weight={iconWeights[weight]}
      />
    </View>
  );
}

export function IconBadge({
  icon,
  label,
  tone = 'primary',
  size = 'md',
  shape = 'rounded',
  testID,
  decorative = false
}: IconBadgeProps) {
  const theme = useTheme();
  const badgeSize = iconBadgeSizes[size];
  const colors = theme.colors.iconBadges[tone];

  return (
    <View
      testID={testID}
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : label}
      accessibilityRole={decorative ? undefined : 'image'}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={[
        styles.iconBadge,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderRadius: shape === 'circle' ? badgeSize / 2 : 12,
          height: badgeSize,
          width: badgeSize
        }
      ]}
    >
      <AppIcon
        name={icon}
        label=""
        size={iconBadgeIconSizes[size]}
        color={colors.foreground}
        weight="medium"
        decorative
      />
    </View>
  );
}

export const DesignIcon = AppIcon;

const styles = StyleSheet.create({
  iconBadge: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center'
  }
});
