import { Platform } from 'react-native';

const mockDelete = jest.fn(async () => undefined);
const mockOpenSettings = jest.fn(async () => undefined);
const mockRecord = jest.fn(() => undefined);
const mockAudioStop = jest.fn(async () => undefined);
const mockAudioPrepare = jest.fn(async () => undefined);
const mockAudioRelease = jest.fn();
const mockGetRecordingPermissions = jest.fn(async () => ({
  granted: false,
  canAskAgain: true
}));

jest.mock('expo-file-system/legacy', () => ({ deleteAsync: mockDelete }));
jest.mock('expo-linking', () => ({ openSettings: mockOpenSettings }));
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: mockGetRecordingPermissions,
  requestRecordingPermissionsAsync: jest.fn(async () => ({
    granted: true,
    canAskAgain: true
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {
    AudioRecorder: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: mockAudioPrepare,
      record: mockRecord,
      stop: mockAudioStop,
      release: mockAudioRelease,
      uri: 'private://voice.m4a'
    }))
  }
}));

// Mocks must be installed before importing the platform adapter.
const { createVoiceRecorderService } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./voice-recorder-service') as typeof import('./voice-recorder-service');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRecordingPermissions.mockResolvedValue({
    granted: false,
    canAskAgain: true
  });
});
afterEach(() => jest.restoreAllMocks());

it('uses the Expo 55 audio recorder contract', async () => {
  mockGetRecordingPermissions.mockResolvedValue({
    granted: true,
    canAskAgain: true
  });
  const service = createVoiceRecorderService();

  expect(await service.getPermission()).toBe('granted');
  const recording = await service.start();
  expect(await service.stop(recording.id)).toBe('private://voice.m4a');
});

it('maps permission, records once, and deletes temporary audio', async () => {
  const service = createVoiceRecorderService();
  expect(await service.getPermission()).toBe('denied');
  expect(await service.requestPermission()).toBe('granted');
  mockGetRecordingPermissions.mockResolvedValue({
    granted: true,
    canAskAgain: true
  });
  const recording = await service.start();
  await expect(service.start()).rejects.toBeDefined();
  expect(await service.stop(recording.id)).toBe('private://voice.m4a');
  await service.remove('private://voice.m4a');
  expect(mockDelete).toHaveBeenCalledWith('private://voice.m4a', {
    idempotent: true
  });
});

it('cancels idempotently and exposes settings recovery', async () => {
  mockGetRecordingPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  const service = createVoiceRecorderService();
  const recording = await service.start();
  await service.cancel(recording.id);
  await service.cancel(recording.id);
  await service.openSettings();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockOpenSettings).toHaveBeenCalledTimes(1);
});

it('releases and removes temporary audio when recorder stop fails', async () => {
  mockGetRecordingPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  const stopError = new Error('stop failed');
  mockAudioStop.mockRejectedValueOnce(stopError);
  const service = createVoiceRecorderService();
  const recording = await service.start();

  await expect(service.stop(recording.id)).rejects.toBe(stopError);

  expect(mockAudioRelease).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith('private://voice.m4a', {
    idempotent: true
  });
  await expect(service.cancel(recording.id)).resolves.toBeUndefined();
});

it('skips unavailable temporary-file deletion on web', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const service = createVoiceRecorderService();

  expect(await service.getPermission()).toBe('unavailable');
  expect(await service.requestPermission()).toBe('unavailable');
  await service.remove('blob:voice.m4a');

  expect(mockDelete).not.toHaveBeenCalled();
});
