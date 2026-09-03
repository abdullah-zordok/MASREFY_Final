import { AiAdminController } from '../../../src/ai/ai.admin.controller';
import { PERMISSION_KEYS } from '../../../src/security/permission-manifest';

describe('Phase 09 Admin AI authorization', () => {
  it('registers exact permissions and recent MFA for provider, model, route, prompt, and safety changes', () => {
    for (const permission of [
      'ai.providers.read',
      'ai.providers.manage',
      'ai.models.read',
      'ai.models.manage',
      'ai.routes.read',
      'ai.routes.manage',
      'ai.prompts.read',
      'ai.prompts.manage',
      'ai.prompts.publish',
      'ai.usage.read',
      'ai.failures.manage',
      'ai.reports.read',
      'ai.reports.manage',
      'ai.safety.read',
      'ai.safety.manage',
      'ai.operations.manage',
    ])
      expect(PERMISSION_KEYS).toContain(permission);
    for (const method of [
      'updateProvider',
      'updateModel',
      'updateRoute',
      'publishPrompt',
      'updateSafety',
    ] as const) {
      const target = Reflect.get(AiAdminController.prototype, method) as object;
      const values = Reflect.getMetadataKeys(target).map((key): unknown =>
        Reflect.getMetadata(key, target),
      );
      expect(values).toContainEqual(expect.objectContaining({ recentMfa: true }));
    }
  });
});
