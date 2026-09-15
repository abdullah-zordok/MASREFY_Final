import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearPendingVoiceSession,
  loadPendingVoiceSession,
  savePendingVoiceSession
} from './voice-pending-session';

const pending = {
  sessionId: '99000000-0000-4000-8000-000000000001',
  sessionVersion: 2,
  recordedAt: 10,
  timezoneOffsetMinutes: -180,
  createdAt: 20
};

beforeEach(async () => AsyncStorage.clear());

it('keeps pending voice sessions owner-scoped and removes terminal state', async () => {
  await savePendingVoiceSession('user-a', pending);

  await expect(loadPendingVoiceSession('user-a')).resolves.toEqual(pending);
  await expect(loadPendingVoiceSession('user-b')).resolves.toBeNull();

  await clearPendingVoiceSession('user-a');
  await expect(loadPendingVoiceSession('user-a')).resolves.toBeNull();
});
