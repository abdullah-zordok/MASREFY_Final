import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import {
  VOICE_MAX_DURATION_MS,
  proposalErrors,
  selectedProposals,
  type VoiceErrorCode,
  type VoiceProposalGroup,
  type VoiceSessionState,
  type VoiceTranscript,
  type VoiceTransactionProposal
} from '@/domain/voice-capture';
import { invalidateCoreFinanceScopes } from '@/features/core-finance/core-finance-queries';
import type { NotificationSourceEvent } from '@/services/contracts/assistant-notifications-service';
import { VoiceCaptureError } from '@/services/contracts/voice-capture-service';
import { notificationService } from '@/services/engagement-service';
import { voiceAnalyzerService } from '@/services/voice-analyzer-service';
import { voiceCategoryService } from '@/services/mocks/voice-category-service';
import { voiceRecorderService } from '@/services/platform/voice-recorder-service';
import { useVoiceCaptureStore } from '@/state/voice-capture';

function safeError(error: unknown): VoiceErrorCode {
  if (error instanceof VoiceCaptureError) return error.code as VoiceErrorCode;
  if (error instanceof Error && error.message === 'invalid_proposal')
    return 'invalid_proposal';
  return 'unknown';
}

function canRefreshPermissionState(
  state: VoiceSessionState,
  errorCode: VoiceErrorCode | null
) {
  return (
    ['idle', 'permission_required', 'ready'].includes(state) ||
    (state === 'failed' &&
      ['permission_denied', 'permission_permanent'].includes(errorCode ?? ''))
  );
}

