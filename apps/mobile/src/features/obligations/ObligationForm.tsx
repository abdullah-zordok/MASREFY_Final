import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { FormField } from '@/design-system/components/forms/FormField';
import { PickerField } from '@/design-system/components/forms/PickerField';
import { SwitchRow } from '@/design-system/components/forms/SelectionControls';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon } from '@/design-system/icons';
import { radius, spacing } from '@/design-system/tokens';
import { minorToMajorAmountText } from '@/domain/currencies';
import { parseAmountToMinor, type Account } from '@/domain/core-finance';
import { addMonthsClamped, localDateFromTimestamp, type LocalDate, type Obligation } from '@/domain/financial-planning';
import { useAccounts } from '@/features/core-finance/core-finance-queries';
import { PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { AccountPicker } from '@/features/transactions/AccountPicker';
import { TransactionDateField } from '@/features/transactions/TransactionDateField';
import { currentLocale, translate, translateDynamic, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatDate, formatMinorAmount } from '@/utils/format-financial-value';
import { useObligation, usePlanningMutation } from './obligation-queries';

const obligationTypes: Obligation['type'][] = ['car_installment', 'personal_loan', 'rent', 'subscription', 'debt', 'custom'];
const scheduleKinds: Obligation['scheduleKind'][] = ['fixed_term', 'open_ended', 'irregular'];
type Step = 1 | 2 | 3;

export function ObligationForm({ obligationId = '', onBack }: { obligationId?: string; onBack?: () => void }) {
  const theme = useTheme();
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const existing = useObligation(obligationId);
  const accounts = useAccounts();
  const owningCurrencyCode = existing.data?.obligation.currencyCode ?? currencyCode;
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<Obligation['direction']>('payable');
  const [type, setType] = useState<Obligation['type']>('car_installment');
  const [scheduleKind, setScheduleKind] = useState<Obligation['scheduleKind']>('fixed_term');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [total, setTotal] = useState('');
  const [installment, setInstallment] = useState('');
  const [count, setCount] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10) as LocalDate);
  const [accountId, setAccountId] = useState('');
  const [automaticMatchingEnabled, setAutomaticMatchingEnabled] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const save = usePlanningMutation((input: Parameters<typeof financialPlanningService.createObligation>[0]) =>
    existing.data
      ? financialPlanningService.updateObligation(obligationId, existing.data.obligation.version, input, `obligation:${obligationId}:${Date.now()}`)
      : financialPlanningService.createObligation(input, `obligation:new:${Date.now()}`)
  );

  useEffect(() => {
    const item = existing.data?.obligation;
    if (!item) return;
    setDirection(item.direction); setType(item.type); setScheduleKind(item.scheduleKind); setTitle(item.title);
    setProvider(item.provider ?? '');
    setTotal(item.contractedTotalMinor === null ? '' : minorToMajorAmountText(item.contractedTotalMinor, item.currencyCode));
    setInstallment(item.installmentAmountMinor === null ? '' : minorToMajorAmountText(item.installmentAmountMinor, item.currencyCode));
    setCount(item.installmentCount === null ? '' : String(item.installmentCount));
    if (item.startDate) setStartDate(item.startDate);
    setAccountId(item.fundingAccountId ?? '');
    setAutomaticMatchingEnabled(item.automaticMatchingEnabled);
  }, [existing.data]);

  const draftEnabled = !obligationId || Boolean(existing.data);
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: `planning-form-obligation:${obligationId || 'new'}`,
    kind: 'obligation', entityId: obligationId || null,
    payload: { step, direction, type, scheduleKind, title, provider, total, installment, count, startDate, accountId, automaticMatchingEnabled },
    meaningful: Boolean(title || provider || total || installment || accountId || step > 1), enabled: draftEnabled,
    restore: (payload) => {
      const draft = payload as Partial<{ step: Step; direction: Obligation['direction']; type: Obligation['type']; scheduleKind: Obligation['scheduleKind']; title: string; provider: string; total: string; installment: string; count: string; startDate: LocalDate; accountId: string; automaticMatchingEnabled: boolean }>;
      if ([1, 2, 3].includes(draft.step ?? 0)) setStep(draft.step!);
      if (draft.direction === 'payable' || draft.direction === 'receivable') setDirection(draft.direction);
      if (draft.type && obligationTypes.includes(draft.type)) setType(draft.type);
      if (draft.scheduleKind && scheduleKinds.includes(draft.scheduleKind)) setScheduleKind(draft.scheduleKind);
      if (typeof draft.title === 'string') setTitle(draft.title); if (typeof draft.provider === 'string') setProvider(draft.provider);
      if (typeof draft.total === 'string') setTotal(draft.total); if (typeof draft.installment === 'string') setInstallment(draft.installment);
      if (typeof draft.count === 'string') setCount(draft.count); if (typeof draft.startDate === 'string') setStartDate(draft.startDate);
      if (typeof draft.accountId === 'string') setAccountId(draft.accountId);
      if (typeof draft.automaticMatchingEnabled === 'boolean') setAutomaticMatchingEnabled(draft.automaticMatchingEnabled);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const amounts = () => ({
    contractedTotalMinor: total ? parseAmountToMinor(total, owningCurrencyCode) : null,
    installmentAmountMinor: installment ? parseAmountToMinor(installment, owningCurrencyCode) : null,
    installmentCount: count ? Number(count) : null
  });
  const validStep = (target: Step) => {
    const values = amounts();
    if (target === 1 && (!title.trim() || !values.contractedTotalMinor)) return false;
    if (target === 2 && scheduleKind === 'fixed_term') {
      const remaining = (values.contractedTotalMinor ?? 0) - (existing.data?.obligation.openingPaidMinor ?? 0);
      const scheduledTotal = values.installmentAmountMinor && values.installmentCount ? values.installmentAmountMinor * values.installmentCount : 0;
      return Boolean(values.installmentAmountMinor && values.installmentCount && Number.isInteger(values.installmentCount) && values.installmentCount > 0 && Number.isSafeInteger(scheduledTotal) && scheduledTotal >= remaining);
    }
    return true;
  };
  const next = () => {
    if (!validStep(step)) { setError(translate('planning.validation.required')); return; }
    setError(undefined); setStep((step + 1) as Step);
  };
  const submit = () => {
    const values = amounts();
    if (!validStep(1) || !validStep(2) || save.isPending) { setError(translate('planning.validation.required')); return; }
    const dueDay = Number(startDate.slice(8, 10));
    const endDate = scheduleKind === 'fixed_term' && values.installmentCount ? addMonthsClamped(startDate, values.installmentCount - 1, dueDay) : null;
    save.mutate({
      direction, type, scheduleKind, title: title.trim(), provider: provider.trim() || null, currencyCode: owningCurrencyCode,
      contractedTotalMinor: values.contractedTotalMinor, openingPaidMinor: existing.data?.obligation.openingPaidMinor ?? 0,
      installmentAmountMinor: values.installmentAmountMinor, installmentCount: values.installmentCount, dueDay, startDate, endDate,
      fundingAccountId: accountId || accounts.data?.[0]?.id || null, automaticMatchingEnabled
    }, { onSuccess: () => { setSaved(true); void discardDraft(); }, onError: () => setError(translate('planning.state.error')) });
  };

  if (existing.isError || accounts.isError) return <PlanningScreen titleKey={obligationId ? 'planning.obligations.edit' : 'planning.obligations.new'}><PlanningState state="error" onRetry={() => { void existing.refetch(); void accounts.refetch(); }} /></PlanningScreen>;
  if ((obligationId && existing.isLoading) || accounts.isLoading || (draftEnabled && !draftReady)) return <PlanningScreen titleKey={obligationId ? 'planning.obligations.edit' : 'planning.obligations.new'}><PlanningState state="loading" /></PlanningScreen>;

  const selectedAccountId = accountId || accounts.data?.[0]?.id;
  const selectedAccount = accounts.data?.find((account: Account) => account.id === selectedAccountId);
  const values = amounts();
  const finalDate = scheduleKind === 'fixed_term' && values.installmentCount && Number.isInteger(values.installmentCount) ? addMonthsClamped(startDate, values.installmentCount - 1, Number(startDate.slice(8, 10))) : null;
  const back = () => step > 1 ? setStep((step - 1) as Step) : (onBack ?? (() => router.back()))();

  return (
    <PlanningScreen
      titleKey={obligationId ? 'planning.obligations.edit' : 'planning.obligations.new'}
      hideHeader
    >
      <WizardProgress step={step} />
      {step === 1 ? <>
        <SurfaceCard style={styles.formCard}>
          <StyledText variant="subtitle">{translate('planning.obligation.direction')}</StyledText>
          <View style={styles.choiceRow}>
            {(['payable', 'receivable'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: direction === value }} accessibilityLabel={translate(`planning.obligation.direction.${value}`)} onPress={() => setDirection(value)} style={[styles.choice, { borderColor: direction === value ? theme.colors.primary : theme.colors.border, backgroundColor: direction === value ? theme.colors.surfaces.brandSubtle : theme.colors.surface }]}><View style={[styles.radio, { borderColor: direction === value ? theme.colors.primary : theme.colors.border }]}>{direction === value ? <View style={[styles.radioFill, { backgroundColor: theme.colors.primary }]} /> : null}</View><StyledText variant="subtitle">{translate(value === 'payable' ? 'planning.obligation.iOwe' : 'planning.obligation.owedToMe')}</StyledText><StyledText variant="caption" style={styles.choiceCaption}>{translate(`planning.obligation.direction.${value}`)}</StyledText></Pressable>)}
          </View>
          <StyledText variant="subtitle">{translate('planning.obligation.type')}</StyledText>
          <Pressable accessibilityRole="button" accessibilityLabel={translate(`planning.obligation.type.${type}` as MessageKey)} onPress={() => setTypePickerOpen(true)} style={[styles.pickerRow, { borderColor: theme.colors.border }]}><DesignIcon name={type === 'car_installment' ? 'car' : type === 'subscription' ? 'subscription' : 'obligation'} decorative color={theme.colors.primary} /><StyledText style={styles.pickerValue}>{translate(`planning.obligation.type.${type}` as MessageKey)}</StyledText><DesignIcon name="chevronDown" decorative /></Pressable>
          <FormField label={translate('planning.obligation.title')} value={title} onChangeText={setTitle} />
          <FormField label={translate('planning.obligation.total')} value={total} onChangeText={setTotal} variant="amount" />
          <FormField label={translate('planning.obligation.provider')} value={provider} onChangeText={setProvider} />
        </SurfaceCard>
      </> : null}
      {step === 2 ? <>
        <StyledText variant="subtitle">{translate('planning.obligation.paymentPlan')}</StyledText>
        <SurfaceCard style={styles.formCard}>
          <ChipSelector options={scheduleKinds.map((value) => translate(`planning.obligation.schedule.${value}` as MessageKey))} selected={[translate(`planning.obligation.schedule.${scheduleKind}` as MessageKey)]} onToggle={(label) => setScheduleKind(scheduleKinds[scheduleKinds.map((value) => translate(`planning.obligation.schedule.${value}` as MessageKey)).indexOf(label)] ?? scheduleKind)} />
          <TransactionDateField label={translate('planning.obligation.firstDueDate')} value={Date.parse(`${startDate}T12:00:00`)} onChange={(timestamp) => setStartDate(localDateFromTimestamp(timestamp))} />
          {scheduleKind !== 'irregular' ? <FormField label={translate('planning.obligation.installment')} value={installment} onChangeText={setInstallment} variant="amount" /> : null}
          {scheduleKind === 'fixed_term' ? <FormField label={translate('planning.obligation.count')} value={count} onChangeText={setCount} keyboardType="number-pad" /> : null}
        </SurfaceCard>
        {finalDate ? <SurfaceCard style={[styles.planSummary, { backgroundColor: theme.colors.primary }]}><StyledText style={{ color: theme.colors.textInverse }}>{translate('planning.obligation.paymentPlan')}</StyledText><StyledText style={[styles.planAmount, { color: theme.colors.textInverse }]}>{installment ? formatMinorAmount(parseAmountToMinor(installment, owningCurrencyCode) ?? 0, owningCurrencyCode, currentLocale()) : translate('reports.state.unavailable')}</StyledText><ReviewRow inverse label={translate('planning.obligation.firstDueDate')} value={formatDate(Date.parse(`${startDate}T00:00:00Z`), currentLocale())} /><ReviewRow inverse label={translate('planning.obligation.finalDate')} value={formatDate(Date.parse(`${finalDate}T00:00:00Z`), currentLocale())} /></SurfaceCard> : null}
        {finalDate ? <SurfaceCard><StyledText variant="caption">{translateDynamic('planning.obligation.equation', { installment, count, total })}</StyledText></SurfaceCard> : null}
      </> : null}
      {step === 3 ? <>
        <StyledText variant="subtitle">{translate('planning.obligation.review')}</StyledText>
        <SurfaceCard style={styles.summary}>
          <ReviewRow label={translate('planning.obligation.title')} value={title} />
          <ReviewRow label={translate('planning.obligation.total')} value={values.contractedTotalMinor === null ? translate('reports.state.unavailable') : formatMinorAmount(values.contractedTotalMinor, owningCurrencyCode, currentLocale())} />
          <ReviewRow label={translate('planning.obligation.installment')} value={values.installmentAmountMinor === null ? translate('reports.state.unavailable') : formatMinorAmount(values.installmentAmountMinor, owningCurrencyCode, currentLocale())} />
          <ReviewRow label={translate('planning.obligation.count')} value={count || translate('reports.state.unavailable')} />
          <ReviewRow label={translate('planning.obligation.firstDueDate')} value={formatDate(Date.parse(`${startDate}T00:00:00Z`), currentLocale())} />
        </SurfaceCard>
        <PickerField label={translate('voice.review.account')} value={selectedAccount?.name} placeholder={translate('reports.state.unavailable')} onPress={() => setAccountPickerOpen(true)} />
        <SwitchRow icon="tracking" label="planning.obligation.automaticMatching" subtext="planning.obligation.automaticMatchingSubtitle" value={automaticMatchingEnabled} onValueChange={setAutomaticMatchingEnabled} />
      </> : null}
      {error ? <StyledText accessibilityRole="alert">{error}</StyledText> : null}
      {saved ? <StyledText accessibilityRole="alert">{translate('planning.state.saved')}</StyledText> : null}
      {step > 1 ? <ActionButton label={translate('common.back')} onPress={back} variant="quiet" /> : null}
      {step < 3 ? <ActionButton label={step === 2 ? translate('planning.obligation.reviewAction') : translate('planning.action.next')} onPress={next} /> : <ActionButton label={translate('planning.action.save')} loading={save.isPending} onPress={submit} />}
      <AppSheet title={translate('planning.obligation.type')} visible={typePickerOpen} onDismiss={() => setTypePickerOpen(false)}><View style={styles.typeOptions}>{obligationTypes.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: type === value }} onPress={() => { setType(value); setTypePickerOpen(false); }} style={[styles.typeOption, { borderColor: type === value ? theme.colors.primary : theme.colors.border }]}><StyledText>{translate(`planning.obligation.type.${value}` as MessageKey)}</StyledText>{type === value ? <DesignIcon name="check" decorative color={theme.colors.primary} /> : null}</Pressable>)}</View></AppSheet>
      <AppSheet title={translate('voice.review.account')} visible={accountPickerOpen} onDismiss={() => setAccountPickerOpen(false)}><AccountPicker selectedId={selectedAccountId} onSelect={(account) => { setAccountId(account.id); setAccountPickerOpen(false); }} /></AppSheet>
    </PlanningScreen>
  );
}

