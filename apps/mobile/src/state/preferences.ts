/**
 * Preference store (Zustand).
 *
 * Owns session-shell preferences: locale, theme, privacy, currency, reduced
 * motion. Service-shaped data lives in TanStack Query; this store holds only
 * preferences and transient UI state, never duplicating query data
 * (research Decision 2). Direction is always derived from locale.
 */

import { create } from 'zustand';

import {
  buildPreferences,
  directionForLocale,
  type Locale,
  type ThemePreference,
  type UserPreferences
} from '@/domain/foundation';
import { loadPreferences, savePreferences } from '@/storage/secure-preferences';
import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';
import { changeLocale } from '@/localization/i18n';
import { isDemoModeEnabled } from '@/config/demo-mode';
import { synchronizeClientDemoLocale } from '@/services/mocks/client-demo-locale';

interface PreferenceState extends UserPreferences {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<boolean>;
  setTheme: (theme: ThemePreference) => void;
  toggleHideBalances: () => void;
  setBaseCurrencyCode: (code: string) => void;
  setMonthStartDay: (day: number) => void;
  setTimeZone: (timeZone: string) => void;
  setReducedMotion: (reduced: boolean) => void;
  updateApplicationPreferences: (
    patch: Partial<
      Pick<
        UserPreferences,
        | 'firstDayOfWeek'
        | 'defaultAccountId'
        | 'transactionDefaultType'
        | 'dashboardSections'
        | 'voiceEnabled'
        | 'trackingPersonalization'
        | 'assistantPersonalization'
        | 'analyticsEnabled'
        | 'monthStartDay'
      >
    >
  ) => void;
}

let localeRequestVersion = 0;
let pendingDemoLocaleRequests = 0;
let demoLocaleQueue: Promise<unknown> = Promise.resolve();
let lastSynchronizedDemoLocale: Locale | null = null;

export const usePreferenceStore = create<PreferenceState>((set, get) => ({
  ...buildPreferences({}),
  hydrated: false,

  hydrate: async () => {
    // Preferences are optional startup state; storage failure must not block routing.
    const loaded = await loadPreferences().catch(() => buildPreferences({}));
    const next = { ...loaded, theme: 'light' as const };
    changeLocale(next.locale);
    set({ ...next, hydrated: true });
    if (loaded.theme !== 'light') {
      await savePreferences(next);
    }
  },

  setLocale: async (locale) => {
    if (!isDemoModeEnabled()) {
      if (locale === get().locale) return true;
      commitLocale(locale, set, get);
      return true;
    }
    if (
      locale === get().locale &&
      locale === lastSynchronizedDemoLocale &&
      pendingDemoLocaleRequests === 0
    )
      return true;

    const requestVersion = ++localeRequestVersion;
    pendingDemoLocaleRequests += 1;
    const synchronization = demoLocaleQueue.then(async () => {
      try {
        await synchronizeClientDemoLocale(locale);
        lastSynchronizedDemoLocale = locale;
        return true;
      } catch {
        const committedLocale = get().locale;
        if (
          requestVersion === localeRequestVersion &&
          lastSynchronizedDemoLocale !== committedLocale
        ) {
          try {
            await synchronizeClientDemoLocale(committedLocale);
            lastSynchronizedDemoLocale = committedLocale;
          } catch {
            // A later same-locale selection retries because the locales differ.
          }
        }
        return false;
      }
    });
    demoLocaleQueue = synchronization.then(() => undefined);
    const synchronized = await synchronization;
    pendingDemoLocaleRequests -= 1;
    if (!synchronized) return false;
    if (requestVersion === localeRequestVersion && locale !== get().locale) {
      commitLocale(locale, set, get);
    }
    return requestVersion === localeRequestVersion;
  },

  setTheme: () => set({ theme: 'light' }),

  toggleHideBalances: () => {
    const next = { ...get(), hideBalances: !get().hideBalances };
    set(next);
    void persist(next);
  },

  setBaseCurrencyCode: (baseCurrencyCode) => {
    const next = { ...get(), baseCurrencyCode };
    set(next);
    void persist(next);
  },

  setMonthStartDay: (monthStartDay) => {
    const clamped = Math.max(1, Math.min(28, Math.floor(monthStartDay) || 1));
    const next = { ...get(), monthStartDay: clamped };
    set(next);
    void persist(next);
  },

  setTimeZone: (timeZone) => {
    const next = { ...get(), timeZone };
    set(next);
    void persist(next);
  },

  setReducedMotion: (reducedMotion) => {
    const next = { ...get(), reducedMotion };
    set(next);
    void persist(next);
  },
  updateApplicationPreferences: (patch) => {
    const next = { ...get(), ...patch };
    set(next);
    void persist(next);
  }
}));

registerRuntimeUserDataReset(() => {
  localeRequestVersion += 1;
  lastSynchronizedDemoLocale = null;
  const defaults = buildPreferences({});
  changeLocale(defaults.locale);
  usePreferenceStore.setState({ ...defaults, hydrated: true });
});

function commitLocale(
  locale: Locale,
  set: (state: Partial<PreferenceState>) => void,
  get: () => PreferenceState
): void {
  const next = { ...get(), locale, direction: directionForLocale(locale) };
  changeLocale(locale);
  set(next);
  void persist(next);
}

function persist(state: PreferenceState): Promise<void> {
  return savePreferences({
    locale: state.locale,
    direction: state.direction,
    theme: state.theme,
    hideBalances: state.hideBalances,
    baseCurrencyCode: state.baseCurrencyCode,
    timeZone: state.timeZone,
    reducedMotion: state.reducedMotion,
    firstDayOfWeek: state.firstDayOfWeek,
    defaultAccountId: state.defaultAccountId,
    transactionDefaultType: state.transactionDefaultType,
    dashboardSections: state.dashboardSections,
    voiceEnabled: state.voiceEnabled,
    trackingPersonalization: state.trackingPersonalization,
    assistantPersonalization: state.assistantPersonalization,
    analyticsEnabled: state.analyticsEnabled,
    monthStartDay: state.monthStartDay
  });
}
