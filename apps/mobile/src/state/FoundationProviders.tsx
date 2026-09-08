/**
 * Foundation providers.
 *
 * Composes theme and TanStack Query providers so every screen and component
 * sees a realistic context. Localization is resolved imperatively through the
 * typed i18n module (no provider needed). Components consume these via hooks,
 * never by reading raw tokens directly. Constitution Principle V.
 */

import React, { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme as NavigationTheme
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveTheme } from '@/design-system/theme';
import type { ResolvedTheme } from '@/design-system/theme';
import { layoutDirectionStyle } from '@/design-system/direction';
import { initI18n, changeLocale } from '@/localization/i18n';
import { ThemeContext, type ThemeContextValue } from '@/state/theme-context';
import { usePreferenceStore } from '@/state/preferences';
import {
  registerRuntimeIdentityReset,
  registerRuntimeUserDataReset
} from '@/storage/runtime-user-data-reset';
import { SensitiveVisibilityProvider } from './SensitiveVisibilityProvider';

initI18n();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: process.env.NODE_ENV === 'test' ? Infinity : 5 * 60_000,
      retry: false,
      staleTime: Infinity
    }
  }
});

export function FoundationProviders({
  children,
  client = queryClient
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const locale = usePreferenceStore((state) => state.locale);
  const direction = usePreferenceStore((state) => state.direction);
  const hydrated = usePreferenceStore((state) => state.hydrated);
  const hydrate = usePreferenceStore((state) => state.hydrate);
  const previousLocale = useRef(locale);

  useEffect(() => {
    if (!hydrated) {
      void hydrate();
    }
  }, [hydrate, hydrated]);

  useEffect(() => {
    const clear = () => client.clear();
    const unregisterUserReset = registerRuntimeUserDataReset(clear);
    const unregisterIdentityReset = registerRuntimeIdentityReset(clear);
    return () => {
      unregisterUserReset();
      unregisterIdentityReset();
    };
  }, [client]);

  useEffect(() => {
    changeLocale(locale);
    if (previousLocale.current !== locale) client.clear();
    previousLocale.current = locale;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = direction;
      document.documentElement.lang = locale;
    }
  }, [client, locale, direction]);

  const resolved: ResolvedTheme = useMemo(() => resolveTheme('light'), []);
  const themeValue: ThemeContextValue = useMemo(
    () => ({ theme: resolved }),
    [resolved]
  );
  const navigationTheme: NavigationTheme = useMemo(
    () => ({
      dark: resolved.mode === 'dark',
      colors: {
        primary: resolved.colors.primary,
        background: resolved.colors.surfaces.page,
        card: resolved.colors.surfaces.card,
        text: resolved.colors.content.primary,
        border: resolved.colors.borders.default,
        notification: resolved.colors.status.info
      },
      fonts: DefaultTheme.fonts
    }),
    [resolved]
  );

  return (
    <QueryClientProvider client={client}>
      <ThemeContext.Provider value={themeValue}>
        <NavigationThemeProvider value={navigationTheme}>
          <StatusBar
            backgroundColor={resolved.colors.background}
            style={resolved.mode === 'dark' ? 'light' : 'dark'}
          />
          <SensitiveVisibilityProvider>
            <SafeAreaView
              testID="foundation-direction-root"
              style={{
                backgroundColor: resolved.colors.background,
                flex: 1,
                ...layoutDirectionStyle(direction)
              }}
            >
              {children}
            </SafeAreaView>
          </SensitiveVisibilityProvider>
        </NavigationThemeProvider>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}
