import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';
import { TrackingAdminController } from '../../../src/tracking/tracking-admin.controller';

type Contract = {
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        requestBody?: { $ref?: string };
        'x-requires-recent-mfa'?: boolean;
      }
    >
  >;
  components: {
    requestBodies: Record<
      string,
      {
        content: {
          'application/json': {
            schema: { required?: string[]; properties?: Record<string, unknown> };
          };
        };
      }
    >;
  };
};

describe('Phase 08 tracking contract', () => {
  const contract = load(
    readFileSync('specs/008-tracking-imports-deduplication/contracts/openapi.yaml', 'utf8'),
  ) as Contract;
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('keeps all bounded operations unique, authenticated, fenced, and reference-complete', () => {
    expect(Object.keys(contract.paths)).toHaveLength(56);
    const operations = Object.values(contract.paths).flatMap((path) =>
      Object.entries(path)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([, operation]) => operation.operationId),
    );
    expect(operations).toHaveLength(72);
    expect(new Set(operations).size).toBe(72);
    const serialized = JSON.stringify(contract);
    expect(serialized).toContain('Idempotency-Key');
    expect(serialized).toContain('expectedVersion');
    expect(serialized).not.toContain('storage_ref');
    expect(serialized).not.toContain('raw_ingestion_payload');
    for (const match of serialized.matchAll(/"\$ref":"#\/([^"#]+)"/g)) {
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

  it('registers owner intake/review/duplicate routes and exact Admin permission routes', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/imports']?.post?.operationId).toBe('createImport');
    expect(runtime.paths['/api/v1/reviews/{reviewId}/decision']?.post?.operationId).toBe(
      'decideTrackingReview',
    );
    expect(runtime.paths['/api/v1/duplicates/{candidateId}/decision']?.post?.operationId).toBe(
      'decideDuplicateCandidate',
    );
    expect(
      runtime.paths['/api/v1/admin/parsers/versions/{versionId}/publish']?.post?.operationId,
    ).toBe('publishParserVersion');
  });

  it.each([
    ['createVersion', '/api/v1/admin/parsers/rules/{ruleId}/versions', 'post'],
    ['createCase', '/api/v1/admin/parsers/test-cases', 'post'],
    ['updateCase', '/api/v1/admin/parsers/test-cases/{caseId}', 'patch'],
    ['runVersion', '/api/v1/admin/parsers/versions/{versionId}/corpus-runs', 'post'],
  ] as const)('requires recent MFA for %s in runtime and contract', (method, path, verb) => {
    const handler = Reflect.get(TrackingAdminController.prototype, method) as object;
    const requirements = Reflect.getMetadataKeys(handler).map(
      (key): unknown => Reflect.getMetadata(key, handler) as unknown,
    );
    expect(requirements).toContainEqual(expect.objectContaining({ recentMfa: true }));
    expect(contract.paths[path]?.[verb]?.['x-requires-recent-mfa']).toBe(true);
  });

  it('documents the distinct keyword and sender rule mutation payloads', () => {
    expect(contract.paths['/api/v1/tracking/keyword-rules']?.post?.requestBody?.$ref).toBe(
      '#/components/requestBodies/KeywordRuleMutation',
    );
    expect(contract.paths['/api/v1/tracking/sender-rules']?.post?.requestBody?.$ref).toBe(
      '#/components/requestBodies/SenderRuleMutation',
    );
    expect(
      contract.components.requestBodies.KeywordRuleMutation?.content['application/json'].schema,
    ).toMatchObject({
      required: ['value', 'group', 'language', 'enabled'],
      properties: {
        matchType: { type: 'string', enum: ['exact', 'contains', 'safe_pattern'] },
        categoryId: {
          anyOf: [{ $ref: '#/components/schemas/TrackingUuid' }, { type: 'null' }],
        },
        priority: { type: 'integer', minimum: 0, maximum: 10000 },
      },
    });
    expect(
      contract.components.requestBodies.SenderRuleMutation?.content['application/json'].schema,
    ).toMatchObject({
      required: ['value', 'displayLabel'],
      properties: {
        institutionId: {
          anyOf: [{ $ref: '#/components/schemas/TrackingUuid' }, { type: 'null' }],
        },
        trusted: { type: 'boolean' },
        enabled: { type: 'boolean' },
      },
    });
  });
});
