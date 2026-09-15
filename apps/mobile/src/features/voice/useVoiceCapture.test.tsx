import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

import {
  createMockVoiceAnalyzerService,
  voiceAnalyzerService
} from '@/services/mocks/voice-analyzer-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import {
  fixtureProposalGroup,
  fixtureTranscript
} from '@/services/mocks/voice-fixtures';
import { useVoiceCaptureStore } from '@/state/voice-capture';
import { usePreferenceStore } from '@/state/preferences';
import { useAppShellStore } from '@/state/app-shell';
import { voiceRecorderService } from '@/services/platform/voice-recorder-service';
import type { NotificationSourceEvent } from '@/services/contracts/assistant-notifications-service';
import { VoiceCaptureError } from '@/services/contracts/voice-capture-service';
import {
  assessment,
  type VoiceProposalGroup,
  type VoiceScenario
} from '@/domain/voice-capture';
import { useVoiceCapture } from './useVoiceCapture';

const mockCreateFromSource = jest.fn();

jest.mock('@/services/engagement-service', () => ({
  notificationService: {
    createFromSource: (event: unknown) => mockCreateFromSource(event)
  }
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockCreateFromSource.mockReset();
  useVoiceCaptureStore.getState().reset();
  useAppShellStore.getState().reset();
  usePreferenceStore.setState({ locale: 'ar', direction: 'rtl' });
});

it('moves deterministic capture output into transcript then review without saving', async () => {
  const service = createMockVoiceAnalyzerService();
  const store = useVoiceCaptureStore.getState();
  store.reset();
  const transcript = await service.transcribe('private://audio', 'clear_en');
  store.setTranscript(transcript);
  store.transition('transcript_review');
  const group = await service.analyze({
    transcript, scenario: 'clear_en', sessionId: store.id,
    recordedAt: Date.now(), timezoneOffsetMinutes: 0
  });
  store.setGroup(group);
  store.transition('proposal_review');
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'proposal_review', transcript: expect.objectContaining({ text: expect.any(String) })
  });
});

it('emits central voice outcome notifications once without raw transcript content', async () => {
  const notifications: NotificationSourceEvent[] = [];
  mockCreateFromSource.mockImplementation(async (event: NotificationSourceEvent) => {
    notifications.push(event);
    return { id: `notification-${event.eventKey}`, ...event };
  });
  const finance = jest
    .spyOn(coreFinanceService, 'createTransactionsAtomically')
    .mockResolvedValue({ value: [], affectedScopes: ['transactions.list'] } as never);
  const { result, unmount } = renderVoiceHook();

  let confirmedText = '';
  act(() => {
    confirmedText = seedVoiceSession('clear_en');
  });
  await act(async () => result.current.save());
  await act(async () => result.current.save());

  act(() => {
    seedVoiceSession('low_confidence');
  });
  await act(async () => result.current.save());

  act(() => {
    seedVoiceSession('clear_en', duplicateGroup);
  });
  await act(async () => result.current.save());

  act(() => {
    seedVoiceSession('obligation');
  });
  await act(async () => result.current.save());

  act(() => {
    seedVoiceSession('obligation', confirmedObligationGroup);
  });
  await act(async () => result.current.save());

  act(() => {
    seedVoiceSession('clear_en');
  });
  finance.mockRejectedValueOnce(new Error('offline'));
  await act(async () => result.current.save());

  expect(notifications.map((event) => event.eventKey)).toEqual([
    'voice:group-voice-test-clear_en:saved',
    'voice:group-voice-test-low_confidence:review-required',
    'voice:group-voice-test-clear_en:duplicate',
    'voice:group-voice-test-obligation:saved',
    'voice:group-voice-test-obligation:obligation-link',
    'voice:group-voice-test-clear_en:failed'
  ]);
  expect(JSON.stringify(notifications)).not.toContain(confirmedText);
  expect(
    notifications.filter(
      (event) => event.eventKey === 'voice:group-voice-test-clear_en:saved'
    )
  ).toHaveLength(1);
  unmount();
});