export function useVoiceCapture({
  permissionSync = 'on-mount'
}: {
  permissionSync?: 'on-mount' | 'on-demand';
} = {}) {
  const session = useVoiceCaptureStore();
  const client = useQueryClient();
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startInFlight = useRef(false);
  const stopInFlight = useRef(false);
  const saveInFlight = useRef(false);
  const emittedNotifications = useRef(new Set<string>());
  const pendingNotifications = useRef(new Map<string, Promise<void>>());

  const clearTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const fail = useCallback(
    (error: unknown) => {
      clearTimer();
      useVoiceCaptureStore.getState().transition('failed', safeError(error));
    },
    [clearTimer]
  );

  const syncPermission = useCallback(async () => {
    try {
      const permission = await voiceRecorderService.getPermission();
      const current = useVoiceCaptureStore.getState();
      if (canRefreshPermissionState(current.state, current.errorCode)) {
        current.patch({
          permission,
          state: permission === 'granted' ? 'ready' : 'permission_required'
        });
      } else current.patch({ permission });
    } catch (error) {
      const current = useVoiceCaptureStore.getState();
      if (canRefreshPermissionState(current.state, current.errorCode))
        fail(error);
    }
  }, [fail]);

  useEffect(() => {
    if (permissionSync === 'on-mount') void syncPermission();
  }, [permissionSync, syncPermission]);

  const requestPermission = async () => {
    try {
      const permission = await voiceRecorderService.requestPermission();
      session.patch({ permission });
      if (permission === 'granted') session.transition('ready');
      else
        session.transition(
          'failed',
          permission === 'permanently_denied'
            ? 'permission_permanent'
            : 'permission_denied'
        );
    } catch (error) {
      fail(error);
    }
  };

  const start = async () => {
    if (
      startInFlight.current ||
      useVoiceCaptureStore.getState().state !== 'ready'
    )
      return;
    startInFlight.current = true;
    try {
      const recording = await voiceRecorderService.start();
      if (!mounted.current) {
        await voiceRecorderService.cancel(recording.id);
        return;
      }
      const timezoneOffsetMinutes = new Date(
        recording.startedAt
      ).getTimezoneOffset();
      session.patch({
        recordingId: recording.id,
        startedAt: recording.startedAt,
        timezoneOffsetMinutes,
        durationMs: 0,
        errorCode: null,
        state: 'recording'
      });
      const startedAt = recording.startedAt;
      timer.current = setInterval(() => {
        const durationMs = Math.min(
          Date.now() - startedAt,
          VOICE_MAX_DURATION_MS
        );
        session.patch({ durationMs });
        if (durationMs >= VOICE_MAX_DURATION_MS) void stop(recording.id);
      }, 250);
    } catch (error) {
      fail(error);
    }
  };

  const saveCategoryPreferences = (proposals: VoiceTransactionProposal[]) =>
    Promise.allSettled(
      proposals
        .filter(
          (proposal) =>
            proposal.categoryPreference === 'always_for_merchant' &&
            proposal.merchant &&
            proposal.categoryId
        )
        .map((proposal) =>
          voiceCategoryService.savePreference(
            proposal.merchant!,
            proposal.categoryId!
          )
        )
    );

  const persistProposals = async (
    group: VoiceProposalGroup,
    proposals: VoiceTransactionProposal[],
    operationId: string
  ) => {
    const mutation = await voiceAnalyzerService.confirm({
      group,
      proposals,
      operationId
    });
    await saveCategoryPreferences(proposals);
    await emitVoiceNotification(
      { ...group, proposals },
      proposals.some(hasConfirmedObligationLink) ? 'obligation-link' : 'saved',
      emittedNotifications.current,
      pendingNotifications.current,
      mutation.transactionIds[0]
    );
    await invalidateCoreFinanceScopes(client, mutation.affectedScopes);
  };

  const openVoiceReview = async (
    group: VoiceProposalGroup,
    proposals: VoiceTransactionProposal[]
  ) => {
    const reviewGroup: VoiceProposalGroup = {
      ...group,
      proposals,
      status: 'reviewing',
      saveErrorCode: null
    };
    await emitVoiceNotification(
      reviewGroup,
      proposals.some(hasDuplicateSignal) ? 'duplicate' : 'review-required',
      emittedNotifications.current,
      pendingNotifications.current
    );
    useVoiceCaptureStore.getState().patch({
      group: reviewGroup,
      state: 'proposal_review',
      errorCode: null
    });
  };

  const routeAnalyzedGroup = async (group: VoiceProposalGroup) => {
    if (!group.proposals.length) {
      useVoiceCaptureStore.getState().patch({
        state: 'failed',
        durationMs: 0,
        transcript: null,
        group: null,
        errorCode: 'no_speech'
      });
      return;
    }
    await openVoiceReview(group, group.proposals);
  };

  const analyzeTranscript = async (transcript: VoiceTranscript) => {
    const current = useVoiceCaptureStore.getState();
    if (!current.startedAt || current.timezoneOffsetMinutes === null) return;
    current.transition('analyzing');
    try {
      const group = await voiceAnalyzerService.analyze({
        transcript,
        scenario: current.scenario,
        sessionId: current.id,
        recordedAt: current.startedAt,
        timezoneOffsetMinutes: current.timezoneOffsetMinutes
      });
      await routeAnalyzedGroup(group);
    } catch (error) {
      fail(error);
    } finally {
      startInFlight.current = false;
    }
  };

  const stop = async (recordingId = session.recordingId) => {
    if (!recordingId || stopInFlight.current) return;
    stopInFlight.current = true;
    clearTimer();
    session.transition('stopping');
    let audioReference: string | null = null;
    try {
      audioReference = await voiceRecorderService.stop(recordingId);
      session.patch({
        audioReference,
        recordingId: null,
        state: 'transcribing'
      });
      const transcript = await voiceAnalyzerService.transcribe(
        audioReference,
        session.scenario,
        useVoiceCaptureStore.getState().durationMs
      );
      session.setTranscript(transcript);
      await analyzeTranscript(transcript);
    } catch (error) {
      fail(error);
    } finally {
      let cleanupFailed = false;
      if (audioReference) {
        try {
          await voiceRecorderService.remove(audioReference);
        } catch {
          cleanupFailed = true;
        }
      }
      session.patch({
        audioReference: cleanupFailed ? audioReference : null,
        recordingId: null
      });
      stopInFlight.current = false;
    }
  };

  const cancelRecording = useCallback(
    async (errorCode?: VoiceErrorCode) => {
      clearTimer();
      const current = useVoiceCaptureStore.getState();
      if (current.recordingId)
        await voiceRecorderService.cancel(current.recordingId);
      if (current.audioReference)
        await voiceRecorderService.remove(current.audioReference);
      current.patch({ recordingId: null, audioReference: null, durationMs: 0 });
      if (errorCode) current.transition('failed', errorCode);
      else current.transition('ready');
    },
    [clearTimer]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = useVoiceCaptureStore.getState();
      if (
        state === 'active' &&
        current.permission !== 'granted' &&
        ['permission_required', 'failed'].includes(current.state)
      ) {
        void syncPermission();
      } else if (state !== 'active' && current.state === 'recording') {
        void cancelRecording('recording_interrupted');
      }
    });
    return () => subscription.remove();
  }, [cancelRecording, syncPermission]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      const current = useVoiceCaptureStore.getState();
      if (current.recordingId) {
        void voiceRecorderService.cancel(current.recordingId);
        current.patch({ recordingId: null, durationMs: 0 });
        current.transition('ready');
      }
      if (current.audioReference)
        void voiceRecorderService.remove(current.audioReference);
    };
  }, [clearTimer]);

  const editTranscript = (text: string) => {
    if (!session.transcript) return;
    session.setTranscript({ ...session.transcript, text, editedByUser: true });
  };

  const analyze = async () => {
    if (!session.transcript) return;
    await analyzeTranscript(session.transcript);
  };

  const updateProposal = (
    id: string,
    value: Partial<VoiceTransactionProposal>
  ) => session.updateProposal(id, value);

  const confirmField = (proposalId: string, field: string) => {
    const proposal = session.group?.proposals.find(
      (item) => item.id === proposalId
    );
    if (!proposal) return;
    updateProposal(proposalId, {
      assessments: proposal.assessments.map((item) =>
        item.field === field ? { ...item, confirmed: true } : item
      )
    });
  };

  const save = async (includeAll = false) => {
    if (!session.group) return;
    const group = includeAll
      ? {
          ...session.group,
          proposals: session.group.proposals.map((item) =>
            item.status === 'removed' ? item : { ...item, selected: true }
          )
        }
      : session.group;
    const selected = selectedProposals(group);
    if (!selected.length) {
      await emitVoiceNotification(
        group,
        'review-required',
        emittedNotifications.current,
        pendingNotifications.current
      );
      session.patch({
        group,
        state: 'proposal_review',
        errorCode: 'invalid_proposal'
      });
      return;
    }
    if (selected.some(hasDuplicateSignal)) {
      await emitVoiceNotification(
        group,
        'duplicate',
        emittedNotifications.current,
        pendingNotifications.current
      );
      session.patch({ group, state: 'proposal_review', errorCode: null });
      return;
    }
    if (selected.some((item) => proposalErrors(item).length)) {
      await emitVoiceNotification(
        group,
        'review-required',
        emittedNotifications.current,
        pendingNotifications.current
      );
      session.patch({
        group,
        state: 'proposal_review',
        errorCode: 'invalid_proposal'
      });
      return;
    }
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    session.patch({
      state: 'saving',
      group: { ...group, status: 'saving', saveErrorCode: null }
    });
    try {
      await persistProposals(group, selected, group.id);
      session.patch({
        transcript: null,
        group: null,
        state: 'saved',
        errorCode: null
      });
    } catch {
      await emitVoiceNotification(
        group,
        'failed',
        emittedNotifications.current,
        pendingNotifications.current
      );
      session.patch({
        state: 'failed',
        errorCode: 'save_failed',
        group: { ...group, status: 'failed', saveErrorCode: 'save_failed' }
      });
    } finally {
      saveInFlight.current = false;
    }
  };

  const reRecord = async () => {
    await cancelRecording();
    session.patch({
      transcript: null,
      group: null,
      state: 'ready',
      errorCode: null
    });
  };

  const cancel = async () => {
    clearTimer();
    const current = useVoiceCaptureStore.getState();
    if (current.recordingId)
      await voiceRecorderService.cancel(current.recordingId);
    if (current.audioReference)
      await voiceRecorderService.remove(current.audioReference);
    current.reset();
  };

  return {
    session,
    requestPermission,
    openSettings: voiceRecorderService.openSettings,
    start,
    stop,
    cancelRecording,
    editTranscript,
    analyze,
    updateProposal,
    confirmField,
    removeProposal: session.removeProposal,
    selectAll: session.selectAll,
    setScenario: session.setScenario,
    save,
    reRecord,
    cancel
  };
}

