import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Admin client boundary mapping', () => {
  it('documents cursor/state/permission aliases without granting mock authority', () => {
    const mapping = readFileSync(
      resolve(__dirname, '../../../specs/003-admin-rbac-security/contracts/client-mapping.md'),
      'utf8',
    );
    expect(mapping).toMatch(/151 current keys/);
    expect(mapping).toMatch(/opaque cursors/);
    expect(mapping).toMatch(/confirmationToken.*discarded/);
    expect(mapping).toMatch(/Production never imports or evaluates these files/);
  });
});
