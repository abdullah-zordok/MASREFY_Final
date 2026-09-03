import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLiveAssistantApiService } from '../live/assistant-api-service';

it('maps every Mobile assistant method to the documented owner API without provider controls', () => {
  const contract = readFileSync(resolve(__dirname, '../../../../api/specs/009-voice-openrouter-financial-assistant/contracts/openapi.yaml'), 'utf8');
  for (const operation of ['getAssistantConsent', 'grantAssistantConsent', 'createAssistantConversation', 'createAssistantMessage', 'confirmAssistantPreview', 'rejectAssistantPreview', 'putAssistantFeedback']) expect(contract).toContain(`operationId: ${operation}`);
  const service = createLiveAssistantApiService({ baseUrl: 'https://api.test' });
  for (const method of ['getConsent', 'setConsent', 'listConversations', 'createConversation', 'ask', 'confirmAction', 'cancelAction'] as const) expect(typeof service[method]).toBe('function');
  expect(readFileSync(resolve(__dirname, '../live/assistant-api-service.ts'), 'utf8')).not.toMatch(/OPENROUTER_API_KEY|openrouter\.ai/i);
});