it('keeps owner save truth when notification emission fails and retries review notifications', async () => {
  const notifications: NotificationSourceEvent[] = [];
  mockCreateFromSource
    .mockRejectedValueOnce(new Error('notification offline'))
    .mockImplementation(async (event: NotificationSourceEvent) => {
      notifications.push(event);
      return { id: `notification-${event.eventKey}`, ...event };
    });
  const finance = jest
    .spyOn(coreFinanceService, 'createTransactionsAtomically')
    .mockResolvedValue({ value: [], affectedScopes: [] } as never);
  const { result, unmount } = renderVoiceHook();

  act(() => {
    seedVoiceSession('clear_en');
  });
  await act(async () => result.current.save());
  expect(useVoiceCaptureStore.getState().state).toBe('saved');
  expect(finance).toHaveBeenCalledTimes(1);
  expect(notifications.map((event) => event.eventKey)).toEqual([
    'voice:group-voice-test-clear_en:saved'
  ]);

  notifications.length = 0;
  mockCreateFromSource.mockRejectedValueOnce(new Error('notification offline'));

  act(() => {
    seedVoiceSession('low_confidence');
  });
  await act(async () => result.current.save());
  await act(async () => result.current.save());

  expect(notifications.map((event) => event.eventKey)).toEqual([
    'voice:group-voice-test-low_confidence:review-required'
  ]);
  unmount();
});

it('prevents duplicate atomic saves while confirmation is in flight', async () => {
  let resolveSave!: (value: unknown) => void;
  const finance = jest
    .spyOn(coreFinanceService, 'createTransactionsAtomically')
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }) as never
    );
  mockCreateFromSource.mockResolvedValue({ id: 'notification' });
  const { result, unmount } = renderVoiceHook();

  act(() => {
    seedVoiceSession('clear_en');
  });
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.save();
    second = result.current.save();
  });

  expect(finance).toHaveBeenCalledTimes(1);
  resolveSave({ value: [], affectedScopes: [] });
  await act(async () => Promise.all([first, second]));
  unmount();
});

it('starts the recorder only once when the voice action is tapped rapidly', async () => {
  let resolveStart!: (value: { id: string; startedAt: number }) => void;
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  const start = jest.spyOn(voiceRecorderService, 'start').mockImplementation(
    () => new Promise((resolve) => {
      resolveStart = resolve;
    })
  );
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));

  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.start();
    second = result.current.start();
  });

  expect(start).toHaveBeenCalledTimes(1);
  resolveStart({ id: 'recording-rapid-start', startedAt: Date.now() });
  await act(async () => Promise.all([first, second]));
  unmount();
});

it('keeps denied permission safe without starting or automatically looping requests', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('denied');
  const request = jest.spyOn(voiceRecorderService, 'requestPermission').mockResolvedValue('denied');
  const start = jest.spyOn(voiceRecorderService, 'start');
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('permission_required'));

  await act(async () => result.current.requestPermission());

  expect(request).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'failed', errorCode: 'permission_denied'
  });
  unmount();
});

it('stops the recorder only once when the stop control is tapped rapidly', async () => {
  let resolveStop!: (value: string) => void;
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  const stop = jest.spyOn(voiceRecorderService, 'stop').mockImplementation(
    () => new Promise((resolve) => {
      resolveStop = resolve;
    })
  );
  jest.spyOn(voiceRecorderService, 'remove').mockResolvedValue();
  jest.spyOn(voiceAnalyzerService, 'transcribe').mockRejectedValue(
    new Error('analysis unavailable')
  );
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-rapid-stop',
      startedAt: Date.now(),
      timezoneOffsetMinutes: 0,
      state: 'recording'
    });
  });
  await waitFor(() => expect(result.current.session.state).toBe('recording'));

  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.stop();
    second = result.current.stop();
  });

  expect(stop).toHaveBeenCalledTimes(1);
  resolveStop('private://voice-rapid-stop');
  await act(async () => Promise.all([first, second]));
  unmount();
});

it('retains a failed cleanup reference for retry without stranding stop state', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  jest
    .spyOn(voiceRecorderService, 'stop')
    .mockResolvedValue('private://voice-cleanup-retry');
  const remove = jest
    .spyOn(voiceRecorderService, 'remove')
    .mockRejectedValueOnce(new Error('delete failed'))
    .mockResolvedValue();
  jest
    .spyOn(voiceAnalyzerService, 'transcribe')
    .mockRejectedValue(new Error('analysis unavailable'));
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-cleanup-retry',
      state: 'recording'
    });
  });

  await act(async () => {
    await result.current.stop();
  });
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    audioReference: 'private://voice-cleanup-retry',
    recordingId: null
  });

  await act(async () => result.current.cancel());
  expect(remove).toHaveBeenCalledTimes(2);
  expect(useVoiceCaptureStore.getState().audioReference).toBeNull();
  unmount();
});

