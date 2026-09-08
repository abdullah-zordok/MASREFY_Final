import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

const document = load(
  readFileSync('specs/004-reference-data-categories-accounts/contracts/openapi.yaml', 'utf8'),
) as {
  components: { schemas: Record<string, unknown> };
  paths: Record<string, { get: { parameters: { name: string; in: string; schema: object }[] } }>;
};
const ajv = new Ajv({ strict: false });
addFormats(ajv);

it('documents the runtime-supported inactive category query as a boolean', () => {
  const parameters = document.paths['/api/v1/categories']?.get.parameters.filter(
    (parameter) => parameter.name === 'includeInactive',
  );
  expect(parameters).toHaveLength(1);
  const parameter = parameters?.[0];
  if (!parameter) throw new Error('includeInactive query parameter is missing');
  expect(parameter.in).toBe('query');
  const validate = ajv.compile(parameter.schema);
  expect(validate(true)).toBe(true);
  expect(validate(false)).toBe(true);
  expect(validate('unexpected')).toBe(false);
});

function validator(name: string): ValidateFunction {
  return ajv.compile({
    $ref: `#/components/schemas/${name}`,
    components: document.components,
  });
}

const account = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Travel card',
  type: 'credit_card',
  currency: 'SAR',
  institutionName: 'Bank',
  lastFour: '4242',
  creditLimitMinor: 100_000,
  isDefault: false,
  iconKey: 'card',
  colorKey: 'blue',
  notes: null,
  status: 'closed',
  sortOrder: 4,
  includeInTotals: false,
  automaticTrackingEnabled: false,
  statementDay: 7,
  paymentDueDay: 21,
  monthlyInterestRateBasisPoints: 125,
  minimumPaymentMinor: 5_000,
  openedAt: '2026-09-01',
  closedAt: '2026-09-08',
  version: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};
const category = {
  id: '10000000-0000-4000-8000-000000000001',
  scope: 'custom',
  kind: 'expense',
  labelAr: 'سفر',
  labelEn: 'Travel',
  icon: null,
  color: null,
  systemKey: null,
  parentId: null,
  mergedIntoId: null,
  sortOrder: 2,
  active: true,
  status: 'active',
  version: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

it('accepts actual reference, category, account, card, and usage response shapes', () => {
  const instances: [string, unknown][] = [
    ['CurrencyListResponse', [{ code: 'SAR', name: 'Saudi Riyal', minorUnit: 2, version: 1 }]],
    [
      'CountryListResponse',
      [{ code: 'SA', name: 'Saudi Arabia', defaultCurrency: 'SAR', version: 1 }],
    ],
    ['CategoryResponse', category],
    ['AccountResponse', account],
    [
      'CreateAccountResponse',
      {
        account,
        openingTransactionId: '30000000-0000-4000-8000-000000000001',
      },
    ],
    ['CategoryUsageResponse', { linkedTransactionCount: 4, version: 8 }],
    [
      'ExchangeRateResponse',
      {
        base: 'USD',
        quote: 'SAR',
        rate: 3.75,
        effectiveAt: '2026-09-08T00:00:00.000Z',
        provider: 'manual-admin',
      },
    ],
  ];

  for (const [schema, instance] of instances) {
    const validate = validator(schema);
    expect({ schema, valid: validate(instance), errors: validate.errors }).toMatchObject({
      schema,
      valid: true,
      errors: null,
    });
  }
});

it('accepts the actual merge response with its source and target identities', () => {
  const validate = validator('MergeCategoryResponse');
  const targetId = '10000000-0000-4000-8000-000000000002';
  const instance = {
    source: { ...category, active: false, status: 'merged', mergedIntoId: targetId, version: 3 },
    targetId,
  };

  expect({ valid: validate(instance), errors: validate.errors }).toEqual({
    valid: true,
    errors: null,
  });
});

it('accepts the actual version-conflict error instance', () => {
  const validate = validator('ErrorResponse');
  const instance = {
    code: 'VERSION_CONFLICT',
    message: 'Resource version conflict',
    requestId: 'request-1',
  };

  expect({ valid: validate(instance), errors: validate.errors }).toEqual({
    valid: true,
    errors: null,
  });
});

it('rejects unknown response values instead of silently widening the contract', () => {
  expect(validator('AccountResponse')({ ...account, type: 'future_account' })).toBe(false);
  expect(
    validator('CategoryUsageResponse')({ linkedTransactionCount: 4, version: 8, extra: true }),
  ).toBe(false);
});
