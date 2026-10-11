import React from 'react';
import { View } from 'react-native';
import { StyledText } from '@/components/StyledText';
import { translate, translateDynamic } from '@/localization/i18n';
import type { useVoiceBatches } from './useVoiceBatches';

export function VoiceBatchStatus({
  batches,
  showProgress = true
}: {
  batches: ReturnType<typeof useVoiceBatches>;
  showProgress?: boolean;
}) {
  const result = batches.latest;
  const saved =
    result &&
    !result.analysis &&
    result.addedCount > 0 &&
    result.ledgerVersion > 0 &&
    result.transactionIds.length === result.addedCount &&
    new Set(result.transactionIds).size === result.addedCount;
  return (
    <View testID="voice-batch-status" accessibilityLiveRegion="polite">
      {saved ? (
        <StyledText>
          {translateDynamic('voice.batch.added', { count: result.addedCount })}
        </StyledText>
      ) : null}
      {!result?.analysis
        ? result?.outcomes?.map((event) => {
            if (
              event.status === 'committed' &&
              (!saved ||
                !event.transactionId ||
                !result.transactionIds.includes(event.transactionId))
            )
              return null;
            const key =
              event.status === 'skipped'
                ? `voice.batch.event.reason.${event.reason}`
                : `voice.batch.event.${event.status}`;
            return (
              <StyledText key={event.ordinal}>
                {translateDynamic('voice.batch.event.result', {
                  number: event.ordinal + 1,
                  result: translateDynamic(key)
                })}
              </StyledText>
            );
          })
        : null}
      {showProgress && (batches.processing || batches.uncertain) ? (
        <StyledText>{translate('voice.state.processing')}</StyledText>
      ) : null}
      {result?.status === 'completed' &&
      result.addedCount === 0 &&
      !result.analysis ? (
        <StyledText>{translate('voice.batch.empty')}</StyledText>
      ) : null}
      {result?.status === 'failed' || batches.localFailure ? (
        <StyledText>
          {translate(
            batches.localFailureCode === 'voice_canary_restricted'
              ? 'voice.batch.restricted'
              : 'voice.batch.failed'
          )}
        </StyledText>
      ) : null}
    </View>
  );
}
