import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { z } from 'zod';

import {
  authSessionSchema,
  keywordRuleSchema,
  onboardingProgressSchema,
  privacyLockPreferenceSchema,
  trackingPreferenceSchema
} from '@/domain/app-shell';
import {
  appShellStorageCapability,
  type AppShellStorage
} from '@/services/contracts/app-shell-service';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { defaultKeywordRules } from '@/services/mocks/default-keywords';

const keys = {
  session: 'masarifi.appShell.session',
  previewSession: 'masarifi.appShell.preview.session',
  onboarding: 'masarifi.appShell.onboarding',
  keywords: 'masarifi.appShell.keywords',
  trackingPreference: 'masarifi.appShell.trackingPreference',
  pendingDestination: 'masarifi.appShell.pendingDestination',
  privacyLock: 'masarifi.appShell.privacyLock',
  previewPrivacyLock: 'masarifi.appShell.preview.privacyLock',
  pinCredential: 'masarifi.appShell.pinCredential',
  profilePromptDismissed: 'masarifi.appShell.profilePromptDismissed'
};

const asyncUserDataKeys = [
  keys.onboarding,
  keys.keywords,
  keys.trackingPreference,
  keys.pendingDestination,
  keys.profilePromptDismissed
] as const;
const sensitiveUserDataKeys = [
  keys.session,
  keys.privacyLock,
  keys.pinCredential
] as const;
let activeOwnerHash: string | null = null;

export async function configureAppShellStorageOwner(userId: string): Promise<void> {
  const ownerHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    userId
  );
  await migrateLegacyPrivacyLock(ownerHash);
  activeOwnerHash = ownerHash;
}

export function clearAppShellStorageOwner(): void {
  activeOwnerHash = null;
}

export async function clearAppShellUserData(): Promise<void> {
  await Promise.all([
    ...asyncUserDataKeys.map((key) => AsyncStorage.removeItem(ownerKey(key))),
    ...sensitiveUserDataKeys.map((key) => removeSensitive(ownerKey(key)))
  ]);
}

export function createAppShellStorage(): CapabilityProviderHandle<AppShellStorage> {
  return {
    metadata: {
      id: 'protected-app-shell-storage',
      capability: appShellStorageCapability.capability,
      majorVersion: appShellStorageCapability.majorVersion,
      kind: 'mock',
      availability: 'available'
    },
    loadSession: () => readSensitive(keys.session, authSessionSchema),
    saveSession: (session) => writeSensitive(keys.session, session),
    clearSession: () => removeSensitive(keys.session),
    loadOnboarding: () => readJson(ownerKey(keys.onboarding), onboardingProgressSchema),
    saveOnboarding: (progress) => writeJson(ownerKey(keys.onboarding), progress),
    loadKeywords: async () =>
      (await readJson(ownerKey(keys.keywords), z.array(keywordRuleSchema))) ?? defaultKeywordRules,
    saveKeywords: (rules) => writeJson(ownerKey(keys.keywords), rules),
    loadTrackingPreference: () =>
      readJson(ownerKey(keys.trackingPreference), trackingPreferenceSchema),
    saveTrackingPreference: (preference) =>
      writeJson(ownerKey(keys.trackingPreference), preference),
    loadPendingDestination: () => AsyncStorage.getItem(ownerKey(keys.pendingDestination)),
    savePendingDestination: (destination) =>
      destination
        ? AsyncStorage.setItem(ownerKey(keys.pendingDestination), destination)
        : AsyncStorage.removeItem(ownerKey(keys.pendingDestination)),
    loadPrivacyLock: () =>
      readSensitive(ownerKey(keys.privacyLock), privacyLockPreferenceSchema),
    savePrivacyLock: (lock) => writeSensitive(ownerKey(keys.privacyLock), lock),
    clearPrivacyLock: () => removeSensitive(ownerKey(keys.privacyLock)),
    loadPinCredential: () => readSensitive(ownerKey(keys.pinCredential), z.string().min(1)),
    savePinCredential: (hash) => writeSensitive(ownerKey(keys.pinCredential), hash),
    clearPinCredential: () => removeSensitive(ownerKey(keys.pinCredential)),
    loadProfilePromptDismissed: async () =>
      (await readJson(ownerKey(keys.profilePromptDismissed), z.boolean())) ?? false,
    saveProfilePromptDismissed: (dismissed) =>
      writeJson(ownerKey(keys.profilePromptDismissed), dismissed)
  };
}

async function readSensitive<T>(
  nativeKey: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  const raw =
    Platform.OS === 'web'
      ? await AsyncStorage.getItem(previewKey(nativeKey))
      : await SecureStore.getItemAsync(nativeKey);
  return parse(raw, schema);
}

function writeSensitive<T>(nativeKey: string, value: T): Promise<void> {
  const serialized = JSON.stringify(value);
  return Platform.OS === 'web'
    ? AsyncStorage.setItem(previewKey(nativeKey), serialized)
    : SecureStore.setItemAsync(nativeKey, serialized);
}

function removeSensitive(nativeKey: string): Promise<void> {
  return Platform.OS === 'web'
    ? AsyncStorage.removeItem(previewKey(nativeKey))
    : SecureStore.deleteItemAsync(nativeKey);
}

async function readJson<T>(
  key: string,
  schema: z.ZodType<T>
): Promise<T | null> {
  return parse(await AsyncStorage.getItem(key), schema);
}

function writeJson<T>(key: string, value: T): Promise<void> {
  return AsyncStorage.setItem(key, JSON.stringify(value));
}

function parse<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function previewKey(nativeKey: string): string {
  if (nativeKey === keys.session) return keys.previewSession;
  if (nativeKey === keys.privacyLock) return keys.previewPrivacyLock;
  return `masarifi.appShell.preview.${nativeKey}`;
}

function ownerKey(key: string): string {
  return activeOwnerHash ? `${key}.${activeOwnerHash.slice(0, 24)}` : key;
}

async function migrateLegacyPrivacyLock(ownerHash: string): Promise<void> {
  const suffix = ownerHash.slice(0, 24);
  const ownerPrivacyLockKey = `${keys.privacyLock}.${suffix}`;
  const ownerPinKey = `${keys.pinCredential}.${suffix}`;
  const [legacyLock, legacyPin, ownerLock, ownerPin] = await Promise.all([
    readSensitive(keys.privacyLock, privacyLockPreferenceSchema),
    readSensitive(keys.pinCredential, z.string().min(1)),
    readSensitive(ownerPrivacyLockKey, privacyLockPreferenceSchema),
    readSensitive(ownerPinKey, z.string().min(1))
  ]);
  const writes: Promise<void>[] = [];
  if (legacyLock && !ownerLock)
    writes.push(writeSensitive(ownerPrivacyLockKey, legacyLock));
  if (legacyPin && !ownerPin)
    writes.push(writeSensitive(ownerPinKey, legacyPin));
  await Promise.all(writes);
  await Promise.all([
    legacyLock ? removeSensitive(keys.privacyLock) : Promise.resolve(),
    legacyPin ? removeSensitive(keys.pinCredential) : Promise.resolve()
  ]);
}
