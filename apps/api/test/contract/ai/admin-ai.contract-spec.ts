import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiAdminController } from '../../../src/ai/ai.admin.controller';
import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('Phase 09 Admin AI contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('registers governed routes with recent MFA on provider-changing operations', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/admin/ai/routes/{routeId}']?.patch?.operationId).toBe(
      'updateAiRoute',
    );
    expect(
      runtime.paths['/api/v1/admin/ai/prompts/{promptVersionId}/publish']?.post?.operationId,
    ).toBe('publishAiPromptVersion');
    const target = Reflect.get(AiAdminController.prototype, 'updateRoute') as object;
    const metadata = Reflect.getMetadataKeys(target).map((key): unknown =>
      Reflect.getMetadata(key, target),
    );
    expect(metadata).toContainEqual(
      expect.objectContaining({ permission: 'ai.routes.manage', recentMfa: true }),
    );
  });
});
