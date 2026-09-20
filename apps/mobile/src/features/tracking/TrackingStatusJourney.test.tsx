import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

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
    expect(
      (await screen.findAllByText(translate('tracking.status.unavailable')))
        .length
    ).toBeGreaterThan(0);
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
    expect(
      await screen.findByText(translate('tracking.status.enabled'))
    ).toBeOnTheScreen();
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

  it('shows independent Android bank notification and SMS source controls', async () => {
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

    expect(await screen.findByText('Bank notifications')).toBeOnTheScreen();
    expect(screen.getByText('Financial SMS')).toBeOnTheScreen();
    expect(screen.getAllByText('Granted')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('tracking-bank-notifications-source'));

    expect(openNotificationSettings).toHaveBeenCalledTimes(1);
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

    expect(await screen.findByText(translate('tracking.status.enabled'))).toBeOnTheScreen();
    expect(screen.queryByText('Bank notifications')).toBeNull();
    expect(screen.queryByText('Financial SMS')).toBeNull();
  });
});
