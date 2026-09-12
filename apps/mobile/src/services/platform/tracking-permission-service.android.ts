import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, PermissionsAndroid } from 'react-native';

import type { TrackingPermissionService } from '@/services/contracts/app-shell-service';
import { permissionState } from '@/services/mocks/tracking-permission-service';

const permissionHistoryKey = 'masarifi.appShell.smsPermissionStatus';

export function createAndroidTrackingPermissionService(): TrackingPermissionService {
  return {
    async getState() {
      if (
        await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)
      ) {
        await AsyncStorage.setItem(permissionHistoryKey, 'granted');
        return permissionState('granted');
      }
      const previous = await AsyncStorage.getItem(permissionHistoryKey);
      return permissionState(
        previous === 'granted'
          ? 'revoked'
          : previous === 'permanently_denied'
            ? 'permanently_denied'
            : previous === 'denied'
              ? 'denied'
              : 'not_requested'
      );
    },
    async requestAfterEducation() {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS
      );
      const status =
        result === PermissionsAndroid.RESULTS.GRANTED
          ? 'granted'
          : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
            ? 'permanently_denied'
            : 'denied';
      await AsyncStorage.setItem(permissionHistoryKey, status);
      return permissionState(status);
    },
    async openSettings() {
      await Linking.openSettings();
    }
  };
}

export const createTrackingPermissionService =
  createAndroidTrackingPermissionService;

