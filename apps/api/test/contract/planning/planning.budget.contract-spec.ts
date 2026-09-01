import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('budget planning HTTP contract', () => {
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

  it('registers collection, detail, complete allocation, and independent summary operations', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/budgets']?.get?.operationId).toBe('listBudgets');
    expect(runtime.paths['/api/v1/budgets']?.post?.operationId).toBe('createBudget');
    expect(runtime.paths['/api/v1/budgets/{budgetId}']?.get?.operationId).toBe('getBudget');
    expect(runtime.paths['/api/v1/budgets/{budgetId}']?.patch?.operationId).toBe('updateBudget');
    expect(runtime.paths['/api/v1/budgets/{budgetId}']?.delete?.operationId).toBe('deleteBudget');
    expect(runtime.paths['/api/v1/budgets/{budgetId}/categories']?.put?.operationId).toBe(
      'replaceBudgetCategories',
    );
    expect(runtime.paths['/api/v1/budgets/{budgetId}/summary']?.get?.operationId).toBe(
      'getBudgetSummary',
    );
  });

  it('keeps all budget money string-encoded and owner fields out of writes', () => {
    expect(JSON.stringify(contract.components.schemas.NonnegativeMinor)).toContain('string');
    const create = contract.components.schemas.BudgetCreate as {
      properties: Record<string, unknown>;
    };
    const allocations = contract.components.schemas.BudgetAllocations as {
      properties: { allocations: { items: { properties: Record<string, unknown> } } };
    };
    expect(create.properties).not.toHaveProperty('userId');
    expect(create.properties).not.toHaveProperty('id');
    expect(allocations.properties.allocations.items.properties).not.toHaveProperty('userId');
    expect(JSON.stringify(create.properties)).toContain('NonnegativeMinor');
    expect(JSON.stringify(allocations.properties)).toContain('NonnegativeMinor');
  });
});
