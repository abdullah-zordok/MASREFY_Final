import { requireOptionalNativeModule } from 'expo-modules-core';

export interface MasarifiSmsInboxModule {
  readRecentSms(since: number, limit: number): Promise<unknown>;
  isNetworkAvailable(): Promise<unknown>;
}

export const MasarifiSmsInbox =
  requireOptionalNativeModule<MasarifiSmsInboxModule>('MasarifiSmsInbox');

