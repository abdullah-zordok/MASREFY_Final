import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SupportDraftInput, SupportDraft } from '@/domain/support';
import { supportService } from '@/services/engagement-service';

type DraftValues = SupportDraftInput;
type DraftService = Pick<typeof supportService, 'saveDraft' | 'loadDraft' | 'discardDraft'>;

export function useSupportDraft({
  draftId,
  mode,
  service = supportService,
  debounceMs = 300,
  initialContext = null,
  ticketId = null
}: {
  draftId: string;
  mode: SupportDraftInput['mode'];
  service?: DraftService;
  debounceMs?: number;
  initialContext?: SupportDraftInput['context'];
  ticketId?: string | null;
}) {
  const [values, setValues] = useState<DraftValues>(() => emptyDraft(draftId, mode, ticketId, initialContext));
  const [safeFailure, setSafeFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const submittedRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    void service.loadDraft(draftId)
      .then((draft) => { if (alive && draft) setValues(inputFromDraft(draft)); })
      .catch((error) => { if (alive) setSafeFailure(error && typeof error === 'object' && 'code' in error ? String(error.code) : 'representative_failure'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [draftId, service]);

  const save = useCallback(async (next: DraftValues) => {
    try {
      await service.saveDraft(next);
      setSafeFailure(null);
    } catch (error) {
      setSafeFailure(error && typeof error === 'object' && 'code' in error ? String(error.code) : 'representative_failure');
    }
  }, [service]);

  useEffect(() => {
    if (loading || submittedRef.current || !dirtyRef.current) return;
    const timer = setTimeout(() => {
      if (!submittedRef.current) void save(values);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, loading, save, values]);

  return useMemo(() => ({
    values,
    loading,
    safeFailure,
    update(patch: Partial<DraftValues>) {
      dirtyRef.current = true;
      setValues((current) => ({ ...current, ...patch }));
    },
    retrySave: () => save(values),
    markSubmitted() {
      submittedRef.current = true;
    },
    async discard() {
      await service.discardDraft(draftId);
      dirtyRef.current = false;
      setSafeFailure(null);
      setValues(emptyDraft(draftId, mode, ticketId, initialContext));
    }
  }), [draftId, initialContext, loading, mode, safeFailure, save, service, ticketId, values]);
}

function emptyDraft(id: string, mode: SupportDraftInput['mode'], ticketId: string | null, context: SupportDraftInput['context']): DraftValues {
  return { id, mode, category: 'technical', subject: '', description: '', ticketId: mode === 'reply' ? ticketId ?? '' : null, context: mode === 'transaction_report' || mode === 'assistant_report' ? context : null } as DraftValues;
}

function inputFromDraft(draft: SupportDraft): DraftValues {
  const { status: _status, updatedAt: _updatedAt, ...input } = draft;
  return input;
}
