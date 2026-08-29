import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { load } from 'js-yaml';

describe('audit and incident contract', () => {
  it('exposes only redacted evidence and an explicit incident timeline', () => {
    const contract = load(readFileSync(resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/openapi.yaml'), 'utf8')) as {
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
    };
    expect(contract.components.schemas.Incident?.required).toEqual(expect.arrayContaining(['timeline', 'version']));
    expect(contract.components.schemas.AuditEvent?.required).toEqual(expect.arrayContaining(['safeMetadata', 'requestId']));
    expect(JSON.stringify({
      audit: contract.components.schemas.AuditEvent,
      event: contract.components.schemas.SecurityEvent,
    })).not.toMatch(/rawIp|userAgent|providerPayload|beforeData|afterData/);
  });
});
