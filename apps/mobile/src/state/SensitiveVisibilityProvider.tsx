import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';

interface SensitiveVisibilityContextValue {
  revealed: boolean;
  reveal: () => void;
  reset: () => void;
}

const SensitiveVisibilityContext = createContext<SensitiveVisibilityContextValue>({
  revealed: false,
  reveal: () => undefined,
  reset: () => undefined
});

export function SensitiveVisibilityProvider({ children }: { children: ReactNode }) {
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const theme = useTheme();
  const [sessionRevealed, setSessionRevealed] = useState(false);
  const [obscured, setObscured] = useState(false);
  const revealed = !hideBalances || sessionRevealed;
  const value = useMemo(
    () => ({
      revealed,
      reveal: () => setSessionRevealed(true),
      reset: () => setSessionRevealed(false)
    }),
    [revealed]
  );

  useEffect(() => {
    if (!hideBalances) setSessionRevealed(false);
  }, [hideBalances]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const inactive = state !== 'active';
      if (inactive) setSessionRevealed(false);
      setObscured(inactive);
    });
    return () => subscription.remove();
  }, []);

  return (
    <SensitiveVisibilityContext.Provider value={value}>
      <View style={styles.root}>
        <View
          accessibilityElementsHidden={obscured}
          importantForAccessibility={obscured ? 'no-hide-descendants' : 'auto'}
          pointerEvents={obscured ? 'none' : 'auto'}
          style={styles.content}
        >
          {children}
        </View>
        {obscured ? (
          <View
            accessibilityLabel={translateDynamic('app.title')}
            style={[styles.shield, { backgroundColor: theme.colors.background }]}
            testID="privacy-shield"
          />
        ) : null}
      </View>
    </SensitiveVisibilityContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  shield: { ...StyleSheet.absoluteFillObject }
});

export function useSensitiveVisibility() {
  return useContext(SensitiveVisibilityContext);
}
