import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { AmountText } from '@/design-system/components/financial/FinancialPrimitives';
import { useTransaction } from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import type { DuplicateResolution } from '@/services/contracts/automatic-tracking-service';
import { trackingReasonSummary } from './tracking-display';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';
import {
  invalidateTrackingScopes,
  useDuplicateCandidate
} from './useAutomaticTracking';

export function DuplicateComparison({ id }: { id: string }) {
  const client = useQueryClient();
  const query = useDuplicateCandidate(id);
  const existing = useTransaction(query.data?.existingTransactionId ?? '');
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState(false);
  if (query.isLoading)
    return (
      <StateView state="loading" title={translate('tracking.state.loading')} />
    );
  if (query.isError || !query.data)
    return (
      <StateView
        state="error"
        title={translate('tracking.duplicate.missing')}
        actionLabel={translate('appShell.navigation.back')}
        onAction={() => router.back()}
      />
    );
  const duplicate = query.data;
  async function resolve(resolution: DuplicateResolution) {
    setResolving(true);
    setResolutionError(false);
    try {
      const result = await automaticTrackingService.resolveDuplicate(
        duplicate.id,
        resolution
      );
      await invalidateTrackingScopes(client, result.affectedScopes);
      router.back();
    } catch {
      setResolutionError(true);
    } finally {
      setResolving(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <StyledText variant="title">
        {translate('tracking.duplicate.title')}
      </StyledText>
      <TrackingDemoNotice />
      <SurfaceCard>
        <View style={styles.stack}>
          <StyledText>{translate('tracking.duplicate.existing')}</StyledText>
          {existing.data ? (
            <>
              <StyledText variant="subtitle">{existing.data.title}</StyledText>
              <AmountText
                minorUnits={existing.data.amountMinor}
                currency={existing.data.currencyCode}
                meaning={
                  existing.data.type === 'income'
                    ? 'income'
                    : existing.data.type === 'transfer'
                      ? 'transfer'
                      : existing.data.type === 'refund'
                        ? 'refund'
                        : 'expense'
                }
              />
            </>
          ) : (
            <StyledText>
              {translate('tracking.duplicate.transactionUnavailable')}
            </StyledText>
          )}
          <StyledText>
            {trackingReasonSummary(duplicate.reasonCodes)}
          </StyledText>
        </View>
      </SurfaceCard>
      {resolutionError ? (
        <StateView
          state="error"
          title={translate('tracking.review.resolveError')}
        />
      ) : null}
      <ActionButton
        label={translate('tracking.duplicate.keepExisting')}
        loading={resolving}
        onPress={() => void resolve('keep_existing')}
      />
      <ActionButton
        label={translate('tracking.duplicate.keepNew')}
        disabled={resolving}
        onPress={() => void resolve('keep_new')}
        variant="secondary"
      />
      <ActionButton
        label={translate('tracking.duplicate.keepBoth')}
        disabled={resolving}
        onPress={() => void resolve('keep_both')}
        variant="secondary"
      />
      <ActionButton
        label={translate('tracking.duplicate.merge')}
        disabled={resolving}
        onPress={() => void resolve('merge_details')}
        variant="secondary"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 }
});
