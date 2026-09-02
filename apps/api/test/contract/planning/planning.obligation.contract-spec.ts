import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('obligation planning HTTP contract', () => {
  const contract = load(
    readFileSync('specs/007-financial-planning/contracts/openapi.yaml', 'utf8'),
  ) as { components: { schemas: Record<string, unknown> } };
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('registers bounded obligation collection, detail, lifecycle, and schedule operations', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/obligations']?.get?.operationId).toBe('listObligations');
    expect(runtime.paths['/api/v1/obligations']?.post?.operationId).toBe('createObligation');
    expect(runtime.paths['/api/v1/obligations/{obligationId}']?.get?.operationId).toBe(
      'getObligation',
    );
    expect(runtime.paths['/api/v1/obligations/{obligationId}']?.patch?.operationId).toBe(
      'updateObligation',
    );
    expect(runtime.paths['/api/v1/obligations/{obligationId}']?.delete?.operationId).toBe(
      'archiveObligation',
    );
    expect(runtime.paths['/api/v1/obligations/{obligationId}/schedule']?.get?.operationId).toBe(
      'listObligationSchedule',
    );
  });

  it('keeps obligation amounts string encoded and owner/version fields controlled', () => {
    const create = contract.components.schemas.ObligationCreate as {
      properties: Record<string, unknown>;
    };
    const patch = contract.components.schemas.ObligationPatch as {
      properties: { patch: { properties: Record<string, unknown> } };
    };
    expect(JSON.stringify(create.properties)).toContain('NonnegativeMinor');
    expect(JSON.stringify(create.properties)).toContain('PositiveMinor');
    expect(create.properties).not.toHaveProperty('userId');
    expect(patch.properties.patch.properties).not.toHaveProperty('version');
    expect(patch.properties.patch.properties).not.toHaveProperty('currencyCode');
  });
});
