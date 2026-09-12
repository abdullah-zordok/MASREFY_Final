import React from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';

import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import { layoutDirectionStyle } from '@/design-system/direction';
import {
  colorTokens,
  elevation,
  radius,
  spacing
} from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import {
  editorialFontFamilyForLocale,
  financialFontFamily
} from '@/design-system/typography';
import { formatMinorAmount } from '@/utils/format-financial-value';
import type { AccountPresentation } from './account-presentation';

const accountIcons: Record<
  AccountPresentation['account']['type'],
  DesignIconName
> = {
  bank: 'account',
  debit_card: 'card',
  credit_card: 'card',
  wallet: 'wallet',
  cash: 'salary',
  savings: 'savings',
  other: 'accounts'
};

export function AccountRow({
  presentation,
  selected = false,
  disabled = false,
  groupedPosition,
  variant,
  onPress
}: {
  presentation: AccountPresentation;
  selected?: boolean;
  disabled?: boolean;
  groupedPosition?: 'first' | 'middle' | 'last' | 'only';
  variant?: 'account-list';
  onPress?: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = usePreferenceStore((state) => state.locale);
  const isRtl = direction === 'rtl';
  const largeText = PixelRatio.getFontScale() >= 1.5;

  const { account, balanceMinor, balanceState, statusLabelKey } = presentation;

  const status = statusLabelKey ? translate(statusLabelKey as never) : null;
  const isDefault =
    statusLabelKey === 'coreFinance.accounts.default' || account.isDefault;

  const balanceLabel =
    balanceState === 'hidden'
      ? translate('designSystem.privacy.hidden')
      : balanceState === 'unknown'
        ? translate('coreFinance.accounts.balanceUnknown')
        : translate('coreFinance.accounts.balanceAvailable');
  const groupedBalance =
    balanceState === 'hidden'
      ? `•••• ${account.currencyCode}`
      : balanceState === 'unknown' || balanceMinor === null
        ? `--.-- ${account.currencyCode}`
        : formatMinorAmount(balanceMinor, account.currencyCode, 'en');

  const typeLabel = translate(
    `coreFinance.accountType.${account.type}` as never
  );
  const accountIdentifier = account.lastFour
    ? `•••• ${account.lastFour}`
    : null;
  const accountIcon = accountIcons[account.type];
  const announcedBalance =
    balanceState === 'confirmed' ? groupedBalance : balanceLabel;

  return (
    <Pressable
      testID="account-row"
      accessibilityLabel={[
        account.name,
        typeLabel,
        accountIdentifier,
        announcedBalance,
        status
      ]
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
            ? theme.colors.surfaces.brandSubtle
            : theme.colors.surfaces.card,
          borderColor: selected
            ? theme.colors.borders.selected
            : theme.colors.borders.subtle,
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
        variant === 'account-list' && styles.accountListCard,
        groupedPosition === 'first' && styles.groupedFirst,
        groupedPosition === 'middle' && styles.groupedMiddle,
        groupedPosition === 'last' && styles.groupedLast,
        groupedPosition === 'only' && styles.groupedOnly,
        pressed &&
          !disabled && {
            backgroundColor: theme.colors.interactions.quietPressed
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
        <View
          testID={`account-row-icon-${accountIcon}`}
          style={[
            styles.iconBadge,
            groupedPosition && styles.groupedIconBadge,
            {
              backgroundColor: theme.colors.surfaces.brandSubtle,
              borderColor: theme.colors.borders.subtle
            }
          ]}
        >
          <DesignIcon
            name={accountIcon}
            size="sm"
            label={account.name}
            color={theme.colors.content.link}
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
              groupedPosition && styles.groupedName,
              {
                color: theme.colors.content.primary,
                fontFamily: groupedPosition
                  ? editorialFontFamilyForLocale(locale, 700)
                  : undefined,
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
              groupedPosition && styles.groupedMeta,
              {
                color: theme.colors.content.secondary,
                fontFamily: groupedPosition
                  ? editorialFontFamilyForLocale(locale, 400)
                  : undefined,
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {typeLabel}
            {accountIdentifier ? (
              <>
                {' · '}
                <Text
                  testID="account-row-meta-identifier"
                  style={styles.ltrText}
                >
                  {accountIdentifier}
                </Text>
              </>
            ) : null}
            {groupedPosition && status ? ` · ${status}` : ''}
          </Text>

          {/* Default account indicator */}
          {!groupedPosition && isDefault ? (
            <Text
              style={[
                styles.defaultLabel,
                {
                  color: theme.colors.content.link,
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.accounts.default')}
            </Text>
          ) : !groupedPosition &&
            status &&
            statusLabelKey !== 'coreFinance.accounts.default' ? (
            <Text
              style={[
                styles.statusLabel,
                {
                  color: theme.colors.status.info,
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

      {variant === 'account-list' ? (
        <DesignIcon
          name="chevronEnd"
          label={account.name}
          color={theme.colors.content.link}
          direction={direction}
          decorative
        />
      ) : null}

      {/* END: Balance & Currency Stack (Visually and vertically centered) */}
      <View
        testID="account-row-balance"
        style={[
          styles.balanceGroup,
          groupedPosition && styles.groupedBalanceGroup,
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
            groupedPosition && styles.groupedBalanceAmount,
            {
              fontFamily: groupedPosition
                ? editorialFontFamilyForLocale(locale, 700)
                : financialFontFamily(700),
              color:
                balanceMinor !== null && balanceMinor < 0
                  ? theme.colors.financial.expense
                  : theme.colors.content.primary,
              textAlign: largeText ? (isRtl ? 'right' : 'left') : 'center'
            }
          ]}
        >
          {groupedBalance}
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
  grouped: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  groupedIconBadge: {
    backgroundColor: colorTokens.raw.E3ECE9,
    borderRadius: 12,
    borderWidth: 0,
    height: 38,
    width: 38
  },
  groupedName: { fontSize: 14, lineHeight: 18 },
  groupedMeta: {
    color: colorTokens.raw['68716C'],
    fontSize: 11,
    lineHeight: 15
  },
  groupedBalanceGroup: { minWidth: 0 },
  groupedBalanceAmount: {
    color: colorTokens.raw['1C3934'],
    fontSize: 13,
    lineHeight: 18
  },
  groupedFirst: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16
  },
  groupedMiddle: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0
  },
  groupedLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0
  },
  groupedOnly: { borderRadius: 16 },
  accountListCard: {
    borderColor: colorTokens.raw.E2E7E3,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    minHeight: 84,
    paddingHorizontal: 12,
    paddingVertical: 10
  }
});
