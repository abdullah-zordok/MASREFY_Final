import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { layoutDirectionStyle } from '@/design-system/direction';
import { ActionButton } from '@/design-system/components/ActionButton';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { AppIcon, IconBadge, type AppIconName } from '@/design-system/icons';
import { colorTokens } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

interface TransactionExample {
  amount: string;
  icon: AppIconName;
  merchantKey:
    | 'firstLaunch.merchant.bankSms'
    | 'firstLaunch.merchant.applePay'
    | 'firstLaunch.merchant.transfer';
  source: string;
  tone: 'primary' | 'info' | 'transfer';
}

const examples: readonly TransactionExample[] = [
  {
    amount: 'SAR 126.50',
    icon: 'communication',
    merchantKey: 'firstLaunch.merchant.bankSms',
    source: 'BANK SMS',
    tone: 'primary'
  },
  {
    amount: 'AED 48.00',
    icon: 'card',
    merchantKey: 'firstLaunch.merchant.applePay',
    source: 'APPLE PAY',
    tone: 'info'
  },
  {
    amount: 'SAR 750.00',
    icon: 'transfer',
    merchantKey: 'firstLaunch.merchant.transfer',
    source: 'STC PAY',
    tone: 'transfer'
  }
];

const localeOptions = ['ar', 'en'] as const;
const savedStatusColor = colorTokens.raw['007A3D'];

export function FirstLaunchOnboardingScreen({
  onStart
}: {
  onStart: () => void | Promise<void>;
}) {
  const theme = useTheme();
  const locale = usePreferenceStore((state) => state.locale);
  const setLocale = usePreferenceStore((state) => state.setLocale);
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const textAlign = locale === 'ar' ? 'right' : 'left';
  const cardRadius = Math.round(theme.radius.card * 1.06);
  const controlRadius = Math.round(theme.radius.control * 1.06);

  async function completeOnboarding() {
    setSubmitting(true);
    setSaveFailed(false);
    try {
      await onStart();
    } catch {
      setSaveFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surfaces.page, direction }}
      contentContainerStyle={[
        styles.content,
        {
          backgroundColor: theme.colors.surfaces.page,
          padding: theme.spacing.lg
        }
      ]}
      testID="first-launch-content"
    >
      <View
        testID="first-launch-language"
        style={[
          styles.language,
          {
            backgroundColor: theme.colors.surfaces.brandSubtle,
            borderColor: theme.colors.surfaces.card,
            borderRadius: theme.radius.pill,
            direction: 'rtl',
            minHeight: theme.minTouchTarget,
            alignSelf: locale === 'ar' ? 'flex-start' : 'flex-end'
          }
        ]}
      >
        {localeOptions.map((option) => {
          const selected = option === locale;

          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                if (!selected) void setLocale(option);
              }}
              style={[
                styles.languageOption,
                {
                  backgroundColor: selected
                    ? theme.colors.surfaces.card
                    : 'transparent',
                  borderRadius: theme.radius.pill
                }
              ]}
            >
              <StyledText
                variant="body"
                style={{
                  color: selected
                    ? theme.colors.content.primary
                    : theme.colors.content.secondary,
                  writingDirection: option === 'ar' ? 'rtl' : 'ltr'
                }}
              >
                {translate(`firstLaunch.language.${option}`)}
              </StyledText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.visual}>
        <View style={[styles.cards, { gap: theme.spacing.sm }]}>
          {examples.map((example, index) => (
            <SurfaceCard
              key={example.source}
              testID={`transaction-example-${index + 1}`}
              style={[
                styles.card,
                styles.physicalLtr,
                {
                  backgroundColor: theme.colors.surfaces.card,
                  borderColor: theme.colors.surfaces.card,
                  borderRadius: cardRadius,
                  flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
                  gap: theme.spacing.md,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                  shadowColor: theme.colors.primary
                }
              ]}
            >
              <IconBadge
                decorative
                icon={example.icon}
                label=""
                tone={example.tone}
                size="sm"
              />
              <View
                testID={`transaction-merchant-${index + 1}`}
                style={[
                  styles.merchant,
                  {
                    alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start',
                    gap: theme.spacing.xs
                  }
                ]}
              >
                <StyledText
                  numberOfLines={1}
                  variant="caption"
                  style={{
                    color: theme.colors.content.muted,
                    textAlign,
                    writingDirection: 'ltr'
                  }}
                >
                  {example.source}
                </StyledText>
                <StyledText
                  numberOfLines={1}
                  variant="subtitle"
                  style={{ textAlign, writingDirection: direction }}
                >
                  {translate(example.merchantKey)}
                </StyledText>
              </View>
              <View
                testID={`transaction-amount-${index + 1}`}
                style={[
                  styles.amount,
                  {
                    alignItems: direction === 'rtl' ? 'flex-start' : 'flex-end',
                    gap: theme.spacing.xs
                  }
                ]}
              >
                <StyledText variant="subtitle" style={styles.amountText}>
                  {example.amount}
                </StyledText>
                <View
                  testID={`transaction-saved-status-${index + 1}`}
                  style={[
                    styles.savedStatus,
                    styles.physicalLtr,
                    {
                      flexDirection:
                        direction === 'rtl' ? 'row-reverse' : 'row',
                      gap: theme.spacing.xs
                    }
                  ]}
                >
                  <AppIcon
                    color={savedStatusColor}
                    decorative
                    name="check"
                    size="xs"
                    testID={`transaction-saved-check-${index + 1}`}
                  />
                  <StyledText
                    accessibilityLabel={translate(
                      'firstLaunch.savedAutomatically'
                    )}
                    numberOfLines={1}
                    variant="caption"
                    style={{
                      color: savedStatusColor,
                      textAlign,
                      writingDirection: direction
                    }}
                  >
                    {translate('firstLaunch.savedAutomatically')}
                  </StyledText>
                </View>
              </View>
            </SurfaceCard>
          ))}
        </View>
      </View>

      <View
        testID="first-launch-copy"
        style={[
          styles.copy,
          styles.physicalLtr,
          {
            alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start',
            gap: theme.spacing.md
          }
        ]}
      >
        <StyledText
          variant="headline"
          style={{ textAlign, writingDirection: direction }}
        >
          {translate('firstLaunch.headline')}
        </StyledText>
        <StyledText
          variant="body"
          style={{
            color: theme.colors.content.secondary,
            textAlign,
            writingDirection: direction
          }}
        >
          {translate('firstLaunch.supporting')}
        </StyledText>
      </View>

      <View style={styles.startActions}>
        {saveFailed ? (
          <StyledText
            accessibilityRole="alert"
            style={{ color: theme.colors.status.danger, textAlign }}
          >
            {translate('appShell.error.persistenceFailed')}
          </StyledText>
        ) : null}
        <ActionButton
          label={translate('firstLaunch.cta')}
          loading={submitting}
          onPress={() => void completeOnboarding()}
          style={{
            borderRadius: controlRadius,
            minHeight: theme.spacing.xxl + theme.spacing.xl
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-between'
  },
  language: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center'
  },
  languageOption: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  visual: {
    alignItems: 'center',
    marginVertical: 16
  },
  cards: {
    alignItems: 'center',
    width: '100%'
  },
  card: {
    alignItems: 'center',
    flexDirection: 'row',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
    width: '90%'
  },
  merchant: {
    flex: 1
  },
  amount: {
    flexShrink: 0
  },
  amountText: {
    writingDirection: 'ltr'
  },
  savedStatus: {
    alignItems: 'center',
    flexDirection: 'row'
  },
  startActions: {
    gap: 8
  },
  copy: {
    marginBottom: 24
  }
});
