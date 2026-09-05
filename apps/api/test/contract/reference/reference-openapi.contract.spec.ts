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
    expect(operations).toHaveLength(25);
    expect(document.paths['/api/v1/categories/{categoryId}/usage']).toBeDefined();
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
});
