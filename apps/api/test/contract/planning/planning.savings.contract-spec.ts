import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('savings HTTP contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  it('registers goal list/detail/lifecycle and immutable movement/reversal operations', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/savings-goals']?.get?.operationId).toBe('listSavingsGoals');
    expect(runtime.paths['/api/v1/savings-goals']?.post?.operationId).toBe('createSavingsGoal');
    expect(runtime.paths['/api/v1/savings-goals/{goalId}']?.get?.operationId).toBe(
      'getSavingsGoal',
    );
    expect(runtime.paths['/api/v1/savings-goals/{goalId}']?.patch?.operationId).toBe(
      'updateSavingsGoal',
    );
    expect(runtime.paths['/api/v1/savings-goals/{goalId}']?.delete?.operationId).toBe(
      'deleteSavingsGoal',
    );
    expect(runtime.paths['/api/v1/savings-goals/{goalId}/movements']?.post?.operationId).toBe(
      'recordSavingsMovement',
    );
    expect(
      runtime.paths['/api/v1/savings-goals/{goalId}/movements/{movementId}/reverse']?.post
        ?.operationId,
    ).toBe('reverseSavingsMovement');
  });
});
