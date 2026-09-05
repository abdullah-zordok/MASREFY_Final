import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('reference route registration', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());

  it('registers every canonical Phase 04 operation without a fragment', () => {
    const document = generateOpenApi(app);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/reference/currencies',
        '/api/v1/reference/countries',
        '/api/v1/categories',
        '/api/v1/categories/{categoryId}/usage',
        '/api/v1/accounts',
        '/api/v1/exchange-rates',
        '/api/v1/admin/reference/currencies',
        '/api/v1/admin/reference/countries',
        '/api/v1/admin/reference/categories',
        '/api/v1/admin/reference/exchange-rates',
      ]),
    );
    const operations = Object.values(document.paths).flatMap((path) =>
      Object.values(path).map((operation) => (operation as { operationId?: string }).operationId),
    );
    expect(operations).toEqual(
      expect.arrayContaining([
        'listCurrencies',
        'createCategory',
        'mergeCategory',
        'getCategoryUsage',
        'createAccount',
        'closeAccount',
        'getExchangeRate',
        'updateAdminCurrency',
        'createAdminExchangeRate',
      ]),
    );
  });
});