it('dismisses a failed capture even when temporary audio cleanup fails', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  jest
    .spyOn(voiceRecorderService, 'remove')
    .mockRejectedValue(new Error('delete failed'));
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => {
    useVoiceCaptureStore.getState().patch({
      audioReference: 'private://voice-delete-failed',
      errorCode: 'no_speech',
      state: 'failed'
    });
  });

  await act(async () => result.current.cancel());

  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'idle',
    audioReference: null,
    transcript: null,
    group: null,
    errorCode: null
  });
  unmount();
});

it('clears a failed capture and immediately starts a fresh recording', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  const cancel = jest.spyOn(voiceRecorderService, 'cancel').mockResolvedValue();
  const remove = jest.spyOn(voiceRecorderService, 'remove').mockResolvedValue();
  const start = jest.spyOn(voiceRecorderService, 'start').mockResolvedValue({
    id: 'recording-fresh',
    startedAt: Date.now()
  });
  const stop = jest.spyOn(voiceRecorderService, 'stop').mockResolvedValue(
    'private://voice-fresh'
  );
  let resolveTranscript!: (value: ReturnType<typeof fixtureTranscript>) => void;
  const transcribe = jest.spyOn(voiceAnalyzerService, 'transcribe').mockImplementation(
    () => new Promise((resolve) => { resolveTranscript = resolve; })
  );
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-previous',
      audioReference: 'private://voice-previous',
      durationMs: 3_000,
      transcript: fixtureTranscript('no_speech'),
      errorCode: 'no_speech',
      state: 'failed'
    });
  });

  await act(async () => result.current.reRecord());

  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'recording',
    recordingId: 'recording-fresh',
    audioReference: null,
    durationMs: 0,
    transcript: null,
    group: null,
    errorCode: null
  });
  expect(cancel).toHaveBeenCalledWith('recording-previous');
  expect(remove).toHaveBeenCalledWith('private://voice-previous');
  expect(start).toHaveBeenCalledTimes(1);

  let processing!: Promise<void>;
  act(() => { processing = result.current.stop(); });
  await waitFor(() => expect(result.current.session.state).toBe('transcribing'));
  expect(stop).toHaveBeenCalledWith('recording-fresh');
  expect(transcribe).toHaveBeenCalledWith(
    'private://voice-fresh', 'empty', expect.any(Number), 'ar'
  );
  expect(transcribe).not.toHaveBeenCalledWith(
    'private://voice-previous', expect.anything(), expect.anything(), expect.anything()
  );
  resolveTranscript(fixtureTranscript('no_speech'));
  await act(async () => processing);
  unmount();
});

it('does not start re-recording when microphone permission is denied', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission')
    .mockResolvedValueOnce('granted')
    .mockResolvedValueOnce('denied');
  jest.spyOn(voiceRecorderService, 'requestPermission').mockResolvedValue('denied');
  const start = jest.spyOn(voiceRecorderService, 'start').mockResolvedValue({
    id: 'must-not-start', startedAt: Date.now()
  });
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => useVoiceCaptureStore.getState().patch({
    permission: 'granted', state: 'failed', errorCode: 'no_speech'
  }));

  await act(async () => result.current.reRecord());

  expect(start).not.toHaveBeenCalled();
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    permission: 'denied', state: 'failed', errorCode: 'permission_denied'
  });
  unmount();
});

it('starts only one recorder when Re-record is tapped twice during cleanup', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  let releaseCleanup!: () => void;
  const remove = jest.spyOn(voiceRecorderService, 'remove').mockImplementation(
    () => new Promise((resolve) => { releaseCleanup = resolve; })
  );
  const start = jest.spyOn(voiceRecorderService, 'start').mockResolvedValue({
    id: 'recording-single', startedAt: Date.now()
  });
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => useVoiceCaptureStore.getState().patch({
    permission: 'granted', audioReference: 'private://voice-previous',
    state: 'failed', errorCode: 'no_speech'
  }));

  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => {
    first = result.current.reRecord();
    second = result.current.reRecord();
  });
  expect(start).not.toHaveBeenCalled();
  releaseCleanup();
  await act(async () => Promise.all([first, second]));

  expect(start).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'recording', recordingId: 'recording-single'
  });
  unmount();
});

