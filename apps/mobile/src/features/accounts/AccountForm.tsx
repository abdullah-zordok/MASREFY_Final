import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { layoutDirectionStyle } from '@/design-system/direction';
import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { DesignIcon } from '@/design-system/icons';
import { spacing } from '@/design-system/tokens';
import {
  parseAmountToMinor,
  type Account,
  type AccountType
} from '@/domain/core-finance';
import { minorToMajorAmountText } from '@/domain/currencies';
import { translate, translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { invalidateCoreFinanceScopes } from '@/features/core-finance/core-finance-queries';

import { AccountTypeHeroCard } from './AccountTypeHeroCard';
import { AccountSettingCard } from './AccountSettingCard';
import { CardEducationCard } from './CardEducationCard';
import { CurrencyPickerSheet } from './CurrencyPickerSheet';
import { CurrencyRow } from './CurrencyRow';
import { colorTokens } from '@/design-system/tokens';
import { useDraftNavigationGuard } from '@/features/shell/useDraftNavigationGuard';

export function AccountForm({
  account,
  initialType = 'bank',
  onBack
}: {
  account?: Account;
  initialType?: AccountType;
  onBack?: () => void;
}) {
  const client = useQueryClient();
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = usePreferenceStore((state) => state.locale);
  const baseCurrencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const isRtl = direction === 'rtl';

  const t = (key: string) => translateDynamic(key, {}, locale);

  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(
    account?.type ?? initialType ?? 'bank'
  );
  const [currency, setCurrency] = useState(
    account?.currencyCode ?? baseCurrencyCode
  );
  const [balance, setBalance] = useState(
    account
      ? minorToMajorAmountText(account.openingBalanceMinor, account.currencyCode)
      : '0'
  );
  const [creditLimit, setCreditLimit] = useState(
    account?.creditLimitMinor
      ? minorToMajorAmountText(account.creditLimitMinor, account.currencyCode)
      : ''
  );
  const [lastFour, setLastFour] = useState(account?.lastFour ?? '');
  const [isDefault, setDefault] = useState(account?.isDefault ?? false);

  const [currencySheetVisible, setCurrencySheetVisible] = useState(false);
  const [error, setError] = useState<string>();
  const [errorField, setErrorField] = useState<
    'name' | 'balance' | 'creditLimit' | 'form'
  >();
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(account);
  const isCreditCard = type === 'credit_card';
  const isCash = type === 'cash';

  const dirty =
    name !== (account?.name ?? '') ||
    type !== (account?.type ?? initialType ?? 'bank') ||
    currency !== (account?.currencyCode ?? baseCurrencyCode) ||
    balance !==
      (account
        ? minorToMajorAmountText(account.openingBalanceMinor, account.currencyCode)
        : '0') ||
    creditLimit !==
      (account?.creditLimitMinor
        ? minorToMajorAmountText(account.creditLimitMinor, account.currencyCode)
        : '') ||
    isDefault !== (account?.isDefault ?? false) ||
    lastFour !== (account?.lastFour ?? '');

  useEffect(() => {
    if (!account) return;
    setName(account.name);
    setType(account.type);
    setCurrency(account.currencyCode);
    setBalance(minorToMajorAmountText(account.openingBalanceMinor, account.currencyCode));
    setCreditLimit(
      account.creditLimitMinor
        ? minorToMajorAmountText(account.creditLimitMinor, account.currencyCode)
        : ''
    );
    setLastFour(account.lastFour ?? '');
    setDefault(account.isDefault);
    setError(undefined);
    setErrorField(undefined);
  }, [account]);

  const close = () => {
    if (onBack) onBack();
    else router.back();
  };
  const { requestClose: handleCancel, leaveAfterSave } =
    useDraftNavigationGuard({
      dirty,
      discard: () => undefined,
      close,
      copy: {
        title: translate('coreFinance.accounts.discardChanges'),
        message: translate('coreFinance.accounts.discardChangesBody'),
        keep: translate('coreFinance.accounts.keepEditing'),
        discard: translate('coreFinance.accounts.discard')
      }
    });

  const handleSave = async () => {
    if (saving) return;
    const openingBalanceMinor = parseAmountToMinor(balance, currency);
    if (!name.trim()) {
      setError(translate('coreFinance.validation.required'));
      setErrorField('name');
      return;
    }
    if (openingBalanceMinor === null) {
      setError(translate('coreFinance.validation.invalid'));
      setErrorField('balance');
      return;
    }

    let creditLimitMinor: number | null = null;
    if (isCreditCard && creditLimit.trim()) {
      creditLimitMinor = parseAmountToMinor(creditLimit, currency);
      if (creditLimitMinor === null) {
        setError(translate('coreFinance.validation.invalid'));
        setErrorField('creditLimit');
        return;
      }
    }

    const input = {
      name: name.trim(),
      type,
      currencyCode: currency.toUpperCase(),
      openingBalanceMinor,
      institution: account?.institution ?? null,
      lastFour: lastFour.trim() ? lastFour.trim().slice(-4) : null,
      creditLimitMinor: creditLimitMinor ?? account?.creditLimitMinor ?? null,
      isDefault,
      notes: account?.notes ?? null
    };

    setSaving(true);
    setError(undefined);
    setErrorField(undefined);

    try {
      const result = account
        ? await coreFinanceService.updateAccount(account.id, input)
        : await coreFinanceService.createAccount(input);
      await invalidateCoreFinanceScopes(client, result.affectedScopes);
      leaveAfterSave(() => router.replace('/accounts'));
    } catch {
      setError(translate('coreFinance.state.error'));
      setErrorField('form');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.screen,
        { backgroundColor: theme.colors.surfaces.page }
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header with Progress Accent Bar and Back Button */}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={handleCancel}
              hitSlop={8}
              style={({ pressed }) => [
                styles.backButton,
                pressed && { opacity: 0.7 }
              ]}
            >
              <DesignIcon
                name="chevronStart"
                label={t('common.back')}
                color={theme.colors.textPrimary}
                size="feature"
                direction={direction}
                decorative
              />
            </Pressable>

            <Text style={[styles.stepLabel, { color: theme.colors.textSecondary }]}>
              {isEditing
                ? t('coreFinance.accounts.edit')
                : t('coreFinance.accounts.step2Of2')}
            </Text>
          </View>
        </View>

        {/* Intro section */}
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
            {isEditing
              ? t('coreFinance.accounts.edit')
              : t('coreFinance.accounts.setup.introTitle')}
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
            {t('coreFinance.accounts.setup.introSubtitle')}
          </StyledText>
        </View>

        {/* Selected Account Type Identity Hero */}
        <AccountTypeHeroCard type={type} />

        {/* Form Fields Container */}
        <View style={styles.formContainer}>
          {/* Account Name */}
          <FormField
            label={t('coreFinance.accounts.name')}
            value={name}
            onChangeText={setName}
            placeholder={
              isCash
                ? t('coreFinance.accounts.setup.nameExample.cash')
                : isCreditCard
                  ? t('coreFinance.accounts.setup.nameExample.credit_card')
                  : t('coreFinance.accounts.setup.nameExample.bank')
            }
            errorText={errorField === 'name' ? error : undefined}
            autoFocus={!isEditing}
          />

          {/* Currency Row */}
          <CurrencyRow
            currencyCode={currency}
            editable={!account}
            onPress={() => setCurrencySheetVisible(true)}
          />

          {/* Opening Balance / Available Balance */}
          <FormField
            label={
              isCreditCard
                ? t('coreFinance.accounts.setup.availableBalance')
                : t('coreFinance.accounts.openingBalance')
            }
            value={balance}
            onChangeText={setBalance}
            variant="amount"
            errorText={errorField === 'balance' ? error : undefined}
          />

          {/* Credit Card Specific Fields */}
          {isCreditCard ? (
            <>
              {/* Credit Limit */}
              <FormField
                label={t('coreFinance.accounts.setup.creditLimit')}
                value={creditLimit}
                onChangeText={setCreditLimit}
                variant="amount"
                errorText={errorField === 'creditLimit' ? error : undefined}
                placeholder={t('common.zeroPlaceholder')}
              />

            </>
          ) : null}

          {/* Bank / Debit / Card Identifier Section */}
          {!isCash ? (
            <View style={styles.sectionGroup}>
              <FormField
                label={t('coreFinance.accounts.setup.lastFour')}
                value={lastFour}
                onChangeText={setLastFour}
                placeholder={t('common.lastFourPlaceholder')}
                maxLength={4}
              />
              <CardEducationCard />
            </View>
          ) : null}

          {/* Settings: Make Default Account */}
          <AccountSettingCard
            icon="check"
            iconBg={colorTokens.raw["EBF5EC"]}
            iconFg={colorTokens.raw["1F7A5A"]}
            title={t('coreFinance.accounts.makeDefault')}
            description={t('coreFinance.accounts.setup.makeDefaultDesc')}
            value={isDefault}
            onValueChange={setDefault}
          />

          {errorField === 'form' && error ? (
            <Text style={styles.formErrorText}>{error}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Pinned Safe-Area Bottom Action Container */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.borders?.subtle ?? colorTokens.raw["E8EFEC"]
          }
        ]}
      >
        <ActionButton
          label={
            isEditing
              ? t('coreFinance.accounts.save')
              : t('coreFinance.accounts.create')
          }
          loading={saving}
          onPress={() => void handleSave()}
        />
      </View>

      {/* Currency Picker Bottom Sheet */}
      <CurrencyPickerSheet
        visible={currencySheetVisible}
        selectedCurrency={currency}
        onSelect={(code) => setCurrency(code)}
        onClose={() => setCurrencySheetVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    display: 'flex',
    writingDirection: 'ltr'
  },
  screen: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 120,
    gap: spacing.lg
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
    width: '100%',
    backgroundColor: colorTokens.raw["103F37"],
    borderRadius: 2
  },
  navRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600'
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
  formContainer: {
    gap: spacing.lg
  },
  sectionGroup: {
    gap: spacing.sm
  },
  formErrorText: {
    color: colorTokens.raw["C04B45"],
    fontSize: 13,
    textAlign: 'center'
  },
  bottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    shadowColor: colorTokens.raw["000"],
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 4
  }
});
