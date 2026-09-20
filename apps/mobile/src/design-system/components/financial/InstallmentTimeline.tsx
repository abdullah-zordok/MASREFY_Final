import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import type { StatusBadgeStatus } from '@/design-system/components/StatusBadge';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { minTouchTarget, spacing } from '@/design-system/tokens';
import { useTheme } from '@/state/theme-context';
import { AmountText } from './FinancialPrimitives';

export interface InstallmentTimelineItem {
  id?: string;
  label: string;
  date?: string;
  amount: string | number;
  currency?: string;
  status: StatusBadgeStatus;
  statusLabel?: string;
}

export function InstallmentTimeline({
  title,
  items,
  initialCount = 5,
  showAllLabel
}: {
  title: string;
  items: InstallmentTimelineItem[];
  initialCount?: number;
  showAllLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  const visible = expanded ? items : items.slice(0, initialCount);
  const progressColor = theme.colors.status.danger;

  return (
    <SurfaceCard style={styles.stack}>
      <View style={styles.header}>
        <StyledText variant="subtitle">{title}</StyledText>
        {!expanded && items.length > initialCount && showAllLabel ? (
          <Pressable accessibilityRole="button" accessibilityLabel={showAllLabel} onPress={() => setExpanded(true)} style={styles.showAll}>
            <StyledText style={{ color: theme.colors.primary }}>{showAllLabel}</StyledText>
          </Pressable>
        ) : null}
      </View>
      {visible.map((item, index) => (
        <View
          key={item.id ?? item.label}
          accessible
          accessibilityLabel={`${item.label}, ${item.date ?? ''}, ${item.amount}, ${item.statusLabel ?? item.status}`}
          style={styles.row}
          testID={item.id ? `installment-timeline-row-${item.id}` : undefined}
        >
          <View style={styles.dateRail}>
            <View style={styles.markerColumn}>
              <View
                style={[
                  styles.marker,
                  {
                    backgroundColor: item.status === 'success' ? progressColor : theme.colors.surface,
                    borderColor: progressColor
                  }
                ]}
                testID={item.id ? `installment-timeline-marker-${item.id}` : undefined}
              />
              {index < visible.length - 1 ? (
                <View
                  style={[styles.line, { backgroundColor: progressColor }]}
                  testID={item.id ? `installment-timeline-line-${item.id}` : undefined}
                />
              ) : null}
            </View>
            {item.date ? <StyledText variant="caption" style={styles.date}>{item.date}</StyledText> : null}
          </View>
          <View style={styles.copy}>
            <StyledText style={styles.label}>{item.label}</StyledText>
            {typeof item.amount === 'number' && item.currency ? <AmountText value={item.amount} currency={item.currency} meaning="debt" /> : <StyledText style={styles.amount}>{String(item.amount)}</StyledText>}
          </View>
          <View style={styles.statusBox} testID={item.id ? `installment-timeline-status-${item.id}` : undefined}>
            <View style={[styles.statusChip, { backgroundColor: theme.colors.surfaceMuted, borderColor: statusColor(item.status, theme.colors) }]}>
              <StyledText adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.statusText, { color: statusColor(item.status, theme.colors) }]}>
                {item.statusLabel ?? item.status}
              </StyledText>
            </View>
          </View>
        </View>
      ))}
    </SurfaceCard>
  );
}

function statusColor(status: StatusBadgeStatus, colors: ReturnType<typeof useTheme>['colors']) {
  if (status === 'success') return colors.status.success;
  if (status === 'warning') return colors.status.warning;
  if (status === 'danger') return colors.status.danger;
  if (status === 'info') return colors.primary;
  return colors.textSecondary;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 64 },
  statusBox: { flexShrink: 0, width: 66 },
  statusChip: { alignItems: 'center', borderRadius: 14, borderWidth: 1, minHeight: 30, justifyContent: 'center', paddingHorizontal: spacing.xs },
  statusText: { fontSize: 13, fontWeight: '700' },
  copy: { flex: 1, gap: 3, minWidth: 108 },
  label: { fontWeight: '700' },
  amount: { fontSize: 15, fontWeight: '600' },
  dateRail: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minWidth: 98 },
  markerColumn: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center', position: 'relative', width: 16 },
  marker: { borderRadius: 9, borderWidth: 2, height: 18, width: 18 },
  line: { bottom: -spacing.sm, left: 7.5, position: 'absolute', top: '50%', width: 1 },
  date: { flexShrink: 1, textAlign: 'center' },
  showAll: { alignItems: 'center', justifyContent: 'center', minHeight: minTouchTarget, paddingHorizontal: spacing.sm }
});
