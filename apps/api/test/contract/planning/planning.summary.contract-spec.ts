import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('planning summary HTTP contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('registers owner and read-only Admin summary operations', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/planning/summary']?.get?.operationId).toBe('getPlanningSummary');
    expect(runtime.paths['/api/v1/admin/planning/summary']?.get?.operationId).toBe(
      'getAdminPlanningSummary',
    );
    expect(runtime.paths['/api/v1/admin/planning/summary']?.post).toBeUndefined();
    expect(runtime.paths['/api/v1/admin/planning/summary']?.patch).toBeUndefined();
    expect(runtime.paths['/api/v1/admin/planning/summary']?.delete).toBeUndefined();
    const owner = runtime.paths['/api/v1/planning/summary']?.get;
    if (!owner) throw new Error('PLANNING_SUMMARY_OPERATION_MISSING');
    expect(owner.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'period', required: true })]),
    );
    expect(owner.responses['200']).toBeDefined();
  });
});