function WizardProgress({ step }: { step: Step }) {
  const theme = useTheme();
  return <View accessibilityLabel={translateDynamic('planning.obligation.stepProgress', { step })} style={styles.progressStack}><StyledText variant="caption" style={styles.progressCaption}>{translateDynamic('planning.obligation.stepProgress', { step })}</StyledText><View style={styles.steps}>{([1, 2, 3] as const).map((value, index) => <React.Fragment key={value}>{index ? <View style={[styles.stepLine, { backgroundColor: value <= step ? theme.colors.primary : theme.colors.border }]} /> : null}<View style={styles.step}><View style={[styles.stepCircle, { borderColor: value <= step ? theme.colors.primary : theme.colors.border, backgroundColor: value <= step ? theme.colors.primary : theme.colors.surface }]}>{value < step ? <DesignIcon name="check" decorative color={theme.colors.textInverse} /> : <StyledText style={{ color: value === step ? theme.colors.textInverse : theme.colors.textSecondary }}>{value}</StyledText>}</View><StyledText variant="caption" style={{ color: value === step ? theme.colors.primary : theme.colors.textSecondary }}>{translate(`planning.obligation.step.${value}`)}</StyledText></View></React.Fragment>)}</View></View>;
}
function ReviewRow({ label, value, inverse = false }: { label: string; value: string; inverse?: boolean }) { const theme = useTheme(); return <View style={styles.reviewRow}><StyledText variant="caption" style={inverse ? { color: theme.colors.textInverse } : undefined}>{label}</StyledText><StyledText style={inverse ? { color: theme.colors.textInverse } : undefined}>{value}</StyledText></View>; }

