import { Linking, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createMockTrackingPermissionService } from '@/services/mocks/tracking-permission-service';
import { createTrackingPermissionService } from './tracking-permission-service';
import { createAndroidTrackingPermissionService } from './tracking-permission-service.android';

jest.mock('react-native/Libraries/PermissionsAndroid/PermissionsAndroid', () => {
  const permissions = {
    PERMISSIONS: { READ_SMS: 'android.permission.READ_SMS' },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again'
    },
    check: jest.fn(),
    request: jest.fn()
  };
  return { __esModule: true, default: permissions, ...permissions };
});

describe('tracking permission services', () => {
  it.each([
    ['not_requested', 'request'],
    ['granted', 'continue'],
    ['denied', 'retry'],
    ['permanently_denied', 'open_settings'],
    ['revoked', 'open_settings'],
    ['unavailable', 'continue']
  ] as const)('maps mock %s state to one recovery action', async (status, recoveryAction) => {
    const service = createMockTrackingPermissionService(status);
    await expect(service.getState()).resolves.toMatchObject({
      status,
      recoveryAction
    });
  });

  it('requires education before requesting permission', async () => {
    const service = createMockTrackingPermissionService('not_requested');
    await expect(service.requestAfterEducation(false)).resolves.toMatchObject({
      status: 'not_requested'
    });
    await expect(service.requestAfterEducation(true)).resolves.toMatchObject({
      status: 'granted'
    });
  });

  it('keeps settings recovery non-blocking', async () => {
    const service = createMockTrackingPermissionService('permanently_denied');
    await service.openSettings();
    await expect(service.getState()).resolves.toMatchObject({
      status: 'revoked',
      blocking: false,
      recoveryAction: 'open_settings'
    });
  });

  it('keeps non-Android production platforms unavailable', async () => {
    await expect(createTrackingPermissionService().getState()).resolves.toMatchObject({
      status: 'unavailable',
      recoveryAction: 'continue'
    });
    await expect(
      createTrackingPermissionService().requestAfterEducation()
    ).resolves.toMatchObject({
      status: 'unavailable',
      recoveryAction: 'continue'
    });
  });

  it.each([
    [null, 'not_requested', 'request'],
    ['denied', 'denied', 'retry'],
    ['permanently_denied', 'permanently_denied', 'open_settings'],
    ['granted', 'revoked', 'open_settings']
  ] as const)('maps Android history %s to %s', async (previous, status, recoveryAction) => {
    jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(previous);

    await expect(createAndroidTrackingPermissionService().getState()).resolves.toMatchObject({
      status,
      recoveryAction
    });
  });

  it('recognizes and persists an existing Android grant', async () => {
    jest.mocked(PermissionsAndroid.check).mockResolvedValue(true);

    await expect(createAndroidTrackingPermissionService().getState()).resolves.toMatchObject({
      status: 'granted'
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'masarifi.appShell.smsPermissionStatus',
      'granted'
    );
  });

  it.each([
    [PermissionsAndroid.RESULTS.GRANTED, 'granted'],
    [PermissionsAndroid.RESULTS.DENIED, 'denied'],
    [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, 'permanently_denied']
  ] as const)('maps Android request result %s', async (result, status) => {
    jest.mocked(PermissionsAndroid.request).mockResolvedValue(result);

    await expect(
      createAndroidTrackingPermissionService().requestAfterEducation()
    ).resolves.toMatchObject({ status });
  });

  it('opens Android application settings', async () => {
    await createAndroidTrackingPermissionService().openSettings();
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });
});
