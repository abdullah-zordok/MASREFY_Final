import { Platform } from 'react-native';
import type { AudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';

import {
  VOICE_MAX_DURATION_MS,
  type VoicePermissionState
} from '@/domain/voice-capture';
import {
  VoiceCaptureError,
  type VoiceRecorderService,
  type VoiceRecording
} from '@/services/contracts/voice-capture-service';

function audioModule(): typeof import('expo-audio') {
  // Delayed so Home can render before the optional recorder is used.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require('expo-audio') as typeof import('expo-audio');
}

function permissionState(status: {
  granted: boolean;
  canAskAgain: boolean;
}): VoicePermissionState {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'denied' : 'permanently_denied';
}

async function removeTemporaryAudio(audioReference: string | null) {
  if (!audioReference || Platform.OS === 'web') return;
  await FileSystem.deleteAsync(audioReference, { idempotent: true });
}

export function createVoiceRecorderService(): VoiceRecorderService {
  const recordings = new Map<string, AudioRecorder>();
  let sequence = 0;
  return {
    async getPermission() {
      if (Platform.OS === 'web') return 'unavailable';
      const { getRecordingPermissionsAsync } = audioModule();
      return permissionState(await getRecordingPermissionsAsync());
    },
    async requestPermission() {
      if (Platform.OS === 'web') return 'unavailable';
      const { requestRecordingPermissionsAsync } = audioModule();
      return permissionState(await requestRecordingPermissionsAsync());
    },
    async openSettings() {
      await Linking.openSettings();
    },
    async start(
      maxDurationMs = VOICE_MAX_DURATION_MS
    ): Promise<VoiceRecording> {
      if (maxDurationMs !== VOICE_MAX_DURATION_MS || recordings.size)
        throw new VoiceCaptureError('recording_interrupted');
      const {
        AudioModule,
        RecordingPresets,
        getRecordingPermissionsAsync,
        setAudioModeAsync
      } =
        audioModule();
      const permission = permissionState(await getRecordingPermissionsAsync());
      if (permission !== 'granted')
        throw new VoiceCaptureError(
          permission === 'permanently_denied'
            ? 'permission_permanent'
            : 'permission_denied'
        );
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix'
      });
      const recording = new AudioModule.AudioRecorder(
        RecordingPresets.HIGH_QUALITY
      );
      await recording.prepareToRecordAsync();
      recording.record();
      const id = `recording-${Date.now()}-${++sequence}`;
      recordings.set(id, recording);
      return { id, startedAt: Date.now() };
    },
    async stop(recordingId) {
      const recording = recordings.get(recordingId);
      if (!recording) throw new VoiceCaptureError('recording_interrupted');
      try {
        await recording.stop();
        const uri = recording.uri;
        if (!uri) throw new VoiceCaptureError('recording_interrupted');
        return uri;
      } catch (error) {
        await removeTemporaryAudio(recording.uri).catch(() => undefined);
        throw error;
      } finally {
        recordings.delete(recordingId);
        recording.release();
      }
    },
    async cancel(recordingId) {
      const recording = recordings.get(recordingId);
      if (!recording) return;
      recordings.delete(recordingId);
      try {
        await recording.stop();
      } finally {
        const uri = recording.uri;
        recording.release();
        await removeTemporaryAudio(uri);
      }
    },
    async remove(audioReference) {
      await removeTemporaryAudio(audioReference);
    }
  };
}

export const voiceRecorderService = createVoiceRecorderService();
