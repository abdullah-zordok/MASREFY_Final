import { create } from 'zustand';

import type {
  VoiceCaptureSession,
  VoiceErrorCode,
  VoiceProposalGroup,
  VoiceScenario,
  VoiceSessionState,
  VoiceTranscript,
  VoiceTransactionProposal
} from '@/domain/voice-capture';
import { VOICE_MAX_PROPOSALS } from '@/domain/voice-capture';
import { voiceRecorderService } from '@/services/platform/voice-recorder-service';
import {
  registerRuntimeIdentityReset,
  registerRuntimeUserDataReset
} from '@/storage/runtime-user-data-reset';

const newSession = (): VoiceCaptureSession => ({
  id: `voice-${Date.now()}`,
  state: 'idle',
  permission: 'not_requested',
  language: 'ar',
  scenario: 'empty',
  startedAt: null,
  timezoneOffsetMinutes: null,
  durationMs: 0,
  recordingId: null,
  audioReference: null,
  transcript: null,
  group: null,
  errorCode: null
});

interface VoiceCaptureStore extends VoiceCaptureSession {
  reset(): void;
  patch(value: Partial<VoiceCaptureSession>): void;
  transition(state: VoiceSessionState, errorCode?: VoiceErrorCode | null): void;
  setScenario(scenario: VoiceScenario): void;
  setTranscript(transcript: VoiceTranscript | null): void;
  setGroup(group: VoiceProposalGroup | null): void;
  updateProposal(id: string, value: Partial<VoiceTransactionProposal>): void;
  removeProposal(id: string): void;
  selectAll(selected: boolean): void;
}

export const useVoiceCaptureStore = create<VoiceCaptureStore>((set) => ({
  ...newSession(),
  reset: () => set(newSession()),
  patch: (value) => set(value),
  transition: (state, errorCode = null) => set({ state, errorCode }),
  setScenario: (scenario) => set({ scenario }),
  setTranscript: (transcript) => set({ transcript }),
  setGroup: (group) =>
    set({
      group: group
        ? { ...group, proposals: group.proposals.slice(0, VOICE_MAX_PROPOSALS) }
        : null
    }),
  updateProposal: (id, value) =>
    set((state) => ({
      group: state.group
        ? {
            ...state.group,
            proposals: state.group.proposals.map((item) =>
              item.id === id ? { ...item, ...value, status: 'edited' } : item
            )
          }
        : null
    })),
  removeProposal: (id) =>
    set((state) => ({
      group: state.group
        ? {
            ...state.group,
            proposals: state.group.proposals.map((item) =>
              item.id === id ? { ...item, selected: false, status: 'removed' } : item
            )
          }
        : null
    })),
  selectAll: (selected) =>
    set((state) => ({
      group: state.group
        ? {
            ...state.group,
            proposals: state.group.proposals.map((item) =>
              item.status === 'removed' ? item : { ...item, selected }
            )
          }
        : null
    }))
}));

async function resetVoiceCapture(): Promise<void> {
  const session = useVoiceCaptureStore.getState();
  const resourceCleanup = [
    session.recordingId
      ? voiceRecorderService.cancel(session.recordingId)
      : Promise.resolve(),
    session.audioReference
      ? voiceRecorderService.remove(session.audioReference)
      : Promise.resolve()
  ];
  session.reset();
  await Promise.all(resourceCleanup);
}

registerRuntimeUserDataReset(resetVoiceCapture);
registerRuntimeIdentityReset(resetVoiceCapture);
