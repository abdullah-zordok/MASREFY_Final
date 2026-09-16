/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';

import { ActionButton } from '@/design-system/components/ActionButton';
import { FinancialPulse } from '@/design-system/components/financial/FinancialPulse';
import { GroupedList, NavigationRow } from '@/design-system/components/navigation/GroupedList';
import { ConfirmationDialog } from '@/design-system/components/overlays/ConfirmationDialog';
import type { AssistantActionPreview } from '@/domain/assistant';
import { StyledText } from '@/components/StyledText';
import { currentLocale, translateDynamic } from '@/localization/i18n';
import { formatMinorAmount } from '@/utils/format-financial-value';

type AssistantQueries = typeof import('./assistant-queries');

export function AssistantActionPreviewScreen({ previewId }: { conversationId: string; previewId: string }) {
  const queries = require('./assistant-queries') as AssistantQueries;
  const previewQuery = queries.useAssistantActionPreview(previewId);
  const confirm = queries.useConfirmAssistantAction();
  const cancel = queries.useCancelAssistantAction();
  const preview = previewQuery.data as AssistantActionPreview | undefined;
  const [submitted, setSubmitted] = React.useState(false);
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const moneyInput = isMoneyInput(preview?.input) ? preview.input : null;
  const amountMinor = moneyInput?.amountMinor ?? 0;
  const currency = moneyInput?.currency ?? 'SAR';
  const formattedAmount = formatMinorAmount(amountMinor, currency, currentLocale());
  const queryError = previewQuery.error as { code?: string } | null;

  if (previewQuery.isError) return <StyledText>{queryError?.code === 'offline' ? 'assistant.actionPreview.state.offline' : 'assistant.actionPreview.state.error'}</StyledText>;
  if (!preview) return <StyledText>assistant.actionPreview.state.loading</StyledText>;
  if (preview.status === 'stale') return <StyledText>assistant.actionPreview.state.stale</StyledText>;
  if (preview.status === 'expired') return <StyledText>assistant.actionPreview.state.expired</StyledText>;
  if (preview.status === 'failed') return <StyledText>{preview.safeFailure === 'review_required' ? 'assistant.actionPreview.failure.reviewRequired' : 'assistant.actionPreview.state.failed'}</StyledText>;

  return (
    <ScrollView contentContainerStyle={{ gap: 12, padding: 16 }}>
      {moneyInput ? (
        <FinancialPulse
          accessibilityLabel={`${translateDynamic(`assistant.actionPreview.destination.${preview.affectedDestination.kind}`)}, ${formattedAmount}`}
          scope={translateDynamic(`assistant.actionPreview.destination.${preview.affectedDestination.kind}`)}
          statement={formattedAmount}
          supportingValue={translateDynamic('assistant.actionPreview.confirm.message')}
        />
      ) : <StyledText>{`assistant.actionPreview.destination.${preview.affectedDestination.kind}`}</StyledText>}
      {moneyInput ? (
        <GroupedList label={translateDynamic('assistant.actionPreview.value.amount')}>
          <NavigationRow label={translateDynamic('assistant.actionPreview.value.amount')} description={translateDynamic('assistant.actionPreview.confirm.message')} />
        </GroupedList>
      ) : null}
      {confirm.isPending ? <StyledText>assistant.actionPreview.state.pending</StyledText> : null}
      <ActionButton
        label="assistant.actionPreview.action.confirm"
        onPress={() => {
          setConfirmVisible(true);
        }}
      />
      <ActionButton
        label="assistant.actionPreview.action.cancel"
        variant="secondary"
        onPress={() => cancel.mutate({ previewId, expectedVersion: preview.version, operationId: `preview-cancel-${Date.now()}` })}
      />
      <ActionButton label="assistant.actionPreview.action.back" variant="secondary" onPress={() => router.back()} />
      <ConfirmationDialog
        visible={confirmVisible}
        title="assistant.actionPreview.confirm.title"
        message="assistant.actionPreview.confirm.message"
        confirmLabel="assistant.actionPreview.action.confirmNow"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => {
          if (submitted) return;
          setSubmitted(true);
          confirm.mutate(
            { previewId, expectedVersion: preview.version, operationId: `preview-confirm-${Date.now()}` },
            {
              onSuccess: (result: { value: AssistantActionPreview }) => {
                setConfirmVisible(false);
                routeSuccess(result.value);
              },
              onError: () => setSubmitted(false)
            }
          );
        }}
      />
    </ScrollView>
  );
}

function routeSuccess(preview: AssistantActionPreview) {
  const destination = preview.affectedDestination;
  if (destination.kind === 'goal' && preview.resultReference) router.push(`/savings/${preview.resultReference}`);
  if (destination.kind === 'subscriptions') router.push('/subscriptions');
  if (destination.kind === 'transactions') router.push('/transactions');
  if (destination.kind === 'budget') router.push(`/budgets/${destination.budgetId}`);
  if (destination.kind === 'obligation') router.push(`/obligations/${destination.obligationId}`);
}

function isMoneyInput(input: unknown): input is { amountMinor: number; currency: string } {
  return Boolean(input) && typeof (input as { amountMinor?: unknown }).amountMinor === 'number' && typeof (input as { currency?: unknown }).currency === 'string';
}
