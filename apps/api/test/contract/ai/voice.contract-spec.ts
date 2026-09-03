import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';
import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('Phase 09 voice contract', () => {
  const contract = load(
    readFileSync('specs/009-voice-openrouter-financial-assistant/contracts/openapi.yaml', 'utf8'),
  ) as { paths: Record<string, Record<string, { operationId?: string }>> };
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('registers every voice operation and keeps raw/provider fields out of the public contract', () => {
    const runtime = generateOpenApi(app);
    for (const [path, verb, operation] of [
      ['/api/v1/voice/sessions', 'post', 'createVoiceSession'],
      ['/api/v1/voice/sessions/{sessionId}/process', 'post', 'processVoiceSession'],
      ['/api/v1/voice/sessions/{sessionId}/proposal', 'get', 'getVoiceProposal'],
      ['/api/v1/voice/proposals/{proposalId}/confirm', 'post', 'confirmVoiceProposal'],
      ['/api/v1/voice/proposals/{proposalId}/reject', 'post', 'rejectVoiceProposal'],
    ] as const)
      expect(runtime.paths[path]?.[verb]?.operationId).toBe(operation);
    expect(JSON.stringify(contract.paths['/api/v1/voice/sessions'])).not.toMatch(
      /storageRef|provider|model|transcript/i,
    );
  });
});
