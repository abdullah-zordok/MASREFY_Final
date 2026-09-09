import React, { useState } from 'react';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FormField } from '@/design-system/components/forms/FormField';
import { PickerField } from '@/design-system/components/forms/PickerField';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import { parseAmountToMinor, type Account } from '@/domain/core-finance';
import type { LocalDate } from '@/domain/financial-planning';
import { useAccounts } from '@/features/core-finance/core-finance-queries';
import {
  PlanningMetric,
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { usePlanningFormDraft } from '@/features/financial-planning/usePlanningDraft';
import { AccountPicker } from '@/features/transactions/AccountPicker';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import type { ObligationPaymentPreview } from '@/services/contracts/financial-planning-service';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { useObligation } from './obligation-queries';
import { usePlanningMutation } from './payment-queries';

export function ObligationPaymentScreen({
  obligationId = ''
}: {
  obligationId?: string;
}) {
  const liveLedgerOnly = financialPlanningService.metadata.kind === 'live';
  const obligation = useObligation(obligationId);
  const accounts = useAccounts();
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(
    () => new Date().toISOString().slice(0, 10) as LocalDate
  );
  const [accountId, setAccountId] = useState('');
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [preview, setPreview] = useState<ObligationPaymentPreview>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const confirm = usePlanningMutation((value: ObligationPaymentPreview) =>
    financialPlanningService.confirmObligationPayment(
      value.previewId,
      { allocations: value.allocations, intent: 'current' },
      `obligation-payment:${obligationId}:${Date.now()}`
    )
  );
  const draftEnabled = Boolean(obligation.data) && !liveLedgerOnly;
  const { draftReady, discardDraft } = usePlanningFormDraft({
    id: `planning-form-payment:${obligationId}`,
    kind: 'payment',
    entityId: obligationId || null,
    payload: { amount, paidDate, accountId },
    meaningful: Boolean(amount || accountId),
    enabled: draftEnabled,
    restore: (payload) => {
      const draft = payload as Partial<{
        amount: string;
        paidDate: LocalDate;
        accountId: string;
      }>;
      if (typeof draft.amount === 'string') setAmount(draft.amount);
      if (typeof draft.paidDate === 'string') setPaidDate(draft.paidDate);
      if (typeof draft.accountId === 'string') setAccountId(draft.accountId);
    },
    onError: () => setError(translate('planning.state.error'))
  });

  const buildPreview = async () => {
    const selectedAccount = accountId || accounts.data?.[0]?.id;
    const item = obligation.data?.obligation;
    const amountMinor = parseAmountToMinor(amount, item?.currencyCode ?? 'SAR');
    if (!amountMinor || !selectedAccount || !item) {
      setError(translate('planning.validation.required'));
      return;
    }
    setPreviewing(true);
    setError(undefined);
    try {
      setPreview(
        await financialPlanningService.previewObligationPayment({
          obligationId,
          amountMinor,
          currencyCode: item.currencyCode,
          paidDate,
          source: 'manual',
          transaction: {
            kind: 'create',
            input: {
              type: 'obligation_payment',
              amountMinor,
              currencyCode: item.currencyCode,
              accountId: selectedAccount,
              destinationAccountId: null,
              feeMinor: 0,
              categoryId: null,
              title: item.title,
              merchant: item.provider,
              occurredAt: Date.parse(`${paidDate}T12:00:00Z`),
              notes: null,
              originalTransactionId: null,
              obligationId
            }
          }
        })
      );
    } catch {
      setError(translate('planning.state.error'));
    } finally {
      setPreviewing(false);
    }
  };
  const selectedAccountId = accountId || accounts.data?.[0]?.id;

  return (
    <PlanningScreen titleKey="planning.obligations.payment">
      {!obligationId ? (
        <PlanningState state="empty" />
      ) : obligation.isLoading ||
        accounts.isLoading ||
        (draftEnabled && !draftReady) ? (
        <PlanningState state="loading" />
      ) : obligation.isError || accounts.isError || !obligation.data ? (
        <PlanningState
          state="error"
          onRetry={() => {
            void obligation.refetch();
            void accounts.refetch();
          }}
        />
      ) : liveLedgerOnly ? (
        <StyledText accessibilityRole="alert">
          {translate('reports.state.unavailable')}
        </StyledText>
      ) : preview ? (
        <>
          <PlanningMetric
            labelKey="planning.obligation.paymentCase"
            value={translate(
              `planning.obligation.paymentCase.${preview.case}` as MessageKey
            )}
          />
          <PlanningMetric
            labelKey="planning.obligation.paymentAmount"
            value={
              hideBalances && !revealed
                ? translate('planning.state.hidden')
                : formatMinorAmount(
                    preview.amountMinor,
                    obligation.data.obligation.currencyCode,
                    currentLocale()
                  )
            }
          />
          <PlanningMetric
            labelKey="planning.obligation.allocations"
            value={String(preview.allocations.length)}
          />
          <ActionButton
            label={translate('planning.obligation.confirmPayment')}
            loading={confirm.isPending}
            onPress={() =>
              confirm.mutate(preview, {
                onSuccess: () => {
                  setSaved(true);
                  void discardDraft();
                },
                onError: () => setError(translate('planning.state.error'))
              })
            }
          />
          <ActionButton
            label={translate('planning.action.edit')}
            onPress={() => {
              setPreview(undefined);
              setSaved(false);
            }}
            variant="secondary"
          />
          {saved ? (
            <StyledText accessibilityRole="alert">
              {translate('planning.state.saved')}
            </StyledText>
          ) : null}
          {error ? (
            <StyledText accessibilityRole="alert">{error}</StyledText>
          ) : null}
        </>
      ) : (
        <>
          <FormField
            label={translate('planning.obligation.paymentAmount')}
            onChangeText={setAmount}
            value={amount}
            variant="amount"
          />
          <FormField
            label={translate('planning.obligation.paymentDate')}
            onChangeText={(value) => setPaidDate(value as LocalDate)}
            value={paidDate}
            errorText={error}
          />
          <PickerField
            label={translate('voice.review.account')}
            value={
              accounts.data?.find(
                (account: Account) => account.id === selectedAccountId
              )?.name
            }
            placeholder={translate('reports.state.unavailable')}
            onPress={() => setAccountPickerOpen(true)}
          />
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
          <ActionButton
            label={translate('planning.obligation.previewPayment')}
            loading={previewing}
            onPress={() => void buildPreview()}
          />
        </>
      )}
    </PlanningScreen>
  );
}
