import React from 'react';
import { StyleSheet, View } from 'react-native';

import { StyledText } from '@/components/StyledText';
import { SurfaceCard } from '@/design-system/components/SurfaceCard';
import { DesignIcon } from '@/design-system/icons';
import { spacing } from '@/design-system/tokens';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

export function FinancialTransition({ beforeLabel, before, afterLabel, after }: { beforeLabel: string; before: string; afterLabel: string; after: string }) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  return (
    <SurfaceCard accessibilityLabel={`${beforeLabel}, ${before}, ${afterLabel}, ${after}`} style={styles.row}>
      <View style={styles.value}>
        <StyledText variant="caption">{beforeLabel}</StyledText>
        <StyledText variant="subtitle">{before}</StyledText>
      </View>
      <DesignIcon name="chevronEnd" decorative direction={direction} color={theme.colors.primary} />
      <View style={styles.value}>
        <StyledText variant="caption">{afterLabel}</StyledText>
        <StyledText variant="subtitle">{after}</StyledText>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  value: { flex: 1, gap: spacing.xs }
});
