import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Mobile security boundary mapping', () => {
  it('maps owner workflows and explicitly excludes raw evidence', () => {
    const mapping = readFileSync(
      resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/client-mapping.md'),
      'utf8',
    );
    expect(mapping).toContain('GET /api/v1/me/security/events?cursor=');
    expect(mapping).toContain('POST /api/v1/me/privacy/exports');
    expect(mapping).toContain('POST /api/v1/me/deletion-requests');
    expect(mapping).toMatch(
      /Raw\s+IP, token, provider payload, unrestricted user agent, or internal Storage reference\s+has no Mobile mapping/,
    );
  });
});
