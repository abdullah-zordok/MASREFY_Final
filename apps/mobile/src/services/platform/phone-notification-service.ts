import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type {
  PhoneNotificationResponse,
  PhoneNotificationService
} from '@/services/contracts/assistant-notifications-service';
import type { NotificationPermissionState } from '@/domain/notifications';
import { translateDynamic } from '@/localization/i18n';

const ExpoNotifications =
  (Notifications as unknown as { default?: typeof Notifications }).default ??
  Notifications;
const ExpoLinking =
  (Linking as unknown as { default?: typeof Linking }).default ?? Linking;
const deviceFingerprintKey = 'masarifi.notification-device-fingerprint.v1';

export type PushDeviceRegistration = {
  deviceFingerprint: string;
  platform: 'android' | 'ios';
  appVersion: string;
  pushToken: string;
  pushProvider: 'expo';
};

export async function getPushDeviceRegistration(): Promise<PushDeviceRegistration | null> {
  if (
    (Platform.OS !== 'android' && Platform.OS !== 'ios') ||
    !ExpoNotifications?.getExpoPushTokenAsync
  )
    return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const appVersion = Constants.expoConfig?.version;
  if (typeof projectId !== 'string' || typeof appVersion !== 'string') return null;
  try {
    let deviceFingerprint = await SecureStore.getItemAsync(deviceFingerprintKey);
    if (!deviceFingerprint || deviceFingerprint.length < 16) {
      deviceFingerprint = randomUUID();
      await SecureStore.setItemAsync(deviceFingerprintKey, deviceFingerprint);
    }
    const pushToken = (await ExpoNotifications.getExpoPushTokenAsync({ projectId })).data;
    if (typeof pushToken !== 'string' || pushToken.length < 16) return null;
    return {
      deviceFingerprint,
      platform: Platform.OS,
      appVersion,
      pushToken,
      pushProvider: 'expo',
    };
  } catch {
    return null;
  }
}

export function createPhoneNotificationService(): PhoneNotificationService {
  return {
    async getPermission() {
      if (Platform.OS === 'web' || !ExpoNotifications?.getPermissionsAsync) {
        return 'unavailable';
      }
      try {
        return mapPermission(await ExpoNotifications.getPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async requestPermission() {
      if (
        Platform.OS === 'web' ||
        !ExpoNotifications?.requestPermissionsAsync
      ) {
        return 'unavailable';
      }
      try {
        return mapPermission(await ExpoNotifications.requestPermissionsAsync());
      } catch {
        return 'unavailable';
      }
    },
    async registerCategories() {
      if (Platform.OS === 'web') return;
      try {
        ExpoNotifications?.setNotificationHandler?.({
          handleNotification: async () => ({
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true
          })
        });
        await ExpoNotifications?.setNotificationChannelAsync?.(
          'financial-change',
          {
            name: translateDynamic('notifications.channel.financialChanges'),
            importance: ExpoNotifications.AndroidImportance?.DEFAULT
          }
        );
        await ExpoNotifications?.setNotificationCategoryAsync?.(
          'financial-change',
          [
            {
              identifier: 'view',
              buttonTitle: translateDynamic('notifications.actions.view'),
              options: { opensAppToForeground: true }
            },
            {
              identifier: 'edit',
              buttonTitle: translateDynamic('notifications.actions.edit'),
              options: { opensAppToForeground: true }
            },
            {
              identifier: 'undo',
              buttonTitle: translateDynamic('notifications.actions.undo'),
              options: { opensAppToForeground: true }
            }
          ],
          { previewPlaceholder: 'Masarifi' }
        );
      } catch {
        // Platform unsupported
      }
    },
    async presentLocal(input) {
      if (
        Platform.OS === 'web' ||
        !ExpoNotifications?.scheduleNotificationAsync
      ) {
        return { status: 'failed', identifier: null };
      }
      try {
        const identifier = await ExpoNotifications.scheduleNotificationAsync({
          content: {
            title: input.title,
            body: input.body,
            categoryIdentifier: input.categoryId,
            data: { notificationId: input.notificationId }
          },
          trigger: null
        });
        return { status: 'presented', identifier };
      } catch {
        return { status: 'failed', identifier: null };
      }
    },
    async getLastResponse() {
      if (
        Platform.OS === 'web' ||
        !ExpoNotifications?.getLastNotificationResponseAsync
      ) {
        return null;
      }
      try {
        return responseFromExpo(
          await ExpoNotifications.getLastNotificationResponseAsync()
        );
      } catch {
        return null;
      }
    },
    subscribeToResponses(listener) {
      if (
        Platform.OS === 'web' ||
        !ExpoNotifications?.addNotificationResponseReceivedListener
      ) {
        return () => {};
      }
      try {
        const subscription =
          ExpoNotifications.addNotificationResponseReceivedListener(
            (response) => {
              const mapped = responseFromExpo(response);
              if (mapped) listener(mapped);
            }
          );
        return () => subscription?.remove?.();
      } catch {
        return () => {};
      }
    },
    async openSystemSettings() {
      if (Platform.OS === 'web' || !ExpoLinking?.openSettings) {
        return;
      }
      try {
        await ExpoLinking.openSettings();
      } catch {
        // Platform unsupported
      }
    }
  };
}

export const phoneNotificationService = createPhoneNotificationService();

function mapPermission(status: {
  granted?: boolean;
  canAskAgain?: boolean;
  status?: string;
}): NotificationPermissionState {
  if (status.granted) return 'granted';
  if (status.status === 'undetermined') return 'not_requested';
  return status.canAskAgain === false ? 'permanently_denied' : 'denied';
}

function responseFromExpo(response: unknown): PhoneNotificationResponse | null {
  if (!response || typeof response !== 'object') return null;
  const value = response as {
    actionIdentifier?: string;
    notification?: {
      request?: { content?: { data?: Record<string, unknown> } };
    };
  };
  const notificationId =
    value.notification?.request?.content?.data?.notificationId;
  if (typeof notificationId !== 'string') return null;
  const action = mapAction(value.actionIdentifier);
  if (!action) return null;
  return {
    notificationId,
    action
  };
}

function mapAction(
  actionIdentifier?: string
): PhoneNotificationResponse['action'] | null {
  if (
    actionIdentifier === 'view' ||
    actionIdentifier ===
      (ExpoNotifications as { DEFAULT_ACTION_IDENTIFIER?: string })
        .DEFAULT_ACTION_IDENTIFIER
  )
    return 'view';
  if (actionIdentifier === 'edit' || actionIdentifier === 'undo')
    return actionIdentifier;
  return null;
}
