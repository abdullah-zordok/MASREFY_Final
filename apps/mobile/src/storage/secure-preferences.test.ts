import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  clearPersistedPreferences,
  loadPreferences
} from './secure-preferences';
import { buildPreferences } from '@/domain/foundation';

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn()
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn()
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const getAsyncStorageItem = jest.mocked(AsyncStorage.getItem);
const deleteSecureItem = jest.mocked(SecureStore.deleteItemAsync);
const removeAsyncStorageItem = jest.mocked(AsyncStorage.removeItem);
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('loadPreferences', () => {
  it('clears native persisted preferences', async () => {
    await clearPersistedPreferences();

    expect(deleteSecureItem).toHaveBeenCalledWith('masarifi.preferences');
  });

  it('clears web persisted preferences from AsyncStorage', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });

    try {
      await clearPersistedPreferences();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatform
      });
    }

    expect(removeAsyncStorageItem).toHaveBeenCalledWith('masarifi.preferences');
    expect(deleteSecureItem).not.toHaveBeenCalled();
  });

  it.each([
    ['empty object', '{}'],
    ['unsupported locale', '{"locale":"fr"}'],
    ['invalid field types', '{"hideBalances":"yes","baseCurrencyCode":"RIYAL"}']
  ])('falls back to complete defaults for %s', async (_case, stored) => {
    getItemAsync.mockResolvedValue(stored);

    await expect(loadPreferences()).resolves.toEqual(
      buildPreferences({
        locale: 'ar',
        direction: 'rtl',
        theme: 'light',
        hideBalances: false,
        baseCurrencyCode: 'SAR',
        timeZone: 'Asia/Riyadh',
        reducedMotion: false
      })
    );
  });

  it('loads a complete valid preference record', async () => {
    getItemAsync.mockResolvedValue(
      JSON.stringify({
        locale: 'en',
        theme: 'dark',
        hideBalances: true,
        baseCurrencyCode: 'USD',
        firstLaunchOnboardingCompleted: true,
        reducedMotion: true
      })
    );

    await expect(loadPreferences()).resolves.toMatchObject({
      locale: 'en',
      direction: 'ltr',
      theme: 'dark',
      hideBalances: true,
      baseCurrencyCode: 'USD',
      firstLaunchOnboardingCompleted: true,
      reducedMotion: true
    });
  });

  it('defaults first-launch onboarding to incomplete', async () => {
    getItemAsync.mockResolvedValue(null);

    await expect(loadPreferences()).resolves.toMatchObject({
      firstLaunchOnboardingCompleted: false
    });
  });

  it('defaults first-use balances to visible when no choice was stored', async () => {
    getItemAsync.mockResolvedValue(
      JSON.stringify({
        locale: 'en',
        theme: 'dark',
        baseCurrencyCode: 'USD',
        reducedMotion: true
      })
    );

    await expect(loadPreferences()).resolves.toMatchObject({
      locale: 'en',
      direction: 'ltr',
      theme: 'dark',
      hideBalances: false,
      baseCurrencyCode: 'USD',
      reducedMotion: true
    });
  });

  it.each([true, false])(
    'preserves an explicitly persisted hide-balances choice of %s',
    async (hideBalances) => {
      getItemAsync.mockResolvedValue(JSON.stringify({ hideBalances }));

      await expect(loadPreferences()).resolves.toMatchObject({ hideBalances });
    }
  );

  it('uses AsyncStorage on web where SecureStore is unavailable', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web'
    });
    getAsyncStorageItem.mockResolvedValue(null);

    try {
      await loadPreferences();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatform
      });
    }

    expect(getAsyncStorageItem).toHaveBeenCalledWith('masarifi.preferences');
    expect(getItemAsync).not.toHaveBeenCalled();
  });
});
