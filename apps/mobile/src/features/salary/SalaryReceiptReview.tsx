import React, { useState } from 'react';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { FinancialPulse } from '@/design-system/components/financial/FinancialPulse';
import { FormField } from '@/design-system/components/forms/FormField';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import { localDateInTimeZone } from '@/domain/financial-period';
import { useTransaction } from '@/features/core-finance/core-finance-queries';
import {
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import { financialPlanningService } from '@/services/financial-planning-service';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import {
  usePlanningMutation,
  useSalaryOverview,
  useSalaryReceiptReview
} from './salary-queries';

export function SalaryReceiptReview({
  receiptId = ''
}: {
  receiptId?: string;
}) {
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const today = localDateInTimeZone(Date.now(), timeZone);
  const receipt = useSalaryReceiptReview(receiptId);
  const salary = useSalaryOverview(today, timeZone);
  const transaction = useTransaction(receipt.data?.transactionId ?? '');
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const [expectedDate, setExpectedDate] = useState(today);
  const [receivedDate, setReceivedDate] = useState(today);
  const [error, setError] = useState<string>();
  const confirm = usePlanningMutation(
    (
      input: Parameters<typeof financialPlanningService.confirmSalaryReceipt>[0]
    ) =>
      financialPlanningService.confirmSalaryReceipt(
        input,
        `salary-receipt:${receiptId}:${Date.now()}`
      )
  );
  const undo = usePlanningMutation((id: string) =>
    financialPlanningService.undoSalaryReceipt(
      id,
      `salary-receipt-undo:${id}:${Date.now()}`,
      timeZone
    )
  );

  const confirmReceipt = () => {
    if (!salary.data?.profileId || !receiptId) {
      setError(translate('planning.state.error'));
      return;
    }
    confirm.mutate(
      {
        salaryProfileId: salary.data.profileId,
        transactionId: receiptId,
        expectedOccurrenceDate: expectedDate,
        receivedDate,
        timeZone
      },
      { onError: () => setError(translate('planning.state.error')) }
    );
  };

  const receiptAmount = transaction.data
    ? hideBalances && !revealed
      ? translate('planning.state.hidden')
      : formatMinorAmount(
          transaction.data.amountMinor,
          transaction.data.currencyCode,
          currentLocale()
        )
    : receipt.data
      ? translate(
          `planning.receipt.status.${receipt.data.status}` as MessageKey
        )
      : translate('reports.state.unavailable');
  const receiptSource =
    transaction.data?.merchant ??
    transaction.data?.title ??
    receipt.data?.transactionId ??
    translate('reports.state.unavailable');

  return (
    <PlanningScreen titleKey="planning.salary.review">
      {!receiptId ? (
        <PlanningState state="empty" />
      ) : receipt.isLoading || salary.isLoading ? (
        <PlanningState state="loading" />
      ) : receipt.isError || salary.isError ? (
        <PlanningState
          state="error"
          onRetry={() => {
            void receipt.refetch();
            void salary.refetch();
          }}
        />
      ) : receipt.data ? (
        <>
          <FinancialPulse
            accessibilityLabel={`${receiptAmount}, ${receiptSource}`}
            scope={translate('planning.salary.detectedIncome')}
            statement={receiptAmount}
            supportingValue={receiptSource}
          />
          <GroupedList label={translate('planning.salary.details')}>
            <NavigationRow
              label={translate('planning.salary.transaction')}
              value={receiptSource}
            />
            <NavigationRow
              label={translate('planning.salary.expectedDate')}
              value={receipt.data.expectedOccurrenceDate}
            />
            <NavigationRow
              label={translate('planning.salary.receivedDate')}
              value={receipt.data.receivedDate}
            />
            <NavigationRow
              label={translate('planning.field.status')}
              value={translate(
                `planning.receipt.status.${receipt.data.status}` as MessageKey
              )}
            />
          </GroupedList>
          {receipt.data.status !== 'undone' ? (
            <ActionButton
              label={translate('planning.salary.undoReceipt')}
              loading={undo.isPending}
              onPress={() => undo.mutate(receipt.data!.id)}
              variant="secondary"
            />
          ) : null}
        </>
      ) : (
        <>
          <StyledText>{translate('planning.salary.confirmReceipt')}</StyledText>
          <FormField
            label={translate('planning.salary.expectedDate')}
            onChangeText={(value) => setExpectedDate(value as typeof today)}
            value={expectedDate}
          />
          <FormField
            label={translate('planning.salary.receivedDate')}
            onChangeText={(value) => setReceivedDate(value as typeof today)}
            value={receivedDate}
            errorText={error}
          />
          <ActionButton
            label={translate('planning.salary.confirmReceipt')}
            loading={confirm.isPending}
            onPress={confirmReceipt}
          />
        </>
      )}
    </PlanningScreen>
  );
}
