import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { createNotificationPreferences } from '@/domain/notifications';
import { renderWithProviders } from '@/test-utils/render';
import { changeLocale } from '@/localization/i18n';

import { NotificationPreferencesScreen } from './NotificationPreferencesScreen';

const mockPreferences = jest.fn();
const mockSave = { mutate: jest.fn(), isPending: false };
const mockRequest = { mutate: jest.fn(), isPending: false };
const mockOpenSettings = { mutate: jest.fn(), isPending: false };
const mockPermissionRefetch = jest.fn();
let mockPermission = 'denied';

jest.mock('./notification-preferences-queries', () => ({
  useNotificationPreferences: () => mockPreferences(),
  useSaveNotificationPreferences: () => mockSave,
  useRequestNotificationPermission: () => mockRequest,
  useOpenNotificationSettings: () => mockOpenSettings,
  useNotificationPermission: () => ({
    data: mockPermission,
    isLoading: false,
    isError: false,
    refetch: mockPermissionRefetch
  })
}));

const preferences = {
  ...createNotificationPreferences(1),
  version: 7,
  phoneEnabled: true,
  permissionState: 'denied' as const,
  dailySummary: { enabled: true, time: '09:30' },
  weeklySummary: { enabled: false, weekday: 1, time: '10:00' }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = 'denied';
  changeLocale('en');
  mockPreferences.mockReturnValue({ data: preferences, isLoading: false, isError: false, refetch: jest.fn() });
});

it('renders every preference section and preserves edited input after save errors', async () => {
  mockSave.mutate.mockImplementation((_input, options) => options?.onError?.(new Error('offline')));
  renderWithProviders(<NotificationPreferencesScreen />);

  [
    'Automatic transaction alerts',
    'Income alerts',
    'Obligations',
    'Budgets',
    'Salary',
    'Savings goals',
    'Reports',
    'Assistant',
    'Security',
    'System updates',
    'App inactivity reminders',
    'Financial activity reminders',
    'Quiet Sunday',
    'Quiet Monday',
    'Quiet Tuesday',
    'Quiet Wednesday',
    'Quiet Thursday',
    'Quiet Friday',
    'Quiet Saturday',
    'Phone notifications',
    'Quiet hours'
  ].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));

  expect(screen.queryByText('Hide amounts on lock screen')).toBeNull();
  expect(screen.queryByText('Daily summary')).toBeNull();
  expect(screen.queryByText('Weekly summary')).toBeNull();

  expect(screen.getByDisplayValue('22:00')).toBeTruthy();
  expect(screen.getByDisplayValue('07:00')).toBeTruthy();
  expect(screen.getByDisplayValue('Asia/Riyadh')).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText('Quiet timezone'), 'Asia/Dubai');
  fireEvent.press(screen.getByLabelText('Budgets'));
  fireEvent.press(screen.getByText('Quiet Friday'));
  fireEvent.press(screen.getByLabelText('Save notification preferences'));

  expect(mockSave.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedVersion: 7,
      input: expect.objectContaining({
        phoneEnabled: true,
        hideAmountsOnLockScreen: true,
        categoryEnabled: expect.objectContaining({ budget: false }),
        quietHours: expect.objectContaining({
          timeZone: 'Asia/Dubai',
          weekdays: expect.not.arrayContaining([5])
        }),
        dailySummary: expect.objectContaining({ enabled: true, time: '09:30' }),
        weeklySummary: expect.objectContaining({ weekday: 1, time: '10:00' })
      })
    }),
    expect.any(Object)
  );
  expect(await screen.findByText('Could not save preferences')).toBeTruthy();
  expect(screen.getByDisplayValue('Asia/Dubai')).toBeTruthy();
});

it('saves reminder preferences separately from transaction alerts', () => {
  renderWithProviders(<NotificationPreferencesScreen />);

  fireEvent.press(screen.getByLabelText('App inactivity reminders'));
  fireEvent.press(screen.getByLabelText('Save notification preferences'));

  expect(mockSave.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({
        categoryEnabled: expect.objectContaining({
          app_inactivity: false,
          transaction: true,
        }),
      }),
    }),
    expect.any(Object),
  );
});

it.each(['not_requested', 'denied'])(
  'hides permission details and requests the OS permission directly when permission is %s',
  (permissionState) => {
    mockPermission = permissionState;
    renderWithProviders(<NotificationPreferencesScreen />);

    expect(screen.queryByText(/Current permission/i)).toBeNull();
    expect(screen.queryByText(/Permission not requested/i)).toBeNull();
    expect(screen.queryByText('Request notification permission')).toBeNull();
    expect(screen.queryByText('Request permission')).toBeNull();
    expect(screen.getByLabelText('Phone notifications').props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByLabelText('Phone notifications'));

    expect(mockRequest.mutate).toHaveBeenCalledTimes(1);
    expect(mockOpenSettings.mutate).not.toHaveBeenCalled();
  },
);

it.each(['permanently_denied', 'unavailable'])(
  'opens settings from the phone row when permission is %s',
  (permissionState) => {
    mockPermission = permissionState;
    renderWithProviders(<NotificationPreferencesScreen />);

    fireEvent.press(screen.getByLabelText('Phone notifications'));

    expect(mockOpenSettings.mutate).toHaveBeenCalledTimes(1);
    expect(mockRequest.mutate).not.toHaveBeenCalled();
  },
);

it('reflects granted permission and opens OS settings when the user tries to disable it', () => {
  mockPermission = 'granted';
  renderWithProviders(<NotificationPreferencesScreen />);

  expect(screen.getByLabelText('Phone notifications').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByLabelText('Phone notifications'));

  expect(mockOpenSettings.mutate).toHaveBeenCalledTimes(1);
  expect(mockRequest.mutate).not.toHaveBeenCalled();
});

it('shows loading and offline recovery states', () => {
  mockPreferences.mockReturnValueOnce({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
  const loading = renderWithProviders(<NotificationPreferencesScreen />);
  expect(screen.getByText('Loading notification preferences')).toBeTruthy();
  loading.unmount();

  const refetch = jest.fn();
  mockPreferences.mockReturnValueOnce({ data: undefined, isLoading: false, isError: true, refetch });
  renderWithProviders(<NotificationPreferencesScreen />);
  fireEvent.press(screen.getByLabelText('Retry'));
  expect(refetch).toHaveBeenCalledTimes(1);
});
