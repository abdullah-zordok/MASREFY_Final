import React from 'react';
import { StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { useTheme } from '@/state/theme-context';

export function FinancialProgress({
  label,
  percent,
  compact = false,
  inverse = false
}: {
  label: string;
  percent: number;
  compact?: boolean;
  inverse?: boolean;
}) {
  const theme = useTheme();
  const safePercent = Number.isFinite(percent) ? Math.max(0, percent) : 0;
  const threshold = thresholdFor(safePercent);
  const width = `${Math.min(safePercent, 100)}%` as DimensionValue;

  return (
    <View
      accessibilityLabel={`${label} ${safePercent}%${compact ? '' : ` ${threshold}`}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.min(safePercent, 100) }}
      style={styles.stack}
    >
      {compact ? null : (
        <View style={styles.header}>
          <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{label}</Text>
          <Text style={{ color: theme.colors.textSecondary }}>{safePercent}%</Text>
        </View>
      )}
      <View style={[styles.track, { borderColor: inverse ? theme.colors.horizon.glassBorder : theme.colors.border, backgroundColor: inverse ? theme.colors.textInverse : undefined }]}>
        <View style={[styles.fill, { width, backgroundColor: inverse ? theme.colors.financial.incomeOnHero : theme.colors.primary }]} />
      </View>
      {compact ? null : <Text style={{ color: theme.colors.textSecondary }}>{threshold}</Text>}
    </View>
  );
}

function thresholdFor(percent: number): 'normal' | 'warning' | 'high' | 'exceeded' {
  if (percent > 100) return 'exceeded';
  if (percent >= 90) return 'high';
  if (percent >= 70) return 'warning';
  return 'normal';
}

const styles = StyleSheet.create({
  stack: {
    gap: 6
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  label: {
    fontWeight: '700'
  },
  track: {
    borderRadius: 8,
    borderWidth: 1,
    height: 12,
    overflow: 'hidden'
  },
  fill: {
    height: '100%'
  }
});