it('cancels an active recording when its inline capture owner unmounts', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  const cancel = jest.spyOn(voiceRecorderService, 'cancel').mockResolvedValue();
  const { unmount } = renderVoiceHook();
  await waitFor(() =>
    expect(useVoiceCaptureStore.getState().state).toBe('ready')
  );
  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-unmount',
      state: 'recording'
    });
  });

  unmount();

  expect(cancel).toHaveBeenCalledWith('recording-unmount');
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    recordingId: null,
    state: 'ready'
  });
});

it('releases a recording that finishes starting after the capture owner unmounts', async () => {
  let resolveStart!: (value: { id: string; startedAt: number }) => void;
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  jest.spyOn(voiceRecorderService, 'start').mockImplementation(
    () => new Promise((resolve) => {
      resolveStart = resolve;
    })
  );
  const cancel = jest.spyOn(voiceRecorderService, 'cancel').mockResolvedValue();
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));

  let start!: Promise<void>;
  act(() => {
    start = result.current.start();
  });
  unmount();
  resolveStart({ id: 'recording-late-start', startedAt: Date.now() });
  await start;

  expect(cancel).toHaveBeenCalledWith('recording-late-start');
  expect(useVoiceCaptureStore.getState().state).not.toBe('recording');
});

it('cancels recording and reports interruption when the app backgrounds', async () => {
  let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onAppStateChange = listener;
    return { remove: jest.fn() } as never;
  });
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  const cancel = jest.spyOn(voiceRecorderService, 'cancel').mockResolvedValue();
  const { unmount } = renderVoiceHook();
  await waitFor(() =>
    expect(useVoiceCaptureStore.getState().state).toBe('ready')
  );
  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-background',
      state: 'recording'
    });
    onAppStateChange?.('background');
  });

  await waitFor(() =>
    expect(useVoiceCaptureStore.getState()).toMatchObject({
      recordingId: null,
      state: 'failed',
      errorCode: 'recording_interrupted'
    })
  );
  expect(cancel).toHaveBeenCalledWith('recording-background');
  unmount();
});

it('keeps recording through a transient inactive state after permission closes', async () => {
  let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onAppStateChange = listener;
    return { remove: jest.fn() } as never;
  });
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  const cancel = jest.spyOn(voiceRecorderService, 'cancel').mockResolvedValue();
  const { unmount } = renderVoiceHook();
  await waitFor(() =>
    expect(useVoiceCaptureStore.getState().state).toBe('ready')
  );
  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-permission-transition',
      state: 'recording'
    });
    onAppStateChange?.('inactive');
  });

  expect(cancel).not.toHaveBeenCalled();
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    recordingId: 'recording-permission-transition',
    state: 'recording'
  });
  unmount();
});

it.each([
  ['clear_en', 'expense', 8_000],
  ['income', 'income', 700_000]
] as const)('keeps one %s transaction in review until the user confirms it', async (scenario, type, amountMinor) => {
  mockCreateFromSource.mockResolvedValue({ id: 'notification' });
  const recordedAt = Date.UTC(2026, 7, 18, 12);
  const transcript = fixtureTranscript(scenario, recordedAt);
  const group = fixtureProposalGroup({
    scenario,
    sessionId: useVoiceCaptureStore.getState().id,
    recordedAt,
    timezoneOffsetMinutes: 0
  });
  jest
    .spyOn(voiceRecorderService, 'getPermission')
    .mockResolvedValue('granted');
  jest
    .spyOn(voiceRecorderService, 'stop')
    .mockResolvedValue('private://voice-audio');
  jest.spyOn(voiceRecorderService, 'remove').mockResolvedValue();
  jest.spyOn(voiceAnalyzerService, 'transcribe').mockResolvedValue(transcript);
  jest.spyOn(voiceAnalyzerService, 'analyze').mockResolvedValue(group);
  const finance = jest
    .spyOn(coreFinanceService, 'createTransactionsAtomically')
    .mockResolvedValue({
      value: [],
      affectedScopes: ['home.summary', 'transactions.list']
    } as never);
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));

  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-1',
      startedAt: recordedAt,
      timezoneOffsetMinutes: 0,
      scenario,
      state: 'recording'
    });
  });
  await act(async () => result.current.stop());

  expect(voiceAnalyzerService.transcribe).toHaveBeenCalledWith(
    'private://voice-audio', scenario, 0, 'ar'
  );

  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'proposal_review',
    group: {
      proposals: [expect.objectContaining({ amountMinor, type })]
    }
  });
  expect(finance).not.toHaveBeenCalled();
  unmount();
});

