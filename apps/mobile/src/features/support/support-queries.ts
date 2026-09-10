import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { SupportDraftInput, SupportReplyInput } from '@/domain/support';
import { supportService } from '@/services/engagement-service';

export const supportKeys = {
  articles: (query: string, category?: string) => ['support', 'articles', query, category ?? 'all'] as const,
  tickets: () => ['support', 'tickets'] as const,
  ticket: (id: string) => ['support', 'ticket', id] as const,
  draft: (id: string) => ['support', 'draft', id] as const
};

export function useArticleSearch(input: { query: string; category?: string }) {
  return useQuery({ queryKey: supportKeys.articles(input.query, input.category), queryFn: () => supportService.searchArticles(input) });
}

export function useSupportTickets(cursor?: string) {
  return useQuery({ queryKey: [...supportKeys.tickets(), cursor ?? ''] as const, queryFn: () => supportService.listTickets(cursor) });
}

export function useSupportTicket(id?: string) {
  return useQuery({ queryKey: supportKeys.ticket(id ?? ''), queryFn: () => supportService.getTicket(id ?? ''), enabled: Boolean(id) });
}

export function useSupportDraftQuery(id?: string) {
  return useQuery({ queryKey: supportKeys.draft(id ?? ''), queryFn: () => supportService.loadDraft(id ?? ''), enabled: Boolean(id) });
}

export function useSaveSupportDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SupportDraftInput) => supportService.saveDraft(input),
    onSuccess: (draft) => { void client.invalidateQueries({ queryKey: supportKeys.draft(draft.id) }); }
  });
}

export function useDiscardSupportDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => supportService.discardDraft(id).then(() => id),
    onSuccess: (id) => { void client.invalidateQueries({ queryKey: supportKeys.draft(id) }); }
  });
}

export function useSubmitSupportDraft() {
  return useSupportMutation(({ draftId, operationId }: { draftId: string; operationId: string }) => supportService.submitDraft(draftId, operationId));
}

export function useReplyToTicket() {
  return useSupportMutation(({ ticketId, input, expectedVersion, operationId }: { ticketId: string; input: SupportReplyInput; expectedVersion: number; operationId: string }) =>
    supportService.reply(ticketId, input, expectedVersion, operationId)
  );
}

export function useRateTicket() {
  return useSupportMutation(({ ticketId, rating, expectedVersion, operationId }: { ticketId: string; rating: number; expectedVersion: number; operationId: string }) =>
    supportService.rate(ticketId, rating, expectedVersion, operationId)
  );
}

function useSupportMutation<TVariables, TValue>(mutationFn: (variables: TVariables) => Promise<{ value: TValue; affectedScopes: readonly string[] }>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => invalidateSupportScopes(client, result.affectedScopes)
  });
}

export async function invalidateSupportScopes(client: QueryClient, scopes: readonly string[]) {
  await Promise.all(scopes.map((scope) => {
    const key = supportScopeToKey(scope);
    return key ? client.invalidateQueries({ queryKey: key }) : Promise.resolve();
  }));
}

export function supportScopeToKey(scope: string): readonly unknown[] | null {
  if (scope === 'support.tickets') return supportKeys.tickets();
  if (scope.startsWith('support.ticket.') && scope.length > 'support.ticket.'.length) return supportKeys.ticket(scope.slice('support.ticket.'.length));
  if (scope.startsWith('support.draft.') && scope.length > 'support.draft.'.length) return supportKeys.draft(scope.slice('support.draft.'.length));
  return null;
}
