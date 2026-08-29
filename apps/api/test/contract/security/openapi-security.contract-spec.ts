import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { load } from 'js-yaml';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('Phase 03 OpenAPI composition', () => {
  it('composes all approved security operations without conflicts', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = module.createNestApplication();
    await app.init();
    const fragment = load(readFileSync(resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'), 'utf8')) as Record<string, unknown>;
    const document = generateOpenApi(app, [fragment]);
    const approvedIds = new Set(Object.values(fragment.paths as Record<string, Record<string, { operationId?: string }>>)
      .flatMap((path) => Object.values(path).flatMap(({ operationId }) => operationId ? [operationId] : [])));
    let phase3Count = 0;
    for (const path of Object.values(document.paths)) {
      for (const method of ['get','post','patch','delete'] as const) {
        const operationId = path[method]?.operationId;
        if (operationId && approvedIds.has(operationId)) phase3Count += 1;
      }
    }
    expect(phase3Count).toBe(45);
    await app.close();
  });
});
