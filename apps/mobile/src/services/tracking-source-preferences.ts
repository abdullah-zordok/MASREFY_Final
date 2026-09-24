import AsyncStorage from '@react-native-async-storage/async-storage';

import { registerRuntimeUserDataReset } from '@/storage/runtime-user-data-reset';

const storageKey = 'masarifi.tracking.sources.v1';

export interface TrackingSourceState {
  smsEnabled: boolean;
  notificationEnabled: boolean;
}

interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const disabled: TrackingSourceState = {
  smsEnabled: false,
  notificationEnabled: false
};

export class TrackingSourcePreferences {
  constructor(private readonly storage: StorageLike = AsyncStorage) {}

  async load(): Promise<TrackingSourceState> {
    try {
      const value = JSON.parse(
        (await this.storage.getItem(storageKey)) ?? 'null'
      );
      return {
        smsEnabled: value?.smsEnabled === true,
        notificationEnabled: value?.notificationEnabled === true
      };
    } catch {
      return { ...disabled };
    }
  }

  async set(
    source: 'sms' | 'notification',
    enabled: boolean
  ): Promise<TrackingSourceState> {
    const current = await this.load();
    const next = {
      ...current,
      [source === 'sms' ? 'smsEnabled' : 'notificationEnabled']: enabled
    };
    await this.storage.setItem(storageKey, JSON.stringify(next));
    return next;
  }

  clear(): Promise<void> {
    return this.storage.removeItem(storageKey);
  }
}

export const trackingSourcePreferences = new TrackingSourcePreferences();

registerRuntimeUserDataReset(() => trackingSourcePreferences.clear());
