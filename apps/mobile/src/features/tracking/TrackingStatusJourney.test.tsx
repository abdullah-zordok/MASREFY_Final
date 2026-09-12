import React from 'react';
import { screen } from '@testing-library/react-native';

import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';
import { renderWithQueryData } from '@/test-utils/render';
import { translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import * as trackingPermissionModule from '@/services/platform/tracking-permission-service';
import { permissionState } from '@/services/mocks/tracking-permission-service';
import { TrackingStatusScreen } from './TrackingStatusScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }
}));

afterEach(() => jest.restoreAllMocks());

describe('TrackingStatusJourney', () => {
  function mockPermission(status: 'unavailable' | 'denied') {
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
      await screen.findByText(translate('tracking.status.unavailable'))
    ).toBeOnTheScreen();
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
});
