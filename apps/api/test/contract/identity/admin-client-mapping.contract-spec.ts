import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Admin client mapping handoff', () => {
  const root = resolve(__dirname, '../../../../..');
  const mapping = readFileSync(resolve(
    root, 'apps/api/specs/002-auth-profiles-preferences-sessions/contracts/client-mapping.md',
  ), 'utf8');

  it('maps only safe evidence and explicitly defers privileged Admin work', () => {
    for (const field of ['displayName', 'maskedEmail', 'Device ID', 'app version', 'last seen']) {
      expect(mapping).toContain(field);
    }
    expect(mapping).toContain('SPEC-BE-003');
    expect(mapping).toContain('No `/api/v1/admin/**` route');
    expect(mapping).toContain('Never expose token, hash, or ciphertext');
    expect(mapping).toContain('No Masarifi session table');
  });

  it('keeps current synthetic identifiers as non-authoritative mocks', () => {
    expect(mapping).toContain('USR-*');
    expect(mapping).toContain('synthetic');
    expect(mapping).toContain('profiles.id');
    expect(mapping).toContain('Verified Clerk `sub`');
  });
});
