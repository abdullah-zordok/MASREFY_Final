import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { GroupedList } from '@/design-system/components/navigation/GroupedList';
import { minTouchTarget, spacing } from '@/design-system/tokens';
import { localDateInTimeZone } from '@/domain/financial-period';
import type { SavingsProgress } from '@/domain/financial-planning';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { usePlanningOverview } from './financial-planning-queries';

export function PlanningHomeCard() {
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const overview = usePlanningOverview(
    'SAR',
    localDateInTimeZone(Date.now(), timeZone),
    timeZone
  ).data;
  const savingsPercent = overview?.savings.find(
    (goal: SavingsProgress) => goal.percentage.status === 'available'
  )?.percentage;

  return (
    <View style={styles.stack}>
      <Text style={styles.heading}>
        {translate('coreFinance.home.financialProgress')}
      </Text>
      <GroupedList label={translate('coreFinance.home.financialProgress')}>
        {/* TODO: Restore the budget entry when the budget experience is ready for release. */}
        <PlanningRow
          label={translate('planning.savings.title')}
          onPress={() => router.push('/savings')}
          percent={
            savingsPercent?.status === 'available'
              ? savingsPercent.value
              : undefined
          }
        />
        <PlanningRow
          label={translate('planning.salary.title')}
          onPress={() => router.push('/salary')}
        />
        <PlanningRow
          label={translate('planning.obligations.title')}
          onPress={() => router.push('/obligations')}
        />
      </GroupedList>
    </View>
  );
}

function PlanningRow({
  label,
  percent,
  onPress
}: {
  label: string;
  percent?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const normalizedPercent =
    percent === undefined ? undefined : Math.max(0, Math.min(100, percent));
  const width = `${normalizedPercent ?? 0}%` as `${number}%`;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.borders.subtle },
        pressed && { backgroundColor: theme.colors.interactions.quietPressed }
      ]}
    >
      <View
        style={[
          styles.rowHeading,
          {
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        <Text style={[styles.label, { color: theme.colors.content.primary }]}>
          {label}
        </Text>
        {normalizedPercent === undefined ? null : (
          <Text
            style={[styles.percent, { color: theme.colors.content.primary }]}
          >
            {normalizedPercent}%
          </Text>
        )}
      </View>
      {normalizedPercent === undefined ? null : (
        <View
          accessibilityLabel={`${translate('planning.field.progress')} ${normalizedPercent}%`}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: normalizedPercent }}
          style={[
            styles.track,
            { backgroundColor: theme.colors.surfaces.inset }
          ]}
        >
          <View
            style={[
              styles.fill,
              { backgroundColor: theme.colors.primary, width }
            ]}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  heading: { fontSize: 17, fontWeight: '700', lineHeight: 24 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  rowHeading: { alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  percent: { fontSize: 13, fontWeight: '700' },
  track: { borderRadius: 999, height: 6, overflow: 'hidden' },
  fill: { borderRadius: 999, height: 6 }
});
