import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';

import { layoutDirectionStyle } from '@/design-system/direction';
import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import { minorToMajorAmountText } from '@/domain/currencies';
import { parseAmountToMinor, type Account } from '@/domain/core-finance';
import type { LocalDate, Obligation } from '@/domain/financial-planning';
import { useAccounts } from '@/features/core-finance/core-finance-queries';
import { PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { AccountPicker } from '@/features/transactions/AccountPicker';
import { translate, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { useObligation, usePlanningMutation } from './obligation-queries';

const obligationTypes: Obligation['type'][] = [
  'car_installment',
  'personal_loan',
  'rent',
  'subscription',
  'debt',
  'custom'
];
const scheduleKinds: Obligation['scheduleKind'][] = [
  'fixed_term',
  'open_ended',
  'irregular'
];

export function ObligationForm({
  obligationId = '',
  onBack
}: {
  obligationId?: string;
  onBack?: () => void;
}) {
  const theme = useTheme();
  const directionPref = usePreferenceStore((state) => state.direction);
  const isRtl = directionPref === 'rtl';
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);

  const existing = useObligation(obligationId);
  const accounts = useAccounts();
  const owningCurrencyCode =
    existing.data?.obligation.currencyCode ?? currencyCode;

  const [direction, setDirection] = useState<Obligation['direction']>('payable');
  const [type, setType] = useState<Obligation['type']>('car_installment');
  const [scheduleKind, setScheduleKind] =
    useState<Obligation['scheduleKind']>('fixed_term');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [total, setTotal] = useState('');
  const [installment, setInstallment] = useState('');
  const [count, setCount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [accountId, setAccountId] = useState('');
  const [automaticMatchingEnabled, setAutomaticMatchingEnabled] =
    useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const save = usePlanningMutation(
    (input: Parameters<typeof financialPlanningService.createObligation>[0]) =>
      existing.data
        ? financialPlanningService.updateObligation(
            obligationId,
            existing.data.obligation.version,
            input,
            `obligation:${obligationId}:${Date.now()}`
          )
        : financialPlanningService.createObligation(
            input,
            `obligation:new:${Date.now()}`
          )
  );

  useEffect(() => {
    const item = existing.data?.obligation;
    if (!item) return;
    setDirection(item.direction);
    setType(item.type);
    setScheduleKind(item.scheduleKind);
    setTitle(item.title);
    setProvider(item.provider ?? '');
    setTotal(
      item.contractedTotalMinor === null
        ? ''
        : minorToMajorAmountText(
            item.contractedTotalMinor,
            item.currencyCode
          )
    );
    setInstallment(
      item.installmentAmountMinor === null
        ? ''
        : minorToMajorAmountText(
            item.installmentAmountMinor,
            item.currencyCode
          )
    );
    setCount(item.installmentCount === null ? '' : String(item.installmentCount));
    setDueDay(String(item.dueDay ?? 1));
    setAccountId(item.fundingAccountId ?? '');
    setAutomaticMatchingEnabled(item.automaticMatchingEnabled);
  }, [existing.data]);

  const draftEnabled = !obligationId || Boolean(existing.data);
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: `planning-form-obligation:${obligationId || 'new'}`,
    kind: 'obligation',
    entityId: obligationId || null,
    payload: {
      direction,
      type,
      scheduleKind,
      title,
      provider,
      total,
      installment,
      count,
      dueDay,
      accountId,
      automaticMatchingEnabled
    },
    meaningful: Boolean(title || provider || total || installment || accountId),
    enabled: draftEnabled,
    restore: (payload) => {
      const draft = payload as Partial<{
        direction: Obligation['direction'];
        type: Obligation['type'];
        scheduleKind: Obligation['scheduleKind'];
        title: string;
        provider: string;
        total: string;
        installment: string;
        count: string;
        dueDay: string;
        accountId: string;
        automaticMatchingEnabled: boolean;
      }>;
      if (draft.direction === 'payable' || draft.direction === 'receivable')
        setDirection(draft.direction);
      if (draft.type && obligationTypes.includes(draft.type)) setType(draft.type);
      if (draft.scheduleKind && scheduleKinds.includes(draft.scheduleKind))
        setScheduleKind(draft.scheduleKind);
      if (typeof draft.title === 'string') setTitle(draft.title);
      if (typeof draft.provider === 'string') setProvider(draft.provider);
      if (typeof draft.total === 'string') setTotal(draft.total);
      if (typeof draft.installment === 'string') setInstallment(draft.installment);
      if (typeof draft.count === 'string') setCount(draft.count);
      if (typeof draft.dueDay === 'string') setDueDay(draft.dueDay);
      if (typeof draft.accountId === 'string') setAccountId(draft.accountId);
      if (typeof draft.automaticMatchingEnabled === 'boolean')
        setAutomaticMatchingEnabled(draft.automaticMatchingEnabled);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const submit = () => {
    const contractedTotalMinor = total
      ? parseAmountToMinor(total, owningCurrencyCode)
      : null;
    const installmentAmountMinor = installment
      ? parseAmountToMinor(installment, owningCurrencyCode)
      : null;
    const installmentCount = count ? Number(count) : null;
    const day = Number(dueDay);
    if (
      !title.trim() ||
      day < 1 ||
      day > 31 ||
      (scheduleKind === 'fixed_term' &&
        (!contractedTotalMinor || !installmentAmountMinor || !installmentCount))
    ) {
      setError(translate('planning.validation.required'));
      return;
    }
    save.mutate(
      {
        direction,
        type,
        scheduleKind,
        title: title.trim(),
        provider: provider.trim() || null,
        currencyCode: owningCurrencyCode,
        contractedTotalMinor,
        openingPaidMinor: existing.data?.obligation.openingPaidMinor ?? 0,
        installmentAmountMinor,
        installmentCount,
        dueDay: day,
        startDate:
          existing.data?.obligation.startDate ??
          (new Date().toISOString().slice(0, 10) as LocalDate),
        endDate: existing.data?.obligation.endDate ?? null,
        fundingAccountId: accountId || accounts.data?.[0]?.id || null,
        automaticMatchingEnabled
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

  if (existing.isError || accounts.isError) {
    return (
      <PlanningScreen
        titleKey={
          obligationId ? 'planning.obligations.edit' : 'planning.obligations.new'
        }
      >
        <PlanningState
          state="error"
          onRetry={() => {
            void existing.refetch();
            void accounts.refetch();
          }}
        />
      </PlanningScreen>
    );
  }

  if (
    (obligationId && existing.isLoading) ||
    accounts.isLoading ||
    (draftEnabled && !draftReady)
  ) {
    return (
      <PlanningScreen
        titleKey={
          obligationId ? 'planning.obligations.edit' : 'planning.obligations.new'
        }
      >
        <PlanningState state="loading" />
      </PlanningScreen>
    );
  }

  const typeLabels = obligationTypes.map((item) =>
    translate(`planning.obligation.type.${item}` as MessageKey)
  );
  const scheduleLabels = scheduleKinds.map((item) =>
    translate(`planning.obligation.schedule.${item}` as MessageKey)
  );

  const selectedAccountId = accountId || accounts.data?.[0]?.id;
  const selectedAccount = accounts.data?.find(
    (acc: Account) => acc.id === selectedAccountId
  );

  const isPayable = direction === 'payable';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.surfaces.page }}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Navigation Bar */}
        <View
          style={[
            styles.headerRow,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('navigation.back')}
            onPress={onBack ?? (() => router.back())}
            style={styles.backButton}
          >
            <DesignIcon
              name="back"
              label={translate('navigation.back')}
              color={theme.colors.textPrimary}
              size="md"
              direction={directionPref}
            />
          </Pressable>

          <StyledText style={styles.headerTitle} variant="title">
            {translate(
              obligationId
                ? 'planning.obligations.edit'
                : 'planning.obligations.new'
            )}
          </StyledText>
          <View style={{ width: 40 }} />
        </View>

        {/* Direction Selector (Payable / Receivable) */}
        <View style={styles.sectionWrapper}>
          <StyledText style={styles.sectionLabel} variant="caption">
            {translate('planning.obligation.direction')}
          </StyledText>
          <View
            style={[
              styles.directionRow,
              styles.physicalLtr,
              { flexDirection: isRtl ? 'row-reverse' : 'row' }
            ]}
          >
            {/* Payable Card */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('planning.obligation.direction.payable')}
              onPress={() => setDirection('payable')}
              style={[
                styles.directionCard,
                isPayable && styles.directionCardActivePayable,
                { backgroundColor: isPayable ? colorTokens.obligationForm.payableSurface : theme.colors.surface }
              ]}
            >
              <View
                style={[
                  styles.directionIconBadge,
                  { backgroundColor: isPayable ? colorTokens.obligationForm.payableBadge : colorTokens.obligationForm.neutralBadge }
                ]}
              >
                <DesignIcon
                  name="expense"
                  label="Payable"
                  color={isPayable ? colorTokens.obligationForm.payableText : colorTokens.ink[500]}
                  size="sm"
                  decorative
                />
              </View>
              <Text
                style={[
                  styles.directionCardText,
                  isPayable && styles.directionCardTextActivePayable
                ]}
              >
                {translate('planning.obligation.direction.payable')}
              </Text>
            </Pressable>

            {/* Receivable Card */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate(
                'planning.obligation.direction.receivable'
              )}
              onPress={() => setDirection('receivable')}
              style={[
                styles.directionCard,
                !isPayable && styles.directionCardActiveReceivable,
                { backgroundColor: !isPayable ? colorTokens.obligationForm.receivableSurface : theme.colors.surface }
              ]}
            >
              <View
                style={[
                  styles.directionIconBadge,
                  { backgroundColor: !isPayable ? colorTokens.obligationForm.receivableBadge : colorTokens.obligationForm.neutralBadge }
                ]}
              >
                <DesignIcon
                  name="income"
                  label="Receivable"
                  color={!isPayable ? colorTokens.obligationForm.receivableText : colorTokens.ink[500]}
                  size="sm"
                  decorative
                />
              </View>
              <Text
                style={[
                  styles.directionCardText,
                  !isPayable && styles.directionCardTextActiveReceivable
                ]}
              >
                {translate('planning.obligation.direction.receivable')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Section 1: نوع الالتزام (Type) */}
        <View style={styles.sectionWrapper}>
          <StyledText style={styles.sectionLabel} variant="caption">
            {translate('planning.obligation.type')}
          </StyledText>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border
              }
            ]}
          >
            <ChipSelector
              options={typeLabels}
              selected={[
                translate(`planning.obligation.type.${type}` as MessageKey)
              ]}
              onToggle={(label) =>
                setType(obligationTypes[typeLabels.indexOf(label)] ?? type)
              }
            />
          </View>
        </View>

        {/* Section 2: بيانات الالتزام (Basic Details) */}
        <View style={styles.sectionWrapper}>
          <StyledText style={styles.sectionLabel} variant="caption">
            {isRtl ? 'البيانات الأساسية' : 'Basic Details'}
          </StyledText>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border
              }
            ]}
          >
            {/* Title Input */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: directionPref
                  }
                ]}
              >
                {translate('planning.obligation.title')}
              </Text>
              <TextInput
                accessibilityLabel={translate('planning.obligation.title')}
                style={[
                  styles.textInput,
                  {
                    borderColor: theme.colors.border,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: directionPref
                  }
                ]}
                placeholder={
                  isRtl
                    ? 'مثال: تمويل سيارة الراجحي'
                    : 'e.g. Car Loan / Apartment Rent'
                }
                placeholderTextColor={colorTokens.obligationForm.placeholder}
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View
              style={[styles.divider, { backgroundColor: theme.colors.border }]}
            />

            {/* Provider Input */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: directionPref
                  }
                ]}
              >
                {translate('planning.obligation.provider')}
              </Text>
              <TextInput
                accessibilityLabel={translate('planning.obligation.provider')}
                style={[
                  styles.textInput,
                  {
                    borderColor: theme.colors.border,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: directionPref
                  }
                ]}
                placeholder={
                  isRtl ? 'الجهة، البنك، أو اسم الشخص' : 'Bank, entity, or person'
                }
                placeholderTextColor={colorTokens.obligationForm.placeholder}
                value={provider}
                onChangeText={setProvider}
              />
            </View>
          </View>
        </View>

        {/* Section 3: جدول الدفع والمبالغ (Schedule & Amounts) */}
        <View style={styles.sectionWrapper}>
          <StyledText style={styles.sectionLabel} variant="caption">
            {translate('planning.obligation.schedule')}
          </StyledText>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border
              }
            ]}
          >
            <ChipSelector
              options={scheduleLabels}
              selected={[
                translate(
                  `planning.obligation.schedule.${scheduleKind}` as MessageKey
                )
              ]}
              onToggle={(label) =>
                setScheduleKind(
                  scheduleKinds[scheduleLabels.indexOf(label)] ?? scheduleKind
                )
              }
            />

            {scheduleKind === 'fixed_term' ? (
              <>
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: theme.colors.border }
                  ]}
                />

                {/* Total Contracted Amount */}
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      styles.inputLabel,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: directionPref
                      }
                    ]}
                  >
                    {translate('planning.obligation.total')}
                  </Text>
                  <View
                    style={[
                      styles.amountInputRow,
                      styles.physicalLtr,
                      {
                        borderColor: theme.colors.border,
                        flexDirection: isRtl ? 'row-reverse' : 'row'
                      }
                    ]}
                  >
                    <View style={styles.currencyBadge}>
                      <Text style={styles.currencyBadgeText}>
                        {owningCurrencyCode}
                      </Text>
                    </View>
                    <TextInput
                      accessibilityLabel={translate('planning.obligation.total')}
                      style={[
                        styles.amountInput,
                        {
                          textAlign: isRtl ? 'right' : 'left',
                          writingDirection: directionPref
                        }
                      ]}
                      placeholder={translate('common.amountPlaceholder')}
                      placeholderTextColor={colorTokens.obligationForm.placeholder}
                      keyboardType="numeric"
                      value={total}
                      onChangeText={setTotal}
                    />
                  </View>
                </View>

                {/* Installment Amount */}
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      styles.inputLabel,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: directionPref
                      }
                    ]}
                  >
                    {translate('planning.obligation.installment')}
                  </Text>
                  <View
                    style={[
                      styles.amountInputRow,
                      styles.physicalLtr,
                      {
                        borderColor: theme.colors.border,
                        flexDirection: isRtl ? 'row-reverse' : 'row'
                      }
                    ]}
                  >
                    <View style={styles.currencyBadge}>
                      <Text style={styles.currencyBadgeText}>
                        {owningCurrencyCode}
                      </Text>
                    </View>
                    <TextInput
                      accessibilityLabel={translate(
                        'planning.obligation.installment'
                      )}
                      style={[
                        styles.amountInput,
                        {
                          textAlign: isRtl ? 'right' : 'left',
                          writingDirection: directionPref
                        }
                      ]}
                      placeholder={translate('common.amountPlaceholder')}
                      placeholderTextColor={colorTokens.obligationForm.placeholder}
                      keyboardType="numeric"
                      value={installment}
                      onChangeText={setInstallment}
                    />
                  </View>
                </View>

                {/* Installment Count */}
                <View style={styles.fieldGroup}>
                  <Text
                    style={[
                      styles.inputLabel,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: directionPref
                      }
                    ]}
                  >
                    {translate('planning.obligation.count')}
                  </Text>
                  <TextInput
                    accessibilityLabel={translate('planning.obligation.count')}
                    style={[
                      styles.textInput,
                      {
                        borderColor: theme.colors.border,
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: directionPref
                      }
                    ]}
                    placeholder={translate('common.installmentCountPlaceholder')}
                    placeholderTextColor={colorTokens.obligationForm.placeholder}
                    keyboardType="number-pad"
                    value={count}
                    onChangeText={setCount}
                  />
                </View>
              </>
            ) : null}

            <View
              style={[styles.divider, { backgroundColor: theme.colors.border }]}
            />

            {/* Due Day */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: directionPref
                  }
                ]}
              >
                {translate('planning.obligation.dueDay')}
              </Text>
              <View
                style={[
                  styles.dueDayRow,
                  styles.physicalLtr,
                  {
                    borderColor: theme.colors.border,
                    flexDirection: isRtl ? 'row-reverse' : 'row'
                  }
                ]}
              >
                <TextInput
                  accessibilityLabel={translate('planning.obligation.dueDay')}
                  style={[
                    styles.dueDayInput,
                    {
                      textAlign: isRtl ? 'right' : 'left',
                      writingDirection: directionPref
                    }
                  ]}
                  placeholder={translate('common.dueDayPlaceholder')}
                  placeholderTextColor={colorTokens.obligationForm.placeholder}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={dueDay}
                  onChangeText={setDueDay}
                />
                <Text style={styles.dueDaySuffix}>
                  {isRtl ? 'من كل شهر' : 'of each month'}
                </Text>
              </View>
              {error ? (
                <StyledText style={styles.errorText}>{error}</StyledText>
              ) : null}
            </View>
          </View>
        </View>

        {/* Section 4: الحساب الممول والمطابقة (Funding Account & Matching) */}
        <View style={styles.sectionWrapper}>
          <StyledText style={styles.sectionLabel} variant="caption">
            {isRtl ? 'خيارات الحساب والتتبع' : 'Funding & Tracking'}
          </StyledText>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border
              }
            ]}
          >
            {/* Funding Account Selection Row */}
            <View style={styles.fieldGroup}>
              <Text
                style={[
                  styles.inputLabel,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: directionPref
                  }
                ]}
              >
                {translate('voice.review.account')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${translate('voice.review.account')} ${
                  selectedAccount?.name ?? translate('reports.state.unavailable')
                }`}
                onPress={() => setAccountPickerOpen(true)}
                style={({ pressed }) => [
                  styles.accountRow,
                  styles.physicalLtr,
                  {
                    borderColor: theme.colors.border,
                    flexDirection: isRtl ? 'row-reverse' : 'row'
                  },
                  pressed && { opacity: 0.85 }
                ]}
              >
                <View
                  style={[
                    styles.accountRowLeft,
                    styles.physicalLtr,
                    { flexDirection: isRtl ? 'row-reverse' : 'row' }
                  ]}
                >
                  <View style={styles.accountIconBadge}>
                    <DesignIcon
                      name="accounts"
                      label="Account"
                      color={colorTokens.obligationForm.receivableText}
                      size="control"
                      decorative
                    />
                  </View>
                  <View style={styles.accountRowTexts}>
                    <Text
                      style={[
                        styles.accountRowTitle,
                        {
                          textAlign: isRtl ? 'right' : 'left',
                          writingDirection: directionPref
                        }
                      ]}
                    >
                      {selectedAccount?.name ??
                        translate('reports.state.unavailable')}
                    </Text>
                    {selectedAccount ? (
                      <Text style={styles.subtext}>
                        {selectedAccount.currencyCode}
                        {selectedAccount.lastFour
                          ? ` · ****${selectedAccount.lastFour}`
                          : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <DesignIcon
                  name="chevronEnd"
                  label="Expand"
                  color={colorTokens.ink[500]}
                  size="control"
                  direction={directionPref}
                  decorative
                />
              </Pressable>
            </View>

            <View
              style={[styles.divider, { backgroundColor: theme.colors.border }]}
            />

            {/* Smart Tracking Switch Row */}
            <Pressable
              onPress={() =>
                setAutomaticMatchingEnabled(!automaticMatchingEnabled)
              }
              style={[
                styles.switchCardRow,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <View
                style={[
                  styles.switchCardLeft,
                  styles.physicalLtr,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' }
                ]}
              >
                <View
                  style={[
                    styles.switchIconBadge,
                    {
                      backgroundColor: automaticMatchingEnabled
                        ? colorTokens.obligationForm.receivableSurface
                        : colorTokens.obligationForm.neutralBadge
                    }
                  ]}
                >
                  <DesignIcon
                    name="tracking"
                    label="Tracking"
                    color={automaticMatchingEnabled ? colorTokens.obligationForm.receivableText : colorTokens.ink[500]}
                    size="control"
                    direction={directionPref}
                    decorative
                  />
                </View>
                <View
                  style={[
                    styles.switchTexts,
                    { alignItems: isRtl ? 'flex-end' : 'flex-start' }
                  ]}
                >
                  <Text
                    style={[
                      styles.switchTitle,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: directionPref
                      }
                    ]}
                  >
                    {translate('planning.obligation.automaticMatching')}
                  </Text>
                  <Text
                    style={[
                      styles.subtext,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: directionPref
                      }
                    ]}
                  >
                    {isRtl
                      ? 'ربط إشعارات ورسائل السداد تلقائيًا'
                      : 'Match captured transaction alerts automatically'}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.customSwitch,
                  automaticMatchingEnabled && styles.customSwitchActive
                ]}
              >
                <View
                  style={[
                    styles.customSwitchThumb,
                    automaticMatchingEnabled && styles.customSwitchThumbActive
                  ]}
                />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Saved Alert Banner */}
        {saved ? (
          <View style={styles.savedBanner}>
            <DesignIcon
              name="check"
              label="Saved"
              color={colorTokens.obligationForm.receivableText}
              size="control"
              decorative
            />
            <StyledText accessibilityRole="alert" style={styles.savedBannerText}>
              {translate('planning.state.saved')}
            </StyledText>
          </View>
        ) : null}

        {/* Account Picker Modal Sheet */}
        <AppSheet
          title={translate('voice.review.account')}
          visible={accountPickerOpen}
          onDismiss={() => setAccountPickerOpen(false)}
        >
          <AccountPicker
            selectedId={selectedAccountId}
            onSelect={(account) => {
              setAccountId(account.id);
              setAccountPickerOpen(false);
            }}
          />
        </AppSheet>
      </ScrollView>

      {/* Pinned Bottom Save Action */}
      <View
        style={[
          styles.bottomContainer,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border
          }
        ]}
      >
        <ActionButton
          label={translate('planning.action.save')}
          loading={save.isPending}
          onPress={submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 110,
    gap: spacing.md
  },
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    display: 'flex',
    writingDirection: 'ltr'
  },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colorTokens.obligationForm.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colorTokens.obligationForm.border
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colorTokens.ink[900]
  },
  sectionWrapper: {
    gap: spacing.xs
  },
  sectionLabel: {
    color: colorTokens.ink[500],
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md
  },
  directionRow: {
    gap: spacing.sm
  },
  directionCard: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colorTokens.obligationForm.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  directionCardActivePayable: {
    borderColor: colorTokens.obligationForm.payableText
  },
  directionCardActiveReceivable: {
    borderColor: colorTokens.obligationForm.receivableText
  },
  directionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  directionCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: colorTokens.obligationForm.textMuted,
    textAlign: 'center'
  },
  directionCardTextActivePayable: {
    color: colorTokens.obligationForm.payableText,
    fontWeight: '700'
  },
  directionCardTextActiveReceivable: {
    color: colorTokens.obligationForm.receivableText,
    fontWeight: '700'
  },
  fieldGroup: {
    gap: spacing.xs
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colorTokens.obligationForm.helperText
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colorTokens.obligationForm.inset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colorTokens.ink[900],
    minHeight: 48
  },
  amountInputRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colorTokens.obligationForm.inset,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 48
  },
  currencyBadge: {
    backgroundColor: colorTokens.obligationForm.selectedSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  currencyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colorTokens.obligationForm.receivableText
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    fontWeight: '600',
    color: colorTokens.ink[900]
  },
  dueDayRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colorTokens.obligationForm.inset,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: 48,
    gap: spacing.sm
  },
  dueDayInput: {
    fontSize: 16,
    fontWeight: '700',
    color: colorTokens.ink[900],
    minWidth: 40
  },
  dueDaySuffix: {
    fontSize: 14,
    color: colorTokens.ink[500]
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2
  },
  accountRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colorTokens.obligationForm.inset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56
  },
  accountRowLeft: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1
  },
  accountIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colorTokens.obligationForm.receivableSurface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  accountRowTexts: {
    flex: 1,
    gap: 2
  },
  accountRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colorTokens.ink[900]
  },
  subtext: {
    fontSize: 12,
    color: colorTokens.ink[500],
    lineHeight: 16
  },
  switchCardRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.md
  },
  switchCardLeft: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1
  },
  switchIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  switchTexts: {
    flex: 1,
    gap: 2
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colorTokens.ink[900]
  },
  customSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colorTokens.obligationForm.subduedTrack,
    padding: 3,
    justifyContent: 'center'
  },
  customSwitchActive: {
    backgroundColor: colorTokens.obligationForm.receivableText
  },
  customSwitchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colorTokens.obligationForm.card,
    shadowColor: colorTokens.obligationForm.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2
  },
  customSwitchThumbActive: {
    alignSelf: 'flex-end'
  },
  savedBanner: {
    backgroundColor: colorTokens.obligationForm.receivableSurface,
    borderWidth: 1,
    borderColor: colorTokens.obligationForm.selectedBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center'
  },
  savedBannerText: {
    color: colorTokens.obligationForm.receivableText,
    fontWeight: '700',
    fontSize: 14
  },
  errorText: {
    color: colorTokens.obligationForm.payableText,
    fontSize: 12,
    marginTop: 2
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    shadowColor: colorTokens.obligationForm.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 6
  }
});
