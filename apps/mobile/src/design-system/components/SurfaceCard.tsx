import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTheme } from '@/state/theme-context';
import { elevation, radius } from '@/design-system/tokens';

export interface SurfaceCardProps extends ViewProps {
  children: ReactNode;
}

export function SurfaceCard({ children, style, ...props }: SurfaceCardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaces.card,
          borderColor: theme.colors.borders.default
        },
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.card,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 16
  }
});
