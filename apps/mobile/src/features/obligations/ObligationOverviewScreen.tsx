import React from 'react';
import { router } from 'expo-router';

import { FinancialPulse } from '@/design-system/components/financial/FinancialPulse';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import type { Obligation } from '@/domain/financial-planning';
import {
  PlanningScreen,
  PlanningState
} from '@/features/financial-planning/PlanningScaffold';
import { currentLocale, translate, type MessageKey } from '@/localization/i18n';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { usePreferenceStore } from '@/state/preferences';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { useObligationsOverview } from './obligation-queries';

export function ObligationOverviewScreen() {
  const query = useObligationsOverview();
  const currencyCode = usePreferenceStore((state) => state.baseCurrencyCode);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const { revealed } = useSensitiveVisibility();
  const hidden = hideBalances && !revealed;
  const amount = (minor: number) =>
    hidden
      ? translate('planning.state.hidden')
      : formatMinorAmount(minor, currencyCode, currentLocale());
  const obligationAmount = (minor: number | null, item: Obligation) =>
    minor === null
      ? translate('reports.state.unavailable')
      : hidden
        ? translate('planning.state.hidden')
        : formatMinorAmount(minor, item.currencyCode, currentLocale());
  const totals = (values: Record<string, number | null>) => {
    if (hidden) return translate('planning.state.hidden');
    const entries = Object.entries(values);
    if (!entries.length) return amount(0);
    return entries
      .map(([currency, minor]) =>
        minor === null
          ? `${currency} ${translate('reports.state.unavailable')}`
          : formatMinorAmount(minor, currency, currentLocale())
      )
      .join(' · ');
  };
  return (
    <PlanningScreen
      titleKey="planning.obligations.title"
      action={{
        labelKey: 'planning.obligations.new',
        onPress: () => router.push('/obligations/new')
      }}
    >
      {query.isLoading ? (
        <PlanningState state="loading" />
      ) : query.isError ? (
        <PlanningState state="error" onRetry={() => void query.refetch()} />
      ) : !query.data?.items.length ? (
        <PlanningState state="empty" />
      ) : (
        <>
          <FinancialPulse
            accessibilityLabel={`${translate('planning.obligation.totalPayable')}, ${totals(query.data.payablesByCurrency)}, ${translate('planning.obligation.receivables')}, ${totals(query.data.receivablesByCurrency)}, ${query.data.nextDueDate ?? translate('reports.state.unavailable')}`}
            scope={translate('planning.obligation.totalPayable')}
            statement={totals(query.data.payablesByCurrency)}
            supportingValue={`${translate('planning.obligation.receivables')}: ${totals(query.data.receivablesByCurrency)} · ${query.data.nextDueDate ?? translate('reports.state.unavailable')}`}
          />
          <GroupedList label={translate('planning.obligations.title')}>
            {query.data.items.map((item: Obligation) => (
              <NavigationRow
                key={item.id}
                label={item.title}
                description={`${translate(`planning.obligation.direction.${item.direction}` as MessageKey)} · ${translate(`planning.obligation.status.${item.status}` as MessageKey)} · ${translate('planning.field.remaining')}`}
                value={obligationAmount(
                  query.data.remainingByObligationId[item.id] ?? null,
                  item
                )}
                onPress={() => router.push(`/obligations/${item.id}`)}
              />
            ))}
          </GroupedList>
        </>
      )}
    </PlanningScreen>
  );
}
