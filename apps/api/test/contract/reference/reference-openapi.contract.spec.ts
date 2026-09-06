import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';

describe('reference OpenAPI contract', () => {
  const document = load(
    readFileSync('specs/004-reference-data-categories-accounts/contracts/openapi.yaml', 'utf8'),
  ) as {
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, unknown> };
  };

  it('owns only versioned paths and defines all 24 operations', () => {
    expect(Object.keys(document.paths).every((path) => path.startsWith('/api/v1/'))).toBe(true);
    const operations = Object.values(document.paths).flatMap((path) =>
      Object.values(path).filter(
        (operation): operation is { operationId: string } =>
          typeof operation === 'object' && operation !== null && 'operationId' in operation,
      ),
    );
    expect(operations).toHaveLength(26);
    expect(document.paths['/api/v1/categories/{categoryId}/usage']).toBeDefined();
    expect(document.paths['/api/v1/credit-card-payoff']).toBeDefined();
  });

  it('keeps typed pages, errors, and account responses explicit', () => {
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining([
        'AccountResponse',
        'CategoryPageResponse',
        'CategoryUsageResponse',
        'CreateAccountResponse',
        'ErrorResponse',
      ]),
    );
    const references = [...JSON.stringify(document).matchAll(/"\$ref":"#\/([^"#]+)"/g)].map(
      (match) => match[1],
    );
    for (const reference of references) {
      const target = reference
        ?.split('/')
        .reduce<unknown>(
          (current, segment) =>
            typeof current === 'object' && current !== null
              ? Reflect.get(current, segment)
              : undefined,
          document,
        );
      expect(target).toBeDefined();
    }
  });

  it('publishes the non-null backward-compatible account tracking control', () => {
    const schemas = document.components.schemas as Record<
      string,
      { required?: string[]; properties?: Record<string, Record<string, unknown>> }
    >;
    expect(schemas.Account?.required).toContain('automaticTrackingEnabled');
    expect(schemas.Account?.properties?.automaticTrackingEnabled).toMatchObject({
      type: 'boolean',
    });
    expect(schemas.CreateAccountRequest?.properties?.automaticTrackingEnabled).toMatchObject({
      type: 'boolean',
      default: true,
    });
    expect(schemas.UpdateAccountRequest?.properties?.automaticTrackingEnabled).toMatchObject({
      type: 'boolean',
    });
  });

  it('publishes nullable card terms and the integer payoff contract', () => {
    const schemas = document.components.schemas as Record<
      string,
      { required?: string[]; properties?: Record<string, Record<string, unknown>> }
    >;
    for (const field of [
      'statementDay',
      'paymentDueDay',
      'monthlyInterestRateBasisPoints',
      'minimumPaymentMinor',
    ]) {
      expect(schemas.Account?.required).toContain(field);
      expect(schemas.Account?.properties?.[field]?.type).toEqual(['integer', 'null']);
      expect(schemas.CreateAccountRequest?.properties?.[field]).toBeDefined();
      expect(schemas.UpdateAccountRequest?.properties?.[field]).toBeDefined();
    }
    expect(schemas.CreditCardPayoffRequest?.required).toEqual([
      'balanceMinor',
      'monthlyInterestRateBasisPoints',
      'paymentMinor',
    ]);
    expect(schemas.CreditCardPayoffResponse).toBeDefined();
  });
});