type VoiceNotificationOutcome =
  'saved' | 'review-required' | 'duplicate' | 'obligation-link' | 'failed';

async function emitVoiceNotification(
  group: VoiceProposalGroup,
  outcome: VoiceNotificationOutcome,
  emitted: Set<string>,
  pending: Map<string, Promise<void>>,
  transactionId?: string
) {
  const eventKey = `voice:${group.id}:${outcome}`;
  if (emitted.has(eventKey)) return;
  const replay = pending.get(eventKey);
  if (replay) return replay;
  const result = notificationService
    .createFromSource(voiceNotification(group, outcome, transactionId))
    .catch(() =>
      notificationService.createFromSource(
        voiceNotification(group, outcome, transactionId)
      )
    )
    .then(() => {
      emitted.add(eventKey);
    })
    .catch(() => undefined)
    .finally(() => {
      pending.delete(eventKey);
    });
  pending.set(eventKey, result);
  return result;
}

function voiceNotification(
  group: VoiceProposalGroup,
  outcome: VoiceNotificationOutcome,
  transactionId?: string
): NotificationSourceEvent {
  const obligationId =
    group.proposals.find(hasConfirmedObligationLink)?.obligationId ??
    group.proposals.find(hasConfirmedObligationLink)?.recurringSuggestion
      ?.candidateObligationIds[0] ??
    null;
  const target =
    outcome === 'obligation-link' && obligationId
      ? { kind: 'obligation' as const, obligationId }
      : transactionId
        ? { kind: 'transaction' as const, transactionId }
        : null;
  return {
    eventKey: `voice:${group.id}:${outcome}`,
    category: outcome === 'obligation-link' ? 'obligation' : 'transaction',
    eventType: `voice.${outcome}`,
    titleKey: `notifications.voice.${outcome}.title`,
    bodyKey: `notifications.voice.${outcome}.body`,
    messageValues: { outcome, count: group.proposals.length },
    sensitivity: 'protected',
    target,
    availableActions: target
      ? [{ kind: 'view', expiresAt: null, sourceVersion: 1 }]
      : [],
    occurredAt: Date.now()
  };
}

function hasDuplicateSignal(proposal: VoiceTransactionProposal) {
  return Boolean(proposal.duplicateOfTransactionId);
}

function hasConfirmedObligationLink(proposal: VoiceTransactionProposal) {
  return (
    proposal.recurringSuggestion?.kind === 'existing_obligation' &&
    proposal.recurringSuggestion.confirmed &&
    Boolean(
      proposal.obligationId ??
      proposal.recurringSuggestion.candidateObligationIds[0]
    )
  );
}
