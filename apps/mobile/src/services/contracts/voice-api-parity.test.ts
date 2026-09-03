import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveVoiceApiService } from '../live/voice-api-service';

it('maps the live analyzer to the documented Phase 09 voice API', () => {
  const contract = readFileSync(resolve(__dirname, '../../../../api/specs/009-voice-openrouter-financial-assistant/contracts/openapi.yaml'), 'utf8');
  for (const operation of ['createVoiceSession', 'processVoiceSession', 'getVoiceProposal', 'confirmVoiceProposal', 'rejectVoiceProposal']) expect(contract).toContain(`operationId: ${operation}`);
  const service = createLiveVoiceApiService({ baseUrl: 'https://api.test', token: () => Promise.resolve('session-token') });
  expect(service.metadata).toMatchObject({ kind: 'live', availability: 'available' });
  expect(typeof service.transcribe).toBe('function');
  expect(typeof service.analyze).toBe('function');
});
