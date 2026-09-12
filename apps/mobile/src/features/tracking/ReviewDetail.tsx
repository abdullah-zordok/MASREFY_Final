import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import type { Account, Category } from '@/domain/core-finance';
import {
  useAccounts,
  useCategories
} from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { currentLocale } from '@/localization/i18n';
import { useTheme } from '@/state/theme-context';
import { trackingFieldLabel, trackingReasonSummary } from './tracking-display';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';
import {
  invalidateTrackingScopes,
  useReviewItem
} from './useAutomaticTracking';

export function ReviewDetail({ id }: { id: string }) {
  const theme = useTheme();
  const client = useQueryClient();
  const query = useReviewItem(id);
  const accounts = useAccounts(true);
  const categories = useCategories(true);
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
        title={translate('tracking.review.missing')}
        actionLabel={translate('appShell.navigation.back')}
        onAction={() => router.back()}
      />
    );
  const item = query.data;
  async function resolve(action: 'confirm' | 'ignore' | 'report_wrong') {
    setResolving(true);
    setResolutionError(false);
    try {
      const result = await automaticTrackingService.resolveReview(item.id, {
        action
      });
      await invalidateTrackingScopes(client, result.affectedScopes);
      router.back();
    } catch {
      setResolutionError(true);
    } finally {
      setResolving(false);
    }
  }
  const proposed = item.proposedValues;
  const currency = stringValue(proposed.currencyCode ?? proposed.currency);
  const accountId = stringValue(proposed.accountId);
  const categoryId = stringValue(proposed.categoryId);
  const account = accounts.data?.find(
    (candidate: Account) => candidate.id === accountId
  );
  const category = categories.data?.find(
    (candidate: Category) => candidate.id === categoryId
  );
  const locale = currentLocale();
  const amount =
    typeof proposed.amountMinor === 'number' && currency
      ? formatMinorAmount(proposed.amountMinor, currency, locale)
      : translate('tracking.review.notDetected');
  const merchant =
    stringValue(proposed.merchant) ?? translate('tracking.review.notDetected');
  const rows = [
    {
      label: translate('coreFinance.form.amount'),
      value: amount
    },
    {
      label: translate('voice.review.merchant'),
      value: merchant
    },
    {
      label: translate('coreFinance.transaction.account'),
      value: account?.name ?? translate('tracking.review.notDetected')
    },
    {
      label: translate('coreFinance.transaction.category'),
      value: category
        ? locale === 'ar'
          ? category.labelAr
          : category.labelEn
        : translate('tracking.review.notDetected')
    }
  ];
  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <StyledText variant="title">
        {translate('tracking.review.detail')}
      </StyledText>
      <TrackingDemoNotice />
      <SurfaceCard
        accessibilityLabel={`${amount}, ${merchant}`}
        style={{
          backgroundColor: theme.colors.surfaces.brandStrong,
          borderColor: theme.colors.surfaces.brandStrong
        }}
      >
        <View style={styles.hero}>
          <StyledText
            style={{ color: theme.colors.content.inverse }}
            variant="caption"
          >
            {translate('tracking.review.detail')}
          </StyledText>
          <StyledText
            style={{ color: theme.colors.content.inverse }}
            variant="title"
          >
            {amount}
          </StyledText>
          <StyledText style={{ color: theme.colors.content.inverse }}>
            {merchant}
          </StyledText>
        </View>
      </SurfaceCard>
      <GroupedList label={translate('tracking.review.detail')}>
        <NavigationRow
          label={translate('tracking.review.missingFields')}
          description={trackingReasonSummary(item.reasonCodes)}
        />
        {rows.slice(2).map((row) => (
          <NavigationRow key={row.label} label={row.label} value={row.value} />
        ))}
      </GroupedList>
      {item.missingFields.length ? (
        <StyledText accessibilityRole="alert">
          {translate('tracking.review.missingFields')}:{' '}
          {item.missingFields.map(trackingFieldLabel).join(' · ')}
        </StyledText>
      ) : null}
      {resolutionError ? (
        <StateView
          state="error"
          title={translate('tracking.review.resolveError')}
        />
      ) : null}
      <ActionButton
        label={translate('tracking.action.confirm')}
        loading={resolving}
        onPress={() => void resolve('confirm')}
      />
      <ActionButton
        label={translate('tracking.action.ignore')}
        disabled={resolving}
        onPress={() => void resolve('ignore')}
        variant="secondary"
      />
      <ActionButton
        label={translate('tracking.action.reportWrong')}
        disabled={resolving}
        onPress={() => void resolve('report_wrong')}
        variant="destructive"
      />
    </ScrollView>
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 },
  hero: { gap: 8 }
});
