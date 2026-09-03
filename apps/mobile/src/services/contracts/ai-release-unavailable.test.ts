import { createLiveAssistantApiService } from '../live/assistant-api-service';
import { createLiveVoiceApiService } from '../live/voice-api-service';

it('fails closed when a release has no backend API configured', async () => {
  const assistant = createLiveAssistantApiService({ baseUrl: '' });
  const voice = createLiveVoiceApiService({ baseUrl: '' });
  expect(assistant.metadata.availability).toBe('unavailable');
  expect(voice.metadata.availability).toBe('unavailable');
  await expect(assistant.getConsent()).rejects.toThrow('assistant_disabled');
  await expect(voice.transcribe('file:///voice.wav', 'clear_en')).rejects.toMatchObject({ code: 'analysis_unavailable' });
});
