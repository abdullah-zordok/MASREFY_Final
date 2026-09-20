import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { layoutDirectionStyle } from '@/design-system/direction';
import { StyledText } from '@/components/StyledText';
import { type AppIconName, DesignIcon } from '@/design-system/icons';
import { colorTokens, elevation, radius, spacing } from '@/design-system/tokens';
import type { AccountType } from '@/domain/core-finance';
import { translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

export interface AccountTypeOption {
  type: AccountType;
  titleKey: string;
  descKey: string;
  icon: AppIconName;
  iconBg: string;
  iconFg: string;
}

export const accountTypeOptions: AccountTypeOption[] = [
  {
    type: 'bank',
    titleKey: 'coreFinance.accounts.typeSelect.bank',
    descKey: 'coreFinance.accounts.typeSelect.bank.desc',
    icon: 'wallet',
    iconBg: colorTokens.raw["EBF5EC"],
    iconFg: colorTokens.raw["1F7A5A"]
  },
  {
    type: 'credit_card',
    titleKey: 'coreFinance.accounts.typeSelect.credit_card',
    descKey: 'coreFinance.accounts.typeSelect.credit_card.desc',
    icon: 'card',
    iconBg: colorTokens.raw["EAF4F4"],
    iconFg: colorTokens.raw["227D72"]
  },
  {
    type: 'cash',
    titleKey: 'coreFinance.accounts.typeSelect.cash',
    descKey: 'coreFinance.accounts.typeSelect.cash.desc',
    icon: 'salary',
    iconBg: colorTokens.raw["EBF7EE"],
    iconFg: colorTokens.raw["2E8A57"]
  }
];

export function AccountTypeSelectionScreen({
  onSelectType,
  onClose
}: {
  onSelectType: (type: AccountType) => void;
  onClose?: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = usePreferenceStore((state) => state.locale);
  const isRtl = direction === 'rtl';

  const t = (key: string) => translateDynamic(key, {}, locale);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.stack,
        { backgroundColor: theme.colors.surfaces.page }
      ]}
    >
      {/* Top Header with Progress Accent Bar and Close Button */}
      <View style={styles.topBar}>
        <View
          style={[
            styles.progressBarTrack,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          <View style={styles.progressBarActive} />
        </View>

        <View
          style={[
            styles.navRow,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          {onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && { opacity: 0.7 }
              ]}
            >
              <DesignIcon
                name="close"
                label={t('common.close')}
                color={theme.colors.textPrimary}
                size="feature"
                direction={direction}
                decorative
              />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}

          <Text
            style={[
              styles.stepLabel,
              { color: theme.colors.textSecondary }
            ]}
          >
            {t('coreFinance.accounts.step1Of2')}
          </Text>
        </View>
      </View>

      {/* Main Title & Subtitle */}
      <View
        style={[
          styles.headingSection,
          styles.physicalLtr,
          {
            alignItems: isRtl ? 'flex-end' : 'flex-start',
            alignSelf: 'stretch',
            width: '100%'
          }
        ]}
      >
        <StyledText
          style={[
            styles.mainTitle,
            {
              textAlign: isRtl ? 'right' : 'left',
              writingDirection: direction,
              alignSelf: isRtl ? 'flex-end' : 'flex-start'
            }
          ]}
          variant="subtitle"
        >
          {t('coreFinance.accounts.typeSelect.title')}
        </StyledText>
        <StyledText
          style={[
            styles.subTitle,
            {
              textAlign: isRtl ? 'right' : 'left',
              writingDirection: direction,
              alignSelf: isRtl ? 'flex-end' : 'flex-start'
            }
          ]}
        >
          {t('coreFinance.accounts.typeSelect.subtitle')}
        </StyledText>
      </View>

      {/* List of Account Type Cards */}
      <View style={styles.cardsContainer}>
        {accountTypeOptions.map((option) => {
          const title = t(option.titleKey);
          const desc = t(option.descKey);

          return (
            <Pressable
              key={option.type}
              testID={`account-type-card-${option.type}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${desc}`}
              onPress={() => onSelectType(option.type)}
              style={({ pressed }) => [
                styles.card,
                styles.physicalLtr,
                {
                  backgroundColor: theme.colors.surfaces.card,
                  borderColor: theme.colors.borders.default,
                  flexDirection: isRtl ? 'row-reverse' : 'row'
                },
                pressed && {
                  backgroundColor: theme.colors.surfaceMuted,
                  transform: [{ scale: 0.99 }]
                }
              ]}
            >
              {/* Card Right/Left Content: Icon + Texts */}
              <View
                style={[
                  styles.cardBody,
                  styles.physicalLtr,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' }
                ]}
              >
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: option.iconBg }
                  ]}
                >
                  <DesignIcon
                    name={option.icon}
                    label={title}
                    color={option.iconFg}
                    size="feature"
                    direction={direction}
                    decorative
                  />
                </View>

                <View
                  style={[
                    styles.textContainer,
                    { alignItems: isRtl ? 'flex-end' : 'flex-start' }
                  ]}
                >
                  <StyledText
                    style={[
                      styles.cardTitle,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: direction
                      }
                    ]}
                  >
                    {title}
                  </StyledText>
                  <StyledText
                    style={[
                      styles.cardDesc,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: direction
                      }
                    ]}
                  >
                    {desc}
                  </StyledText>
                </View>
              </View>

              {/* Chevron */}
              <DesignIcon
                name="chevronEnd"
                label={title}
                color={colorTokens.raw["A0A8A4"]}
                size="control"
                direction={direction}
                decorative
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    display: 'flex',
    writingDirection: 'ltr'
  },
  stack: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    minHeight: '100%'
  },
  topBar: {
    gap: spacing.sm
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: colorTokens.raw["E2EAE6"],
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.xs
  },
  progressBarActive: {
    height: '100%',
    width: '45%',
    backgroundColor: colorTokens.raw["103F37"],
    borderRadius: 2
  },
  navRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18
  },
  headingSection: {
    gap: spacing.xs,
    paddingHorizontal: 4
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colorTokens.raw["10231F"]
  },
  subTitle: {
    fontSize: 14,
    color: colorTokens.raw["707870"],
    lineHeight: 20
  },
  cardsContainer: {
    gap: spacing.md
  },
  card: {
    ...elevation.card,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 74
  },
  cardBody: {
    alignItems: 'center',
    gap: spacing.md,
    flex: 1
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  textContainer: {
    flex: 1,
    gap: 3
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colorTokens.raw["10231F"]
  },
  cardDesc: {
    fontSize: 12,
    color: colorTokens.raw["707870"],
    lineHeight: 16
  }
});
