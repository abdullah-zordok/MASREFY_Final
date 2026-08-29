import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('deletion and retention contract', () => {
  it('keeps legal policy admin-controlled and owner deletion confirmation explicit', () => {
    const contract = load(readFileSync(resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'), 'utf8')) as {
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
    };
    expect(contract.components.schemas.DeletionCreate?.required).toEqual(['confirmation']);
    expect(contract.components.schemas.DeletionCreate?.properties).not.toHaveProperty('legalBasis');
    expect(contract.components.schemas.RetentionUpdate?.required).toEqual(
      expect.arrayContaining(['retentionDays', 'reason', 'expectedVersion']),
    );
    expect(contract.components.schemas.DeletionRequest?.required).toEqual(
      expect.arrayContaining(['retainedCategories', 'completedAt']),
    );
  });
});
