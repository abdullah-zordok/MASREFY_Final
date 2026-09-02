import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('Phase 06 sync OpenAPI contract', () => {
  const contract = load(
    readFileSync('specs/006-offline-sync-idempotency/contracts/openapi.yaml', 'utf8'),
  ) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
    components: { schemas: Record<string, unknown> };
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('defines six versioned paths with seven unique operations and resolvable references', () => {
    expect(Object.keys(contract.paths).sort()).toEqual([
      '/api/v1/conflicts',
      '/api/v1/conflicts/{conflictId}',
      '/api/v1/sync/ack',
      '/api/v1/sync/bootstrap',
      '/api/v1/sync/delta',
      '/api/v1/sync/mutations',
    ]);
    const operationIds = Object.values(contract.paths).flatMap((path) =>
      Object.values(path).flatMap((operation) => operation.operationId ?? []),
    );
    expect(operationIds).toHaveLength(7);
    expect(new Set(operationIds).size).toBe(operationIds.length);
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

  it('composes every approved sync operation without conflict', () => {
    const generated = generateOpenApi(app, [contract]);
    expect(generated.paths['/api/v1/sync/bootstrap']?.get?.operationId).toBe('bootstrapSync');
    expect(generated.paths['/api/v1/sync/delta']?.get?.operationId).toBe('getSyncDelta');
    expect(generated.paths['/api/v1/sync/mutations']?.post?.operationId).toBe(
      'submitSyncMutations',
    );
    expect(generated.paths['/api/v1/sync/ack']?.post?.operationId).toBe('acknowledgeSync');
    expect(generated.paths['/api/v1/conflicts']?.get?.operationId).toBe('listSyncConflicts');
    expect(generated.paths['/api/v1/conflicts/{conflictId}']?.get?.operationId).toBe(
      'getSyncConflict',
    );
    expect(generated.paths['/api/v1/conflicts/{conflictId}']?.patch?.operationId).toBe(
      'resolveSyncConflict',
    );
  });
});
