import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { changeLocale } from '@/localization/i18n';
import { renderWithProviders } from '@/test-utils/render';
import { FirstLaunchOnboardingScreen } from './FirstLaunchOnboardingScreen';

const mockPrepare = jest.fn(async () => ({ shouldRequestPermission: true }));
const mockScheduleAfterPermission = jest.fn(
  async (_permission: string) => undefined
);
const mockRequestPermission = jest.fn(async () => 'granted' as const);

jest.mock('@/services/pre-signup-reminder-service', () => ({
  preSignupReminderService: {
    prepare: () => mockPrepare(),
    scheduleAfterPermission: (permission: string) =>
      mockScheduleAfterPermission(permission)
  }
}));
jest.mock('@/services/platform/phone-notification-service', () => ({
  phoneNotificationService: {
    requestPermission: () => mockRequestPermission()
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
  changeLocale('en');
});

it('continues onboarding without interrupting users for notification permission', async () => {
  const onStart = jest.fn(async () => undefined);
  renderWithProviders(<FirstLaunchOnboardingScreen onStart={onStart} />);

  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Start now' }));
  });

  expect(onStart).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole('button', { name: 'Allow notifications' })
  ).toBeNull();
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(mockScheduleAfterPermission).not.toHaveBeenCalled();
});
