import React, { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { createNotificationPreferences } from '@/domain/notifications';
import { assistantNotificationsService } from '@/services/mocks/assistant-notifications-service';
import { phoneNotificationService } from '@/services/platform/phone-notification-service';

import {
  notificationPreferenceKeys,
  useNotificationPermission,
  useOpenNotificationSettings,
  useNotificationPreferences,
  useRefreshNotificationPermission,
  useRequestNotificationPermission,
  useSaveNotificationPreferences
} from './notification-preferences-queries';

const preferences = {
  ...createNotificationPreferences(1),
  version: 3,
  phoneEnabled: true
};

beforeAll(() => {
  notifyManager.setNotifyFunction((callback) => { act(callback); });
});

afterAll(() => {
  notifyManager.setNotifyFunction((callback) => { callback(); });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('loads preferences and saves with expected version and policy projection invalidation', async () => {
  const { client, wrapper } = queryHarness();
  const getPreferences = jest.spyOn(assistantNotificationsService, 'getPreferences').mockResolvedValue(preferences);
  const savePreferences = jest.spyOn(assistantNotificationsService, 'savePreferences').mockResolvedValue({
    value: { ...preferences, version: 4, phoneEnabled: false },
    affectedScopes: ['notifications.preferences', 'notifications.list', 'notifications.unread']
  });
  client.setQueryData(notificationPreferenceKeys.policyProjection(), { stale: false });
  client.setQueryData(['notifications', 'list'], { stale: false });

  const query = renderHook(() => useNotificationPreferences(), { wrapper });
  await waitFor(() => expect(query.result.current.data?.version).toBe(3));

  const mutation = renderHook(() => useSaveNotificationPreferences(), { wrapper });
  await act(async () => {
    await mutation.result.current.mutateAsync({
      input: { ...preferences, phoneEnabled: false },
      expectedVersion: 3,
      operationId: 'save-preferences-1'
    });
  });

  await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(2));
  expect(savePreferences).toHaveBeenCalledWith(
    { ...preferences, phoneEnabled: false },
    3,
    'save-preferences-1'
  );
  expect(client.getQueryState(notificationPreferenceKeys.policyProjection())?.isInvalidated).toBe(true);
  expect(client.getQueryState(['notifications', 'list'])?.isInvalidated).toBe(true);
});

it('refreshes and requests real permission state through explicit mutations', async () => {
  const { client, wrapper } = queryHarness();
  client.setQueryData(notificationPreferenceKeys.preferences(), preferences);
  const refreshPermission = jest.spyOn(assistantNotificationsService, 'refreshPermission').mockResolvedValue('denied');
  const requestPermission = jest.spyOn(assistantNotificationsService, 'requestPermissionAfterEducation').mockResolvedValue('granted');

  const refresh = renderHook(() => useRefreshNotificationPermission(), { wrapper });
  const request = renderHook(() => useRequestNotificationPermission(), { wrapper });

  await act(async () => {
    expect(await refresh.result.current.mutateAsync()).toBe('denied');
    expect(await request.result.current.mutateAsync()).toBe('granted');
  });

  expect(refreshPermission).toHaveBeenCalledTimes(1);
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(notificationPreferenceKeys.preferences())?.isInvalidated).toBe(true);
});

it('reads OS permission and refreshes it after permission actions', async () => {
  const { wrapper } = queryHarness();
  const getPermission = jest
    .spyOn(phoneNotificationService, 'getPermission')
    .mockResolvedValueOnce('denied')
    .mockResolvedValue('granted');
  const openSystemSettings = jest
    .spyOn(phoneNotificationService, 'openSystemSettings')
    .mockResolvedValue();

  const permission = renderHook(() => useNotificationPermission(), { wrapper });
  await waitFor(() => expect(permission.result.current.data).toBe('denied'));

  const settings = renderHook(() => useOpenNotificationSettings(), { wrapper });
  await act(async () => {
    await settings.result.current.mutateAsync();
  });

  await waitFor(() => expect(permission.result.current.data).toBe('granted'));
  expect(openSystemSettings).toHaveBeenCalledTimes(1);
  expect(getPermission).toHaveBeenCalledTimes(2);
});

it('preserves cached preferences after a save conflict', async () => {
  const { client, wrapper } = queryHarness();
  client.setQueryData(notificationPreferenceKeys.preferences(), preferences);
  jest.spyOn(assistantNotificationsService, 'savePreferences').mockRejectedValue(new Error('conflict'));

  const mutation = renderHook(() => useSaveNotificationPreferences(), { wrapper });
  await expect(
    mutation.result.current.mutateAsync({
      input: { ...preferences, phoneEnabled: false },
      expectedVersion: 2,
      operationId: 'conflict'
    })
  ).rejects.toThrow('conflict');

  expect(client.getQueryData(notificationPreferenceKeys.preferences())).toEqual(preferences);
});

function queryHarness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false }
    }
  });
  const wrapper = ({ children }: PropsWithChildren) => React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
