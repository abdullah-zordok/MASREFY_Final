import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { PickerField } from '@/design-system/components/forms/PickerField';
import { SwitchRow } from '@/design-system/components/forms/SelectionControls';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { radius, spacing } from '@/design-system/tokens';
import { parseAmountToMinor, type Account } from '@/domain/core-finance';
import { useAccounts } from '@/features/core-finance/core-finance-queries';
import { PlanningScreen, PlanningState } from '@/features/financial-planning/PlanningScaffold';
import { AccountPicker } from '@/features/transactions/AccountPicker';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { translate } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { usePlanningMutation } from './salary-queries';

export function SalaryProfileForm() {
  const accounts = useAccounts();
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const [amount, setAmount] = useState('');
  const [salaryDay, setSalaryDay] = useState('1');
  const [sourceName, setSourceName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [automaticDetectionEnabled, setAutomaticDetectionEnabled] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const save = usePlanningMutation((input: Parameters<typeof financialPlanningService.saveSalaryProfile>[0]) =>
    financialPlanningService.saveSalaryProfile(input, `salary-profile:${Date.now()}`)
  );
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: 'planning-form-salary',
    kind: 'salary',
    entityId: null,
    payload: { amount, salaryDay, sourceName, accountId, automaticDetectionEnabled },
    meaningful: Boolean(amount || sourceName || accountId),
    restore: (payload) => {
      const draft = payload as Partial<{ amount: string; salaryDay: string; sourceName: string; accountId: string; automaticDetectionEnabled: boolean }>;
      if (typeof draft.amount === 'string') setAmount(draft.amount);
      if (typeof draft.salaryDay === 'string') setSalaryDay(draft.salaryDay);
      if (typeof draft.sourceName === 'string') setSourceName(draft.sourceName);
      if (typeof draft.accountId === 'string') setAccountId(draft.accountId);
      if (typeof draft.automaticDetectionEnabled === 'boolean') setAutomaticDetectionEnabled(draft.automaticDetectionEnabled);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const submit = () => {
    const expectedAmountMinor = parseAmountToMinor(amount, currencyCode);
    const day = Number(salaryDay);
    const receivingAccountId = accountId || accounts.data?.[0]?.id;
    if (!expectedAmountMinor || day < 1 || day > 31 || !sourceName.trim() || !receivingAccountId) {
      setError(translate('planning.validation.required'));
      return;
    }
    setError(undefined);
    save.mutate({
      expectedAmountMinor,
      currencyCode,
      salaryDay: day,
      sourceName: sourceName.trim(),
      receivingAccountId,
      automaticDetectionEnabled
    }, { onSuccess: () => { setSaved(true); void discardDraft(); }, onError: () => setError(translate('planning.state.error')) });
  };

  return (
    <PlanningScreen titleKey="planning.salary.setup">
      {accounts.isLoading || !draftReady ? <PlanningState state="loading" /> : accounts.isError ? <PlanningState state="error" onRetry={() => void accounts.refetch()} /> : (
        <>
          <StyledText
            style={{
              color: theme.colors.content.secondary,
              textAlign: direction === 'rtl' ? 'right' : 'left'
            }}
          >
            {translate('planning.salary.setupSubtitle')}
          </StyledText>

          <SurfaceCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <StyledText accessibilityRole="header" variant="subtitle">
                {translate('planning.salary.detailsGroup')}
              </StyledText>
              <StyledText
                style={{ color: theme.colors.content.secondary }}
                variant="caption"
              >
                {translate('planning.salary.detailsGroupSubtitle')}
              </StyledText>
            </View>
            <View style={styles.fields}>
              <FormField
                label={translate('planning.salary.amount')}
                helperText={currencyCode}
                onChangeText={setAmount}
                value={amount}
                variant="amount"
              />
              <FormField
                label={translate('planning.salary.day')}
                helperText={translate('planning.salary.dayHelper')}
                onChangeText={setSalaryDay}
                value={salaryDay}
                variant="amount"
              />
              <FormField
                label={translate('planning.salary.source')}
                onChangeText={setSourceName}
                value={sourceName}
              />
            </View>
          </SurfaceCard>

          <SurfaceCard style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <StyledText accessibilityRole="header" variant="subtitle">
                {translate('planning.salary.receivingGroup')}
              </StyledText>
              <StyledText
                style={{ color: theme.colors.content.secondary }}
                variant="caption"
              >
                {translate('planning.salary.receivingGroupSubtitle')}
              </StyledText>
            </View>
            <View style={styles.fields}>
              <PickerField
                label={translate('planning.salary.account')}
                value={accounts.data?.find((account: Account) => account.id === (accountId || accounts.data?.[0]?.id))?.name}
                placeholder={translate('reports.state.unavailable')}
                onPress={() => setAccountPickerOpen(true)}
              />
              <SwitchRow
                label="planning.salary.automaticDetection"
                subtext="planning.salary.automaticDetectionSubtitle"
                value={automaticDetectionEnabled}
                onValueChange={setAutomaticDetectionEnabled}
              />
            </View>
          </SurfaceCard>

          <AppSheet
            title={translate('planning.salary.account')}
            visible={accountPickerOpen}
            onDismiss={() => setAccountPickerOpen(false)}
          >
            <AccountPicker
              selectedId={accountId || accounts.data?.[0]?.id}
              onSelect={(account) => {
                setAccountId(account.id);
                setAccountPickerOpen(false);
              }}
            />
          </AppSheet>
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

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: radius.card,
    gap: spacing.lg,
    padding: spacing.lg
  },
  sectionHeader: {
    gap: spacing.xs
  },
  fields: {
    gap: spacing.md
  }
});
