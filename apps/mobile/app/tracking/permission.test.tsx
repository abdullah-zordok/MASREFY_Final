import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import PermissionRoute from './permission';
import { permissionState } from '@/services/mocks/tracking-permission-service';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import { translate } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';

const mockPermissionService = {
  getState: jest.fn(),
  requestAfterEducation: jest.fn(),
  openSettings: jest.fn()
};
const mockUseLocalSearchParams = jest.fn();

jest.mock('@/services/platform/tracking-permission-service', () => ({
  createTrackingPermissionService: () => mockPermissionService
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockUseLocalSearchParams()
}));

describe('tracking permission route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ mode: 'review_all' });
    mockPermissionService.getState.mockResolvedValue(
      permissionState('not_requested')
    );
    mockPermissionService.requestAfterEducation.mockResolvedValue(
      permissionState('granted')
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('requests only after education and enables the requested mode after grant', async () => {
    const setMode = jest
      .spyOn(automaticTrackingService, 'setMode')
      .mockResolvedValue({} as never);
    renderWithProviders(<PermissionRoute />);

    fireEvent.press(
      await screen.findByLabelText(translate('appShell.permission.enable'))
    );

    await waitFor(() => {
      expect(mockPermissionService.requestAfterEducation).toHaveBeenCalledTimes(1);
      expect(setMode).toHaveBeenCalledWith('review_all');
      expect(router.replace).toHaveBeenCalledWith('/tracking');
    });
  });

  it('opens settings for a permanently denied permission without enabling', async () => {
    mockPermissionService.getState.mockResolvedValue(
      permissionState('permanently_denied')
    );
    const setMode = jest.spyOn(automaticTrackingService, 'setMode');
    renderWithProviders(<PermissionRoute />);

    fireEvent.press(
      await screen.findByLabelText(translate('appShell.permission.openSettings'))
    );

    await waitFor(() => expect(mockPermissionService.openSettings).toHaveBeenCalledTimes(1));
    expect(mockPermissionService.requestAfterEducation).not.toHaveBeenCalled();
    expect(setMode).not.toHaveBeenCalled();
  });
});
