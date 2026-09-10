import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { NotificationListQuery } from '@/domain/notifications';
import { notificationService } from '@/services/engagement-service';

export const notificationKeys = {
  list: (input: NotificationListQuery = {}) => ['notifications', 'list', input] as const,
  detail: (id: string) => ['notifications', 'detail', id] as const,
  unread: () => ['notifications', 'unread'] as const
};

export function useNotifications(input: NotificationListQuery = {}) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(input),
    initialPageParam: input.cursor,
    queryFn: ({ pageParam }) => notificationService.list({ ...input, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined
  });
}

export function useResolveNotificationOpen() {
  return useMutation({
    mutationFn: async (id: string) => {
      const target = await notificationService.resolveTarget(id);
      if ((target.status !== 'exact' && target.status !== 'fallback') || !target.target) return null;
      const action = await notificationService.revalidateAction(id, 'view');
      return action.status === 'available' ? action.target : null;
    }
  });
}

export function useNotification(id: string) {
  return useQuery({
    queryKey: notificationKeys.detail(id),
    queryFn: () => notificationService.get(id),
    enabled: Boolean(id)
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: async () => (await notificationService.list({ unreadOnly: true, pageSize: 1 })).total
  });
}

export function useMarkNotificationRead() {
  return useNotificationMutation(({ id, read }: { id: string; read: boolean }) => notificationService.markRead(id, read));
}

export function useMarkAllNotificationsRead() {
  return useNotificationMutation(({ filter, operationId }: { filter: NotificationListQuery; operationId: string }) => notificationService.markAllRead(filter, operationId));
}

export function useDeleteNotification() {
  return useNotificationMutation(({ id, operationId }: { id: string; operationId: string }) => notificationService.delete(id, operationId));
}

export function useNotificationMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<{ value: TResult; affectedScopes: readonly string[] }>
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => invalidateNotificationScopes(client, result.affectedScopes)
  });
}

export function notificationScopeToKey(scope: string): readonly unknown[] | null {
  if (scope === 'notifications.list' || scope.startsWith('notifications.mark-all')) return ['notifications', 'list'];
  if (scope === 'notifications.unread') return notificationKeys.unread();
  for (const prefix of ['notifications.detail.', 'notifications.mark-read.', 'notifications.delete.', 'notifications.action.']) {
    if (scope.startsWith(prefix) && scope.length > prefix.length) return notificationKeys.detail(scope.slice(prefix.length));
  }
  return null;
}

export async function invalidateNotificationScopes(client: QueryClient, scopes: readonly string[]): Promise<void> {
  await Promise.all(scopes.map((scope) => {
    const key = notificationScopeToKey(scope);
    return key ? client.invalidateQueries({ queryKey: key }) : Promise.resolve();
  }));
}
