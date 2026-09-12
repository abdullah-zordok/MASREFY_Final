import React from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import { DesignIcon } from '@/design-system/icons';
import { layoutDirectionStyle } from '@/design-system/direction';
import {
  colorTokens,
  elevation,
  radius,
  spacing
} from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { financialFontFamily } from '@/design-system/typography';
import { formatMinorAmount } from '@/utils/format-financial-value';
import type { AccountPresentation } from './account-presentation';

export function AccountRow({
  presentation,
  selected = false,
  disabled = false,
  groupedPosition,
  onPress
}: {
  presentation: AccountPresentation;
  selected?: boolean;
  disabled?: boolean;
  groupedPosition?: 'first' | 'middle' | 'last' | 'only';
  onPress?: () => void;
}) {
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';
  const largeText = PixelRatio.getFontScale() >= 1.5;

  const { account, balanceMinor, balanceState, identityLine, statusLabelKey } =
    presentation;

  const status = statusLabelKey ? translate(statusLabelKey as never) : null;
  const isDefault =
    statusLabelKey === 'coreFinance.accounts.default' || account.isDefault;

  const balanceLabel =
    balanceState === 'hidden'
      ? translate('designSystem.privacy.hidden')
      : balanceState === 'unknown'
        ? translate('coreFinance.accounts.balanceUnknown')
        : translate('coreFinance.accounts.balanceAvailable');
  // Format formatted balance number
  const formattedBalance =
    balanceState === 'hidden'
      ? '••••••'
      : balanceState === 'unknown' || balanceMinor === null
        ? '--.--'
        : formatMinorAmount(
            Math.abs(balanceMinor),
            account.currencyCode,
            'en'
          ).slice(0, -(account.currencyCode.length + 1));

  // Account type localization
  const typeLabel = translate(
    `coreFinance.accountType.${account.type}` as never
  );
  const accountIdentifier = account.lastFour
    ? `${account.currencyCode} ${account.lastFour}`
    : account.currencyCode;

  return (
    <Pressable
      testID="account-row"
      accessibilityLabel={[account.name, identityLine, balanceLabel, status]
        .filter(Boolean)
        .join(', ')}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: selected
            ? colorTokens.teal['50']
            : groupedPosition
              ? colorTokens.surface.white
              : colorTokens.sand['50'],
          borderColor: selected
            ? colorTokens.teal['700']
            : groupedPosition
              ? colorTokens.border.light
              : colorTokens.sand['400'],
          borderWidth: groupedPosition
            ? StyleSheet.hairlineWidth
            : selected
              ? 1.5
              : 1,
          flexDirection: largeText ? 'column' : isRtl ? 'row-reverse' : 'row',
          opacity: disabled ? 0.56 : 1
        },
        styles.physicalLtr,
        !groupedPosition && elevation.raised,
        groupedPosition && styles.grouped,
        groupedPosition === 'first' && styles.groupedFirst,
        groupedPosition === 'middle' && styles.groupedMiddle,
        groupedPosition === 'last' && styles.groupedLast,
        groupedPosition === 'only' && styles.groupedOnly,
        pressed &&
          !disabled && {
            backgroundColor: colorTokens.sand['200']
          }
      ]}
    >
      {/* START: Account Icon & Identity */}
      <View
        style={[
          styles.identityGroup,
          { flexDirection: isRtl ? 'row-reverse' : 'row' }
        ]}
      >
        {/* Icon badge */}
        <View testID="account-row-icon-accounts" style={styles.iconBadge}>
          <DesignIcon
            name="accounts"
            size="sm"
            label={account.name}
            color={colorTokens.teal['700']}
            direction={direction}
            decorative
          />
        </View>

        {/* Text details */}
        <View
          testID="account-row-details"
          style={[
            styles.identityDetails,
            { alignItems: isRtl ? 'flex-end' : 'flex-start' }
          ]}
        >
          <Text
            numberOfLines={largeText ? undefined : 1}
            style={[
              styles.name,
              {
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {account.name}
          </Text>

          <Text
            numberOfLines={largeText ? undefined : 1}
            style={[
              styles.meta,
              {
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {typeLabel}
            {' · '}
            <Text
              testID="account-row-meta-identifier"
              style={styles.ltrText}
            >
              {accountIdentifier}
            </Text>
          </Text>

          {/* Default account indicator */}
          {isDefault ? (
            <Text
              style={[
                styles.defaultLabel,
                {
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.accounts.default')}
            </Text>
          ) : status && statusLabelKey !== 'coreFinance.accounts.default' ? (
            <Text
              style={[
                styles.statusLabel,
                {
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {status}
            </Text>
          ) : null}
        </View>
      </View>

      {/* END: Balance & Currency Stack (Visually and vertically centered) */}
      <View
        testID="account-row-balance"
        style={[
          styles.balanceGroup,
          {
            alignItems: largeText
              ? isRtl
                ? 'flex-end'
                : 'flex-start'
              : 'center',
            direction: 'ltr',
            marginTop: largeText ? spacing.xs : 0
          }
        ]}
      >
        <Text
          accessibilityLabel={
            balanceState === 'hidden'
              ? translate('designSystem.privacy.hidden')
              : undefined
          }
          style={[
            styles.balanceAmount,
            {
              fontFamily: financialFontFamily(700),
              color:
                balanceMinor !== null && balanceMinor < 0
                  ? colorTokens.financial.expense
                  : colorTokens.ink['900'],
              textAlign: largeText ? (isRtl ? 'right' : 'left') : 'center'
            }
          ]}
        >
          {formattedBalance}
        </Text>

        <Text
          style={[
            styles.currencyCode,
            {
              textAlign: largeText ? (isRtl ? 'right' : 'left') : 'center'
            }
          ]}
        >
          {account.currencyCode}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
  card: {
    alignItems: 'center',
    borderRadius: radius.card,
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  identityGroup: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['100'],
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42
  },
  identityDetails: {
    flex: 1,
    gap: 3
  },
  name: {
    color: colorTokens.ink['900'],
    fontSize: 15.5,
    fontWeight: '700',
    lineHeight: 20
  },
  meta: {
    color: colorTokens.ink['500'],
    fontSize: 12,
    lineHeight: 16
  },
  ltrText: {
    writingDirection: 'ltr'
  },
  defaultLabel: {
    color: colorTokens.teal['700'],
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 15
  },
  statusLabel: {
    color: colorTokens.status.info,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14
  },
  balanceGroup: {
    alignSelf: 'center',
    gap: 2,
    justifyContent: 'center',
    minWidth: 72
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 22
  },
  currencyCode: {
    color: colorTokens.ink['500'],
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16
  },
  grouped: { borderWidth: StyleSheet.hairlineWidth },
  groupedFirst: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg
  },
  groupedMiddle: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0
  },
  groupedLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0
  },
  groupedOnly: { borderRadius: radius.lg }
});
