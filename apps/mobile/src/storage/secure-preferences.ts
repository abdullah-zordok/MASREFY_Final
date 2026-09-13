/**
 * Protected persistence for user preferences.
 *
 * Uses Expo SecureStore for small sensitive/protected values. The preference
 * store reads and writes through this module; nothing else touches SecureStore
 * directly. Research Decision 3 and Constitution Principle V.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { z } from 'zod';

import {
  buildPreferences,
  type ThemePreference,
  type Locale,
  type UserPreferences
} from '@/domain/foundation';

const STORAGE_KEY = 'masarifi.preferences';

interface PersistedPreferences {
  locale: Locale;
  firstLaunchOnboardingCompleted: boolean;
  theme: ThemePreference;
  hideBalances: boolean;
  baseCurrencyCode: string;
  timeZone: string;
  reducedMotion: boolean;
  firstDayOfWeek: UserPreferences['firstDayOfWeek'];
  defaultAccountId: string | null;
  transactionDefaultType: UserPreferences['transactionDefaultType'];
  dashboardSections: UserPreferences['dashboardSections'];
  voiceEnabled: boolean;
  trackingPersonalization: boolean;
  assistantPersonalization: boolean;
  analyticsEnabled: boolean;
  monthStartDay: number;
}

const persistedPreferencesSchema = z.object({
  locale: z.enum(['ar', 'en']).optional(),
  firstLaunchOnboardingCompleted: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  hideBalances: z.boolean().optional(),
  baseCurrencyCode: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  timeZone: z.string().optional(),
  reducedMotion: z.boolean().optional(),
  firstDayOfWeek: z.enum(['sunday', 'monday', 'saturday']).optional(),
  defaultAccountId: z.string().nullable().optional(),
  transactionDefaultType: z.enum(['expense', 'income']).optional(),
  dashboardSections: z
    .array(z.enum(['balance', 'transactions', 'budgets', 'goals', 'reports']))
    .optional(),
  voiceEnabled: z.boolean().optional(),
  trackingPersonalization: z.boolean().optional(),
  assistantPersonalization: z.boolean().optional(),
  analyticsEnabled: z.boolean().optional(),
  monthStartDay: z.number().int().min(1).max(28).optional()
});

export async function loadPreferences(): Promise<UserPreferences> {
  const raw = await readPersistedPreferences();
  if (!raw) {
    return buildPreferences({});
  }
  return deserialize(raw);
}

export async function savePreferences(
  preferences: UserPreferences
): Promise<void> {
  const persisted: PersistedPreferences = {
    locale: preferences.locale,
    firstLaunchOnboardingCompleted: preferences.firstLaunchOnboardingCompleted,
    theme: preferences.theme,
    hideBalances: preferences.hideBalances,
    baseCurrencyCode: preferences.baseCurrencyCode,
    timeZone: preferences.timeZone,
    reducedMotion: preferences.reducedMotion,
    firstDayOfWeek: preferences.firstDayOfWeek,
    defaultAccountId: preferences.defaultAccountId,
    transactionDefaultType: preferences.transactionDefaultType,
    dashboardSections: preferences.dashboardSections,
    voiceEnabled: preferences.voiceEnabled,
    trackingPersonalization: preferences.trackingPersonalization,
    assistantPersonalization: preferences.assistantPersonalization,
    analyticsEnabled: preferences.analyticsEnabled,
    monthStartDay: preferences.monthStartDay
  };
  const serialized = JSON.stringify(persisted);
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(STORAGE_KEY, serialized);
  } else {
    await SecureStore.setItemAsync(STORAGE_KEY, serialized);
  }
}

export function clearPersistedPreferences(): Promise<void> {
  return Platform.OS === 'web'
    ? AsyncStorage.removeItem(STORAGE_KEY)
    : SecureStore.deleteItemAsync(STORAGE_KEY);
}

function readPersistedPreferences(): Promise<string | null> {
  return Platform.OS === 'web'
    ? AsyncStorage.getItem(STORAGE_KEY)
    : SecureStore.getItemAsync(STORAGE_KEY);
}

function deserialize(raw: string): UserPreferences {
  try {
    const parsed = persistedPreferencesSchema.parse(JSON.parse(raw));
    return buildPreferences(parsed);
  } catch {
    // Corrupt store: fall back to defaults rather than crash. Direction is
    // re-derived from locale inside buildPreferences.
    return buildPreferences({});
  }
}
