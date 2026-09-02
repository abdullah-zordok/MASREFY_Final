import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { PlanningController } from '../../../src/planning/planning.controller';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('salary planning HTTP contract', () => {
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

  it('registers the eight owner salary operations with approved operation IDs', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/salary-profiles']?.get?.operationId).toBe('listSalaryProfiles');
    expect(runtime.paths['/api/v1/salary-profiles']?.post?.operationId).toBe('createSalaryProfile');
    expect(runtime.paths['/api/v1/salary-profiles/{profileId}']?.get?.operationId).toBe(
      'getSalaryProfile',
    );
    expect(runtime.paths['/api/v1/salary-profiles/{profileId}']?.patch?.operationId).toBe(
      'updateSalaryProfile',
    );
    expect(runtime.paths['/api/v1/salary-profiles/{profileId}']?.delete?.operationId).toBe(
      'archiveSalaryProfile',
    );
    expect(runtime.paths['/api/v1/salary-profiles/{profileId}/receipts']?.get?.operationId).toBe(
      'listSalaryReceipts',
    );
    expect(runtime.paths['/api/v1/salary-profiles/{profileId}/receipts']?.post?.operationId).toBe(
      'linkSalaryReceipt',
    );
    expect(
      runtime.paths['/api/v1/salary-profiles/{profileId}/receipts/{receiptId}']?.delete
        ?.operationId,
    ).toBe('unlinkSalaryReceipt');
  });

  it('keeps salary money as canonical strings and patch fields allowlisted', () => {
    expect(JSON.stringify(contract.components.schemas.PositiveMinor)).toContain('string');
    const patch = contract.components.schemas.SalaryProfilePatch as {
      properties: { patch: { properties: Record<string, unknown> } };
    };
    expect(Object.keys(patch.properties.patch.properties).sort()).toEqual([
      'accountId',
      'amountMinor',
      'automaticDetectionEnabled',
      'currencyCode',
      'customIntervalDays',
      'expectedDay',
      'frequency',
      'name',
      'status',
    ]);
    expect(patch.properties.patch.properties).not.toHaveProperty('userId');
    expect(patch.properties.patch.properties).not.toHaveProperty('version');
  });

  it('rejects missing auth and idempotency before invoking the service', () => {
    const createSalaryProfile = jest.fn();
    const controller = new PlanningController({ createSalaryProfile } as never);
    expect(() => controller.createSalaryProfile({} as never, {}, 'valid-key-123456789')).toThrow(
      'Http Exception',
    );
    expect(() =>
      controller.createSalaryProfile(
        { clerkPrincipal: { userId: 'owner', sessionId: 's', factorAgeSeconds: 0 } } as never,
        {},
        undefined,
      ),
    ).toThrow('Http Exception');
    expect(createSalaryProfile).not.toHaveBeenCalled();
  });
});
