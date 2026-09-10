import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { NotificationPreferencesInput } from '@/domain/notifications';
import { notificationService } from '@/services/engagement-service';
import { invalidateNotificationScopes } from './notification-queries';

export const notificationPreferenceKeys = {
  preferences: () => ['notifications', 'preferences'] as const,
  policyProjection: () => ['notifications', 'policy-projection'] as const
};

export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationPreferenceKeys.preferences(),
    queryFn: () => notificationService.getPreferences()
  });
}

export function useSaveNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      expectedVersion,
      operationId
    }: {
      input: NotificationPreferencesInput;
      expectedVersion: number;
      operationId: string;
    }) =>
      notificationService.savePreferences(
        input,
        expectedVersion,
        operationId
      ),
    onSuccess: async (result) => {
      await invalidatePreferences(client, result.affectedScopes);
    }
  });
}

export function useRefreshNotificationPermission() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.refreshPermission(),
    onSuccess: () => invalidatePreferences(client)
  });
}

export function useRequestNotificationPermission() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.requestPermissionAfterEducation(),
    onSuccess: () => invalidatePreferences(client)
  });
}

async function invalidatePreferences(
  client: ReturnType<typeof useQueryClient>,
  affectedScopes: readonly string[] = []
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: notificationPreferenceKeys.preferences() }),
    client.invalidateQueries({ queryKey: notificationPreferenceKeys.policyProjection() }),
    invalidateNotificationScopes(client, affectedScopes)
  ]);
}
