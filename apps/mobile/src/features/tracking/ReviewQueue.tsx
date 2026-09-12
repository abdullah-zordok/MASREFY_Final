import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import { StateView } from '@/design-system/components/feedback/StateView';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import { currentLocale, translate } from '@/localization/i18n';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { trackingReasonSummary } from './tracking-display';
import {
  useDuplicateCandidates,
  useReviewItems
} from './useAutomaticTracking';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';

export function ReviewQueue() {
  const query = useReviewItems();
  const duplicates = useDuplicateCandidates();
  if (query.isLoading)
    return (
      <StateView state="loading" title={translate('tracking.state.loading')} />
    );
  if (query.isError)
    return (
      <StateView
        state="error"
        title={translate('tracking.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => void query.refetch()}
      />
    );
  const items = query.data?.items ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          <StyledText variant="title">
            {translate('tracking.review.title')}
          </StyledText>
          <TrackingDemoNotice />
        </>
      }
      ListEmptyComponent={
        <StateView state="empty" title={translate('tracking.review.empty')} />
      }
      renderItem={({ item }) => {
        const reason = trackingReasonSummary(item.reasonCodes);
        const proposed = item.proposedValues;
        const duplicate = duplicates.data?.find(
          (candidate) => candidate.detectedEventId === item.detectedEventId
        );
        const merchant =
          typeof proposed.merchant === 'string' && proposed.merchant
            ? proposed.merchant
            : undefined;
        const amount =
          typeof proposed.amountMinor === 'number' &&
          typeof (proposed.currencyCode ?? proposed.currency) === 'string'
            ? formatMinorAmount(
                proposed.amountMinor,
                String(proposed.currencyCode ?? proposed.currency),
                currentLocale()
              )
            : translate('tracking.review.notDetected');
        return (
          <GroupedList label={translate('tracking.review.title')}>
            <NavigationRow
              label={reason}
              description={merchant}
              value={amount}
              onPress={() =>
                router.push(
                  duplicate
                    ? `/tracking/duplicates/${duplicate.id}`
                    : `/tracking/review/${item.id}`
                )
              }
            />
          </GroupedList>
        );
      }}
      contentContainerStyle={styles.stack}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 }
});