const styles = StyleSheet.create({
  progressStack: { gap: spacing.xs },
  progressCaption: { textAlign: 'center' },
  steps: { alignItems: 'flex-start', flexDirection: 'row' },
  step: { alignItems: 'center', flex: 1, gap: spacing.xs },
  stepCircle: { alignItems: 'center', borderRadius: 14, borderWidth: 2, height: 28, justifyContent: 'center', width: 28 },
  stepLine: { height: 2, marginHorizontal: -18, marginTop: 13, width: 40 },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choice: { borderRadius: radius.control, borderWidth: 1, flex: 1, gap: 4, minHeight: 68, padding: spacing.sm },
  choiceCaption: { flexShrink: 1 },
  radio: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12, borderWidth: 2, height: 24, justifyContent: 'center', width: 24 },
  radioFill: { borderRadius: 7, height: 14, width: 14 },
  formCard: { gap: spacing.xs, padding: spacing.md },
  pickerRow: { alignItems: 'center', borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 50, paddingHorizontal: spacing.md },
  pickerValue: { flex: 1 },
  typeOptions: { gap: spacing.sm },
  typeOption: { alignItems: 'center', borderRadius: radius.control, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: spacing.md },
  planSummary: { gap: spacing.sm, padding: spacing.md },
  planAmount: { fontSize: 28, fontWeight: '800' },
  summary: { gap: spacing.md },
  reviewRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm }
});