it('sends the English app locale independently of the fixture scenario', async () => {
  usePreferenceStore.setState({ locale: 'en', direction: 'ltr' });
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  jest.spyOn(voiceRecorderService, 'stop').mockResolvedValue('private://voice-en');
  jest.spyOn(voiceRecorderService, 'remove').mockResolvedValue();
  const transcribe = jest.spyOn(voiceAnalyzerService, 'transcribe').mockRejectedValue(
    new Error('stop after locale assertion')
  );
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => useVoiceCaptureStore.getState().patch({
    recordingId: 'recording-en', startedAt: Date.now(), timezoneOffsetMinutes: 0,
    state: 'recording', scenario: 'clear_ar'
  }));
  await act(async () => result.current.stop());

  expect(transcribe).toHaveBeenCalledWith('private://voice-en', 'clear_ar', 0, 'en');
  unmount();
});

it('expires the app session when Voice authentication expires', async () => {
  useAppShellStore.setState({
    session: {
      status: 'authenticated', userId: 'user-live', method: 'google',
      issuedAt: 1, expiresAt: Date.now() + 60_000, restoration: 'restored'
    }
  });
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  jest.spyOn(voiceRecorderService, 'stop').mockResolvedValue('private://voice-expired');
  jest.spyOn(voiceRecorderService, 'remove').mockResolvedValue();
  jest.spyOn(voiceAnalyzerService, 'transcribe').mockRejectedValue(
    new VoiceCaptureError('session_expired')
  );
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));
  act(() => useVoiceCaptureStore.getState().patch({
    recordingId: 'recording-expired', startedAt: Date.now(),
    timezoneOffsetMinutes: 0, state: 'recording'
  }));
  await act(async () => result.current.stop());

  await waitFor(() => expect(useAppShellStore.getState().session?.status).toBe('expired'));
  expect(useVoiceCaptureStore.getState().errorCode).toBe('session_expired');
  unmount();
});

it('keeps every transaction from one recording separate in review', async () => {
  mockCreateFromSource.mockResolvedValue({ id: 'notification' });
  const recordedAt = Date.UTC(2026, 7, 18, 12);
  const transcript = fixtureTranscript('multiple', recordedAt);
  const analyzedGroup = fixtureProposalGroup({
    scenario: 'multiple',
    sessionId: useVoiceCaptureStore.getState().id,
    recordedAt,
    timezoneOffsetMinutes: 0
  });
  const reviewProposal = {
    ...analyzedGroup.proposals[1],
    assessments: [assessment('amount', 65)]
  };
  const group = {
    ...analyzedGroup,
    proposals: [analyzedGroup.proposals[0], reviewProposal, analyzedGroup.proposals[2]]
  };
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  jest.spyOn(voiceRecorderService, 'stop').mockResolvedValue('private://voice-audio');
  jest.spyOn(voiceRecorderService, 'remove').mockResolvedValue();
  jest.spyOn(voiceAnalyzerService, 'transcribe').mockResolvedValue(transcript);
  jest.spyOn(voiceAnalyzerService, 'analyze').mockResolvedValue(group);
  const finance = jest
    .spyOn(coreFinanceService, 'createTransactionsAtomically')
    .mockResolvedValue({ value: [], affectedScopes: ['home.summary'] } as never);
  const { result, unmount } = renderVoiceHook();
  await waitFor(() => expect(result.current.session.state).toBe('ready'));

  act(() => {
    useVoiceCaptureStore.getState().patch({
      recordingId: 'recording-multiple',
      startedAt: recordedAt,
      timezoneOffsetMinutes: 0,
      state: 'recording'
    });
  });
  await act(async () => result.current.stop());

  expect(finance).not.toHaveBeenCalled();
  expect(useVoiceCaptureStore.getState()).toMatchObject({
    state: 'proposal_review',
    group: {
      proposals: [
        expect.objectContaining({ id: analyzedGroup.proposals[0].id }),
        expect.objectContaining({ id: reviewProposal.id }),
        expect.objectContaining({ id: analyzedGroup.proposals[2].id })
      ]
    }
  });
  unmount();
});

