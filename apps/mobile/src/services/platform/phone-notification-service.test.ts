import {
  createPhoneNotificationService,
  getPushDeviceRegistration,
} from './phone-notification-service';
import { changeLocale } from '@/localization/i18n';
import { Platform } from 'react-native';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '0.0.1', extra: { eas: { projectId: 'project-1' } } },
  },
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'device-fingerprint-000000000001' }));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  AndroidImportance: { DEFAULT: 'default' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn()
}));

jest.mock('expo-linking', () => ({
  __esModule: true,
  openSettings: jest.fn()
}));

const mockNotifications = jest.requireMock('expo-notifications') as {
  AndroidImportance: { DEFAULT: string };
  DEFAULT_ACTION_IDENTIFIER: string;
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponseAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  setNotificationHandler: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  setNotificationCategoryAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock;
};
const mockLinking = jest.requireMock('expo-linking') as {
  openSettings: jest.Mock;
};
const mockSecureStore = jest.requireMock('expo-secure-store') as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
};

describe('phone notification platform service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    changeLocale('en');
  });

  it('maps real permission states and requests only through the explicit education path', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: true,
      canAskAgain: true
    });
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      status: 'undetermined',
      granted: false,
      canAskAgain: true
    });
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      canAskAgain: false
    });
    mockNotifications.getPermissionsAsync.mockRejectedValueOnce(
      new Error('native unavailable')
    );
    mockNotifications.requestPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false
    });
    const service = createPhoneNotificationService();

    expect(await service.getPermission()).toBe('granted');
    expect(await service.getPermission()).toBe('not_requested');
    expect(await service.getPermission()).toBe('permanently_denied');
    expect(await service.getPermission()).toBe('unavailable');
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await service.requestPermission()).toBe('permanently_denied');
  });

  it('registers local categories and presents ID-only local payloads', async () => {
    mockNotifications.scheduleNotificationAsync.mockResolvedValueOnce(
      'phone-1'
    );
    const service = createPhoneNotificationService();

    await service.registerCategories();
    const result = await service.presentLocal({
      notificationId: 'notification-1',
      title: 'Safe title',
      body: 'Safe body',
      categoryId: 'financial-change'
    });

    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledWith({
      handleNotification: expect.any(Function)
    });
    const notificationHandler = mockNotifications.setNotificationHandler.mock
      .calls[0][0].handleNotification as () => Promise<unknown>;
    await expect(notificationHandler()).resolves.toEqual({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    });
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'financial-change',
      { name: 'Financial changes', importance: 'default' }
    );
    expect(mockNotifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      'financial-change',
      expect.arrayContaining([
        expect.objectContaining({ identifier: 'view' }),
        expect.objectContaining({ identifier: 'undo' })
      ]),
      expect.any(Object)
    );
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Safe title',
        body: 'Safe body',
        categoryIdentifier: 'financial-change',
        data: { notificationId: 'notification-1' }
      },
      trigger: null
    });
    expect(result).toEqual({ status: 'presented', identifier: 'phone-1' });
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('maps last and live responses, unsubscribes, and opens system settings', async () => {
    const remove = jest.fn();
    mockNotifications.getLastNotificationResponseAsync
      .mockResolvedValueOnce(response('last', 'edit'))
      .mockResolvedValueOnce(response('dismissed', 'dismiss'))
      .mockResolvedValueOnce(response('unknown', 'share'));
    mockNotifications.addNotificationResponseReceivedListener.mockImplementationOnce(
      (listener) => {
        listener(response('live', mockNotifications.DEFAULT_ACTION_IDENTIFIER));
        listener(response('undo-live', 'undo'));
        listener(response('bad-live', 'archive'));
        return { remove };
      }
    );
    const service = createPhoneNotificationService();
    const live = jest.fn();

    expect(await service.getLastResponse()).toEqual({
      notificationId: 'last',
      action: 'edit'
    });
    expect(await service.getLastResponse()).toBeNull();
    expect(await service.getLastResponse()).toBeNull();
    const unsubscribe = service.subscribeToResponses(live);
    unsubscribe();
    await service.openSystemSettings();

    expect(live).toHaveBeenCalledWith({
      notificationId: 'live',
      action: 'view'
    });
    expect(live).toHaveBeenCalledWith({
      notificationId: 'undo-live',
      action: 'undo'
    });
    expect(live).not.toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: 'bad-live' })
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(mockLinking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('returns a persistent installation fingerprint with the Expo push token', async () => {
    mockSecureStore.getItemAsync.mockResolvedValueOnce(null);
    mockNotifications.getExpoPushTokenAsync.mockResolvedValueOnce({
      data: 'ExponentPushToken[device-registration]',
    });

    await expect(getPushDeviceRegistration()).resolves.toEqual({
      deviceFingerprint: 'device-fingerprint-000000000001',
      platform: Platform.OS,
      appVersion: '0.0.1',
      pushToken: 'ExponentPushToken[device-registration]',
      pushProvider: 'expo',
    });
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'masarifi.notification-device-fingerprint.v1',
      'device-fingerprint-000000000001',
    );
    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'project-1',
    });
  });
});

function response(notificationId: string, actionIdentifier: string) {
  return {
    actionIdentifier,
    notification: {
      request: {
        content: { data: { notificationId } }
      }
    }
  };
}
