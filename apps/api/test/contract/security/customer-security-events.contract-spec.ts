import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('customer security event contract', () => {
  it('is owner-route bounded and maps only safe fields', () => {
    const contract = load(readFileSync(resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'), 'utf8')) as {
      paths: Record<string, { get?: { operationId?: string } }>;
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    expect(contract.paths['/api/v1/me/security/events']?.get?.operationId).toBe('listMySecurityEvents');
    expect(Object.keys(contract.components.schemas.SecurityEvent?.properties ?? {})).toEqual([
      'id', 'eventType', 'severity', 'occurredAt', 'safeMetadata',
    ]);
  });
});
