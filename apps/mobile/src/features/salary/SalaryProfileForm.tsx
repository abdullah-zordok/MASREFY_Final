import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { Toggle } from '@/design-system/components/forms/SelectionControls';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon, type AppIconName } from '@/design-system/icons';
import {
  colorTokens,
  minTouchTarget,
  radius,
  spacing
} from '@/design-system/tokens';
import { minorToMajorAmountText } from '@/domain/currencies';
import { parseAmountToMinor, type Account } from '@/domain/core-finance';
import { useAccounts } from '@/features/core-finance/core-finance-queries';
import {
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { currentLocale, translate } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { usePlanningMutation, useSalaryProfile } from './salary-queries';

type EditableField = 'amount' | 'salaryDay' | 'sourceName' | 'account';

export function SalaryProfileForm() {
  const router = useRouter();
  const accounts = useAccounts();
  const profile = useSalaryProfile();
  const theme = useTheme();
  const storedDirection = usePreferenceStore((state) => state.direction);
  const direction = currentLocale() === 'ar' ? 'rtl' : storedDirection;
  const baseCurrencyCode = usePreferenceStore(
    (state) => state.baseCurrencyCode
  );
  const [amount, setAmount] = useState('');
  const [salaryDay, setSalaryDay] = useState('1');
  const [sourceName, setSourceName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [automaticDetectionEnabled, setAutomaticDetectionEnabled] =
    useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const currencyCode =
    accounts.data?.find((account: Account) => account.id === accountId)
      ?.currencyCode ??
    profile.data?.currencyCode ??
    baseCurrencyCode;
  const selectedAccount = accounts.data?.find(
    (account: Account) => account.id === (accountId || accounts.data?.[0]?.id)
  );
  const amountMinor = parseAmountToMinor(amount, currencyCode);
  const amountDisplay = amountMinor
    ? formatMinorAmount(amountMinor, currencyCode, currentLocale()).replace(
        '\u00a0',
        ' '
      )
    : `${amount || '0'} ${currencyCode}`;
  const save = usePlanningMutation(
    (input: Parameters<typeof financialPlanningService.saveSalaryProfile>[0]) =>
      financialPlanningService.saveSalaryProfile(
        input,
        `salary-profile:${Date.now()}`
      )
  );

  useEffect(() => {
    if (!profile.data) return;
    setAmount(
      minorToMajorAmountText(
        profile.data.expectedAmountMinor,
        profile.data.currencyCode
      )
    );
    setSalaryDay(String(profile.data.salaryDay));
    setSourceName(profile.data.sourceName);
    setAccountId(profile.data.receivingAccountId ?? '');
    setAutomaticDetectionEnabled(profile.data.automaticDetectionEnabled);
  }, [profile.data]);

  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: 'planning-form-salary',
    kind: 'salary',
    entityId: null,
    payload: {
      amount,
      salaryDay,
      sourceName,
      accountId,
      automaticDetectionEnabled
    },
    meaningful: Boolean(amount || sourceName || accountId),
    enabled: !profile.isLoading && !profile.isError,
    restore: (payload) => {
      const draft = payload as Partial<{
        amount: string;
        salaryDay: string;
        sourceName: string;
        accountId: string;
        automaticDetectionEnabled: boolean;
      }>;
      if (typeof draft.amount === 'string') setAmount(draft.amount);
      if (typeof draft.salaryDay === 'string') setSalaryDay(draft.salaryDay);
      if (typeof draft.sourceName === 'string') setSourceName(draft.sourceName);
      if (typeof draft.accountId === 'string') setAccountId(draft.accountId);
      if (typeof draft.automaticDetectionEnabled === 'boolean')
        setAutomaticDetectionEnabled(draft.automaticDetectionEnabled);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const submit = () => {
    const expectedAmountMinor = parseAmountToMinor(amount, currencyCode);
    const day = Number(salaryDay);
    const receivingAccountId = accountId || accounts.data?.[0]?.id;
    if (
      !expectedAmountMinor ||
      day < 1 ||
      day > 31 ||
      !sourceName.trim() ||
      !receivingAccountId
    ) {
      setError(translate('planning.validation.required'));
      return;
    }
    setError(undefined);
    save.mutate(
      {
        expectedAmountMinor,
        currencyCode,
        salaryDay: day,
        sourceName: sourceName.trim(),
        receivingAccountId,
        automaticDetectionEnabled
      },
      {
        onSuccess: () => {
          setSaved(true);
          void discardDraft();
        },
        onError: () => setError(translate('planning.state.error'))
      }
    );
  };

  const toggleField = (field: EditableField) =>
    setEditingField((current) => (current === field ? null : field));

  return (
    <PlanningScreen
      backgroundColor={theme.colors.surfaces.page}
      hideHeader
      titleKey="planning.salary.setup"
    >
      {accounts.isLoading || profile.isLoading || !draftReady ? (
        <PlanningState state="loading" />
      ) : accounts.isError || profile.isError ? (
        <PlanningState
          state="error"
          onRetry={() => {
            void accounts.refetch();
            void profile.refetch();
          }}
        />
      ) : (
        <>
          <View style={[styles.header, { direction }]}>
            <Pressable
              accessibilityLabel={translate('common.back')}
              accessibilityRole="button"
              onPress={() => router.back()}
              style={[
                styles.backButton,
                styles.backAtStart
              ]}
            >
              <DesignIcon name="back" decorative direction={direction} size="lg" />
            </Pressable>
            <StyledText
              accessibilityRole="header"
              style={styles.title}
              variant="headline"
            >
              {translate('planning.salary.setup')}
            </StyledText>
          </View>

          <View
            style={[
              styles.subtitleBand,
              { backgroundColor: theme.colors.surfaceMuted }
            ]}
          >
            <StyledText
              style={[
                styles.subtitle,
                {
                  color: theme.colors.content.secondary,
                  textAlign: 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translate('planning.salary.setupSubtitle')}
            </StyledText>
          </View>

          <SurfaceCard style={[styles.profileCard, { direction }]}>
            <SalarySettingRow
              direction={direction}
              expanded={editingField === 'amount'}
              icon="wallet"
              iconBackground={colorTokens.raw.E7F3EF}
              iconColor={colorTokens.financial.income}
              label={translate('planning.salary.amount')}
              onPress={() => toggleField('amount')}
              value={amountDisplay}
              valueDirection="ltr"
            >
              <FormField
                autoFocus
                helperText={currencyCode}
                label={translate('planning.salary.amount')}
                labelPlacement="accessibility-only"
                onChangeText={setAmount}
                style={{ textAlign: direction === 'rtl' ? 'right' : 'left' }}
                value={amount}
                variant="amount"
              />
            </SalarySettingRow>
            <RowDivider />
            <SalarySettingRow
              direction={direction}
              expanded={editingField === 'salaryDay'}
              icon="calendar"
              iconBackground={colorTokens.raw.EAF2FB}
              iconColor={colorTokens.financial.transfer}
              label={translate('planning.salary.day')}
              onPress={() => toggleField('salaryDay')}
              value={salaryDay}
              valueDirection="ltr"
            >
              <FormField
                autoFocus
                helperText={translate('planning.salary.dayHelper')}
                label={translate('planning.salary.day')}
                labelPlacement="accessibility-only"
                onChangeText={setSalaryDay}
                style={{ textAlign: direction === 'rtl' ? 'right' : 'left' }}
                value={salaryDay}
                variant="amount"
              />
            </SalarySettingRow>
            <RowDivider />
            <SalarySettingRow
              direction={direction}
              expanded={editingField === 'sourceName'}
              icon="work"
              iconBackground={colorTokens.raw.FFF3E8}
              iconColor={colorTokens.raw.D97706}
              label={translate('planning.salary.source')}
              onPress={() => toggleField('sourceName')}
              value={sourceName}
              valueDirection={direction}
            >
              <FormField
                autoFocus
                label={translate('planning.salary.source')}
                labelPlacement="accessibility-only"
                onChangeText={setSourceName}
                style={{
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction
                }}
                value={sourceName}
              />
            </SalarySettingRow>
            <RowDivider />
            <SalarySettingRow
              direction={direction}
              expanded={editingField === 'account'}
              icon="account"
              iconBackground={colorTokens.raw.F3EEF9}
              iconColor={colorTokens.raw['68469C']}
              label={translate('planning.salary.account')}
              onPress={() => toggleField('account')}
              value={
                selectedAccount?.name ?? translate('reports.state.unavailable')
              }
              valueDirection={direction}
            >
              <InlineAccountOptions
                accounts={accounts.data ?? []}
                direction={direction}
                selectedId={accountId || accounts.data?.[0]?.id}
                onSelect={(account) => {
                  setAccountId(account.id);
                  setEditingField(null);
                }}
              />
            </SalarySettingRow>
            <RowDivider />
            <View
              style={styles.switchRow}
            >
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colorTokens.raw.FFF8E7 }
                ]}
              >
                <DesignIcon
                  name="bolt"
                  decorative
                  color={colorTokens.raw.C69214}
                  size="lg"
                />
              </View>
              <View
                style={[
                  styles.switchCopy,
                  { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }
                ]}
              >
                <StyledText
                  style={[
                    styles.switchLabel,
                    { textAlign: 'left', writingDirection: direction }
                  ]}
                  variant="subtitle"
                >
                  {translate('planning.salary.automaticDetection')}
                </StyledText>
                <StyledText
                  style={{
                    color: theme.colors.content.secondary,
                    textAlign: 'left',
                    writingDirection: direction
                  }}
                  variant="caption"
                >
                  {translate('planning.salary.automaticDetectionSubtitle')}
                </StyledText>
              </View>
              <Toggle
                accessibilityLabel={translate(
                  'planning.salary.automaticDetection'
                )}
                onValueChange={setAutomaticDetectionEnabled}
                value={automaticDetectionEnabled}
              />
            </View>
          </SurfaceCard>

          {error ? (
            <StyledText
              accessibilityRole="alert"
              style={{ color: theme.colors.status.danger }}
            >
              {error}
            </StyledText>
          ) : null}
          <ActionButton
            label={translate('planning.action.save')}
            loading={save.isPending}
            onPress={submit}
            style={[
              styles.saveButton,
              {
                backgroundColor: colorTokens.raw['00B8A6'],
                borderColor: colorTokens.raw['00B8A6']
              }
            ]}
          />
          {saved ? (
            <StyledText
              accessibilityRole="alert"
              style={{ color: theme.colors.status.success }}
            >
              {translate('planning.state.saved')}
            </StyledText>
          ) : null}
        </>
      )}
    </PlanningScreen>
  );
}

function SalarySettingRow({
  direction,
  expanded,
  icon,
  iconBackground,
  iconColor,
  label,
  value,
  valueDirection,
  onPress,
  children
}: {
  direction: 'ltr' | 'rtl';
  expanded: boolean;
  icon: AppIconName;
  iconBackground: string;
  iconColor: string;
  label: string;
  value: string;
  valueDirection: 'ltr' | 'rtl';
  onPress: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const rtl = direction === 'rtl';
  return (
    <View>
      <Pressable
        accessibilityLabel={`${label} ${value}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.settingRow,
          { direction },
          expanded && { backgroundColor: colorTokens.teal[50] },
          pressed && { backgroundColor: theme.colors.surfaceMuted }
        ]}
      >
        <View style={[styles.iconBadge, { backgroundColor: iconBackground }]}>
          <DesignIcon name={icon} decorative color={iconColor} size="lg" />
        </View>
        <View style={styles.rowContent}>
          <StyledText
            style={[
              styles.rowLabel,
              {
                textAlign: 'left',
                writingDirection: direction
              }
            ]}
            variant="subtitle"
          >
            {label}
          </StyledText>
          <StyledText
            adjustsFontSizeToFit
            numberOfLines={1}
            style={[
              styles.rowValue,
              {
                textAlign: rtl ? 'left' : 'right',
                writingDirection: valueDirection
              }
            ]}
            variant="subtitle"
          >
            {value}
          </StyledText>
        </View>
        <DesignIcon
          name="chevronDown"
          decorative
          color={theme.colors.content.secondary}
          style={expanded ? styles.expandedChevron : undefined}
        />
      </Pressable>
      {expanded ? (
        <View style={[styles.inlineEditor, { direction }]}>{children}</View>
      ) : null}
    </View>
  );
}

function RowDivider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;
}

function InlineAccountOptions({
  accounts,
  direction,
  selectedId,
  onSelect
}: {
  accounts: Account[];
  direction: 'ltr' | 'rtl';
  selectedId?: string;
  onSelect: (account: Account) => void;
}) {
  const theme = useTheme();
  return (
    <View>
      {accounts
        .filter((account) => account.status === 'active')
        .map((account, index) => {
          const selected = account.id === selectedId;
          return (
            <Pressable
              key={account.id}
              accessibilityLabel={`${account.name}, ${account.currencyCode}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onSelect(account)}
              style={({ pressed }) => [
                styles.accountOption,
                { direction },
                index > 0 && {
                  borderTopColor: theme.colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth
                },
                pressed && { backgroundColor: theme.colors.surfaceMuted }
              ]}
            >
              <View style={styles.accountOptionCopy}>
                <StyledText
                  style={{ textAlign: 'left', writingDirection: direction }}
                  variant="subtitle"
                >
                  {account.name}
                </StyledText>
                <StyledText
                  style={{ color: theme.colors.content.secondary }}
                  variant="caption"
                >
                  {account.currencyCode}
                </StyledText>
              </View>
              {selected ? (
                <DesignIcon
                  name="checkCircle"
                  decorative
                  color={colorTokens.raw['00B8A6']}
                />
              ) : null}
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    paddingTop: spacing.sm
  },
  title: { alignSelf: 'flex-start' },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: minTouchTarget
  },
  backAtStart: { alignSelf: 'flex-start' },
  subtitleBand: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  subtitle: { fontSize: 16, lineHeight: 26 },
  profileCard: {
    borderRadius: radius.card,
    overflow: 'hidden',
    padding: 0
  },
  settingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  iconBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 54,
    justifyContent: 'center',
    width: 54
  },
  rowContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between'
  },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 21 },
  rowValue: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: '42%'
  },
  expandedChevron: { transform: [{ rotate: '180deg' }] },
  inlineEditor: {
    backgroundColor: colorTokens.teal[50],
    borderTopColor: colorTokens.teal[100],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm
  },
  accountOption: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  accountOptionCopy: { gap: spacing.xs },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 98,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs
  },
  switchLabel: { fontSize: 15, lineHeight: 22 },
  saveButton: {
    borderRadius: radius.pill,
    minHeight: 62,
    marginTop: 'auto'
  }
});
