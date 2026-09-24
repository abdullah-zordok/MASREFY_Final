import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';
import { renderWithQueryData } from '@/test-utils/render';
import { changeLocale, translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import * as trackingPermissionModule from '@/services/platform/tracking-permission-service';
import { permissionState } from '@/services/mocks/tracking-permission-service';
import { TrackingStatusScreen } from './TrackingStatusScreen';
import { bankNotificationService } from '@/services/platform/bank-notification-service';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
}));

afterEach(() => jest.restoreAllMocks());

describe('TrackingStatusJourney', () => {
  function mockPermission(status: 'unavailable' | 'denied' | 'granted') {
    jest
      .spyOn(trackingPermissionModule, 'createTrackingPermissionService')
      .mockReturnValue({
        getState: async () => permissionState(status),
        requestAfterEducation: async () => permissionState(status),
        openSettings: async () => undefined
      });
  }

  it('shows unavailable platform tracking as disabled without a dead permission action', async () => {
    const status = {
      platform: 'android' as const,
      mode: 'automatic_clear' as const,
      permissionStatus: 'unavailable' as const,
      serviceState: 'unavailable' as const,
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 22,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    };
    mockPermission('unavailable');
    jest.spyOn(automaticTrackingService, 'getStatus').mockResolvedValue(status);
    renderWithQueryData(<TrackingStatusScreen />, [
      [automaticTrackingKeys.status, status]
    ]);
    expect(await screen.findByTestId('tracking-sms-switch')).toBeDisabled();
    expect(screen.getByTestId('tracking-notification-switch')).toBeDisabled();
    expect(
      screen.getByText(translate('tracking.permission.unavailableMessage'))
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('tracking-permission-warning-banner').props
        .accessibilityState
    ).toEqual({ disabled: true });
    expect(
      screen.queryByText(translate('tracking.howItWorks.deviceWarning'))
    ).toBeNull();
  });

  it('shows status, recovery, and explanations', async () => {
    const status = {
      platform: 'android' as const,
      mode: 'automatic_clear' as const,
      permissionStatus: 'denied' as const,
      serviceState: 'offline' as const,
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 2,
      reviewCount: 1,
      activeKeywordCount: 3,
      activeSenderCount: 4,
      lastUpdatedAt: 1
    };
    mockPermission('denied');
    jest.spyOn(automaticTrackingService, 'getStatus').mockResolvedValue(status);
    renderWithQueryData(<TrackingStatusScreen />, [
      [automaticTrackingKeys.status, status]
    ]);
    expect(await screen.findByTestId('tracking-sms-switch')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false })
    );
    expect(
      screen.getByTestId('tracking-permission-warning-banner')
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('tracking.permission.warning'))
    ).toBeOnTheScreen();
    expect(
      screen.getByText(translate('tracking.howItWorks.detection'))
    ).toBeOnTheScreen();
  });

  it('shows independent Android SMS and transaction-notification switches', async () => {
    changeLocale('en');
    mockPermission('granted');
    jest
      .spyOn(bankNotificationService, 'getAccessState')
      .mockResolvedValue('denied');
    const openNotificationSettings = jest
      .spyOn(bankNotificationService, 'openSettings')
      .mockResolvedValue();
    const status = {
      platform: 'android' as const,
      mode: 'automatic_clear' as const,
      permissionStatus: 'granted' as const,
      notificationAccessStatus: 'denied' as const,
      smsPermissionStatus: 'granted' as const,
      smsTrackingEnabled: false,
      notificationTrackingEnabled: false,
      serviceState: 'healthy' as const,
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 0,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    };
    jest.spyOn(automaticTrackingService, 'getStatus').mockResolvedValue(status);
    renderWithQueryData(<TrackingStatusScreen />, [
      [automaticTrackingKeys.status, status]
    ]);

    expect(await screen.findByText('SMS tracking')).toBeOnTheScreen();
    expect(
      screen.getByText('Transaction notification tracking')
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('tracking-notification-switch'));

    await waitFor(() =>
      expect(openNotificationSettings).toHaveBeenCalledTimes(1)
    );
  });

  it('does not show Android source controls on iOS', async () => {
    const status = {
      platform: 'ios' as const,
      mode: 'review_all' as const,
      permissionStatus: null,
      notificationAccessStatus: 'unavailable' as const,
      smsPermissionStatus: null,
      serviceState: 'healthy' as const,
      lastDetectedAt: null,
      lastSuccessfulTransactionId: null,
      detectedThisMonth: 0,
      reviewCount: 0,
      activeKeywordCount: 0,
      activeSenderCount: 0,
      lastUpdatedAt: 1
    };
    jest.spyOn(automaticTrackingService, 'getStatus').mockResolvedValue(status);
    renderWithQueryData(<TrackingStatusScreen />, [
      [automaticTrackingKeys.status, status]
    ]);

    expect(
      await screen.findByText(translate('tracking.status.enabled'))
    ).toBeOnTheScreen();
    expect(screen.queryByText('SMS tracking')).toBeNull();
    expect(screen.queryByText('Transaction notification tracking')).toBeNull();
  });
});