it('preserves an analyzed proposal when the review route mounts', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockResolvedValue('granted');
  act(() => {
    seedVoiceSession('clear_en');
  });

  const { unmount } = renderVoiceHook();

  await waitFor(() =>
    expect(useVoiceCaptureStore.getState().permission).toBe('granted')
  );
  expect(useVoiceCaptureStore.getState().state).toBe('proposal_review');
  expect(useVoiceCaptureStore.getState().group).not.toBeNull();
  unmount();
});

it('preserves an analyzed proposal when permission refresh fails', async () => {
  jest.spyOn(voiceRecorderService, 'getPermission').mockRejectedValue(
    new Error('permission service unavailable')
  );
  act(() => {
    seedVoiceSession('clear_en');
  });

  const { unmount } = renderVoiceHook();

  await waitFor(() =>
    expect(voiceRecorderService.getPermission).toHaveBeenCalled()
  );
  await act(async () => Promise.resolve());
  expect(useVoiceCaptureStore.getState().state).toBe('proposal_review');
  expect(useVoiceCaptureStore.getState().group).not.toBeNull();
  unmount();
});

it('refreshes a blocked microphone permission after returning from settings', async () => {
  let onAppStateChange: ((state: AppStateStatus) => void) | undefined;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, listener) => {
      onAppStateChange = listener;
      return { remove: jest.fn() } as never;
    });
  jest
    .spyOn(voiceRecorderService, 'getPermission')
    .mockResolvedValueOnce('permanently_denied')
    .mockResolvedValueOnce('granted');

  const { unmount } = renderVoiceHook();
  await waitFor(() =>
    expect(useVoiceCaptureStore.getState().permission).toBe(
      'permanently_denied'
    )
  );
  await act(async () => onAppStateChange?.('active'));

  await waitFor(() =>
    expect(useVoiceCaptureStore.getState()).toMatchObject({
      permission: 'granted',
      state: 'ready'
    })
  );
  unmount();
});

function renderVoiceHook() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return {
    ...renderHook(() => useVoiceCapture(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    }),
    client
  };
}

function seedVoiceSession(
  scenario: VoiceScenario,
  transform: (group: VoiceProposalGroup) => VoiceProposalGroup = (group) => group
) {
  const store = useVoiceCaptureStore.getState();
  const recordedAt = Date.UTC(2026, 7, 8, 12);
  const transcript = fixtureTranscript(scenario, recordedAt);
  store.reset();
  store.setTranscript(transcript);
  store.setGroup(
    transform(fixtureProposalGroup({
      scenario,
      sessionId: 'voice-test',
      recordedAt,
      timezoneOffsetMinutes: 0
    }))
  );
  store.patch({
    startedAt: recordedAt,
    timezoneOffsetMinutes: 0,
    state: 'proposal_review'
  });
  return transcript.text;
}

function duplicateGroup(group: VoiceProposalGroup): VoiceProposalGroup {
  return {
    ...group,
    proposals: group.proposals.map((proposal, index) =>
      index === 0
        ? {
            ...proposal,
            duplicateOfTransactionId: 'transaction-existing'
          }
        : proposal
    )
  };
}

function confirmedObligationGroup(group: VoiceProposalGroup): VoiceProposalGroup {
  return {
    ...group,
    proposals: group.proposals.map((proposal, index) =>
      index === 0 && proposal.recurringSuggestion
        ? {
            ...proposal,
            obligationId: proposal.recurringSuggestion.candidateObligationIds[0],
            recurringSuggestion: {
              ...proposal.recurringSuggestion,
              confirmed: true
            }
          }
        : proposal
    )
  };
}
