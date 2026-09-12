import {
  useSyncExternalStore,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';

import type {
  MockFinancialEventInput,
  TrackingMode
} from '@/domain/automatic-tracking';
import { automaticTrackingService } from '@/services/automatic-tracking-service';
import {
  getAutomaticTrackingSyncState,
  subscribeAutomaticTrackingSyncState
} from '@/services/automatic-tracking-coordinator';
import { createTrackingPermissionService } from '@/services/platform/tracking-permission-service';
import { automaticTrackingKeys } from '@/state/automatic-tracking-view-state';

export function useTrackingStatus() {
  return useQuery({
    queryKey: automaticTrackingKeys.status,
    queryFn: async () => {
      const [status, permission] = await Promise.all([
        automaticTrackingService.getStatus(),
        createTrackingPermissionService().getState()
      ]);
      return {
        ...status,
        permissionStatus: permission.status,
        serviceState:
          permission.status === 'unavailable'
            ? ('unavailable' as const)
            : status.serviceState
      };
    },
    refetchOnMount: 'always'
  });
}

export function useAutomaticTrackingSyncState() {
  return useSyncExternalStore(
    subscribeAutomaticTrackingSyncState,
    getAutomaticTrackingSyncState,
    getAutomaticTrackingSyncState
  );
}

export function useTrackingHistory() {
  return useQuery({
    queryKey: automaticTrackingKeys.history(),
    queryFn: () => automaticTrackingService.listHistory()
  });
}

export function useReviewItems() {
  return useQuery({
    queryKey: automaticTrackingKeys.review(),
    queryFn: () => automaticTrackingService.listReviewItems()
  });
}

export function useReviewItem(id: string) {
  return useQuery({
    queryKey: automaticTrackingKeys.reviewItem(id),
    queryFn: () => automaticTrackingService.getReviewItem(id),
    enabled: Boolean(id)
  });
}

export function useDuplicateCandidate(id: string) {
  return useQuery({
    queryKey: automaticTrackingKeys.duplicate(id),
    queryFn: () => automaticTrackingService.getDuplicate(id),
    enabled: Boolean(id)
  });
}

export function useDuplicateCandidates() {
  return useQuery({
    queryKey: automaticTrackingKeys.duplicates(),
    queryFn: () => automaticTrackingService.listDuplicates()
  });
}

export function useKeywordRules() {
  return useQuery({
    queryKey: automaticTrackingKeys.keywords(),
    queryFn: () => automaticTrackingService.listKeywordRules()
  });
}

export function useSenderRules(search = '') {
  return useQuery({
    queryKey: automaticTrackingKeys.senders({ search }),
    queryFn: () => automaticTrackingService.listSenderRules({ search })
  });
}

export function useTrackingMutation<TVariables, TResult>(
  mutationFn: (
    variables: TVariables
  ) => Promise<{ value: TResult; affectedScopes: readonly string[] }>
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await invalidateTrackingScopes(client, result.affectedScopes);
    }
  });
}

export function useProcessMockEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MockFinancialEventInput) =>
      automaticTrackingService.processMockEvent(input),
    onSuccess: async (result) => {
      await invalidateTrackingScopes(client, result.affectedScopes);
    }
  });
}

export function useSetTrackingMode() {
  return useTrackingMutation((mode: TrackingMode) =>
    automaticTrackingService.setMode(mode).then((value) => ({
      value,
      affectedScopes: ['tracking.status']
    }))
  );
}

export function scopeToKey(scope: string): readonly unknown[] {
  const [, kind, id] = scope.split('.');
  if (scope.startsWith('tracking.status')) return automaticTrackingKeys.status;
  if (scope.startsWith('tracking.history'))
    return automaticTrackingKeys.history();
  if (scope.startsWith('tracking.review'))
    return automaticTrackingKeys.review();
  if (scope.startsWith('tracking.keywords'))
    return automaticTrackingKeys.keywords();
  if (scope.startsWith('tracking.senders'))
    return automaticTrackingKeys.senders();
  if (scope.startsWith('home')) return ['core-finance', 'home'];
  if (scope.startsWith('transactions.detail') && kind === 'detail' && id)
    return ['core-finance', 'transaction', id];
  if (scope.startsWith('transactions')) return ['core-finance', 'transactions'];
  return ['automatic-tracking'];
}

export async function invalidateTrackingScopes(
  client: QueryClient,
  scopes: readonly string[]
): Promise<void> {
  await Promise.all(
    scopes.map((scope) =>
      client.invalidateQueries({ queryKey: scopeToKey(scope) })
    )
  );
}
