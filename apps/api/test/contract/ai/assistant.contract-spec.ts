import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';
import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('Phase 09 assistant contract', () => {
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

  it('keeps 47 unique documented operations and registers consent, message, and preview routes', () => {
    const operations = Object.values(contract.paths).flatMap((path) =>
      Object.entries(path)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([, value]) => value.operationId),
    );
    expect(operations).toHaveLength(47);
    expect(new Set(operations).size).toBe(47);
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/assistant/consent']?.put?.operationId).toBe(
      'grantAssistantConsent',
    );
    expect(
      runtime.paths['/api/v1/assistant/conversations/{conversationId}/messages']?.post?.operationId,
    ).toBe('createAssistantMessage');
    expect(runtime.paths['/api/v1/assistant/previews/{previewId}/confirm']?.post?.operationId).toBe(
      'confirmAssistantPreview',
    );
  });
});
