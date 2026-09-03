import { createLiveVoiceApiService } from './live/voice-api-service';
import { selectVoiceAnalyzerService } from './voice-analyzer-service';

it('keeps fake voice analysis out of production behavior', async () => {
  const service = selectVoiceAnalyzerService(false, createLiveVoiceApiService({ baseUrl: '' }));
  expect(service.metadata.availability).toBe('unavailable');
  await expect(service.transcribe('private://audio', 'clear_en')).rejects.toMatchObject({
    code: 'analysis_unavailable'
  });
});
