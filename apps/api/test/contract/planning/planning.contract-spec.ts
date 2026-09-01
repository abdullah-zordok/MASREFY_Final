import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

type Contract = {
  paths: Record<string, Record<string, { operationId?: string; parameters?: unknown[] }>>;
  components: { schemas: Record<string, unknown> };
};

describe('Phase 07 planning contract', () => {
  const contract = load(
    readFileSync('specs/007-financial-planning/contracts/openapi.yaml', 'utf8'),
  ) as Contract;
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('keeps 21 exact paths, 35 unique operations, resolved schemas, auth, and mutation fences', () => {
    expect(Object.keys(contract.paths)).toHaveLength(21);
    const operations = Object.values(contract.paths).flatMap((path) =>
      Object.entries(path)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([, operation]) => operation.operationId),
    );
    expect(operations).toHaveLength(35);
    expect(new Set(operations).size).toBe(35);
    expect(JSON.stringify(contract)).toContain('Idempotency-Key');
    expect(JSON.stringify(contract)).toContain('expectedVersion');
    expect(JSON.stringify(contract)).toContain('ClerkBearer');
    for (const match of JSON.stringify(contract).matchAll(/"\$ref":"#\/([^"#]+)"/g)) {
      expect(
        match[1]
          ?.split('/')
          .reduce<unknown>(
            (value, key) =>
              value && typeof value === 'object' ? Reflect.get(value, key) : undefined,
            contract,
          ),
      ).toBeDefined();
    }
  });

  it('registers the owner summary and permission-gated Admin summary without contract drift', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/planning/summary']?.get?.operationId).toBe('getPlanningSummary');
    expect(runtime.paths['/api/v1/admin/planning/summary']?.get?.operationId).toBe(
      'getAdminPlanningSummary',
    );
    expect(runtime.paths['/api/v1/admin/planning/summary']?.post).toBeUndefined();
    expect(runtime.paths['/api/v1/admin/planning/summary']?.patch).toBeUndefined();
    expect(runtime.paths['/api/v1/admin/planning/summary']?.delete).toBeUndefined();
  });
});
