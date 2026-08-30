import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('Phase 05 ledger OpenAPI contract', () => {
  const contract = load(
    readFileSync('specs/005-transactions-ledger-integrity/contracts/openapi.yaml', 'utf8'),
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

  it('keeps seven exact relative paths, operations, schemas, and resolvable references', () => {
    expect(Object.keys(contract.paths).sort()).toEqual([
      '/api/v1/accounts/{accountId}/summary',
      '/api/v1/transactions',
      '/api/v1/transactions/{transactionId}',
      '/api/v1/transactions/{transactionId}/refunds',
      '/api/v1/transactions/{transactionId}/restore',
      '/api/v1/transactions/{transactionId}/reverse',
      '/api/v1/transfers',
    ]);
    expect(Object.keys(contract.components.schemas)).toHaveLength(24);
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

  it('registers the create method/path and composes the approved contract without drift', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/transfers']?.post?.operationId).toBe('createTransfer');
    expect(runtime.paths['/api/v1/transactions/{transactionId}']?.patch?.operationId).toBe(
      'reviseTransaction',
    );
    expect(runtime.paths['/api/v1/transactions/{transactionId}/refunds']?.post?.operationId).toBe(
      'refundTransaction',
    );
    expect(runtime.paths['/api/v1/transactions/{transactionId}/reverse']?.post?.operationId).toBe(
      'reverseTransaction',
    );
    expect(runtime.paths['/api/v1/transactions/{transactionId}']?.delete?.operationId).toBe(
      'deleteTransaction',
    );
    expect(runtime.paths['/api/v1/transactions/{transactionId}/restore']?.post?.operationId).toBe(
      'restoreTransaction',
    );
    const generated = generateOpenApi(app, [contract]);
    expect(generated.paths['/api/v1/transactions']?.post?.operationId).toBe('createTransaction');
    expect(contract.paths['/api/v1/transactions']?.post?.operationId).toBe('createTransaction');
    expect(Object.keys(contract.paths['/api/v1/transactions']?.post ?? {})).toEqual(
      expect.arrayContaining(['operationId', 'parameters', 'requestBody', 'responses']),
    );
  });
});
