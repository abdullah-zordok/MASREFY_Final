import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('production mock authority boundary', () => {
  it('has no production mapping for scenario, fixture, role-header, or confirmation-token authority', () => {
    const sources = ['security.controller.ts', 'admin-auth.guard.ts', 'security.repository.ts']
      .map((name) => readFileSync(resolve(__dirname, `../../../src/security/${name}`), 'utf8'))
      .join('\n');
    expect(sources).not.toMatch(/x-admin-role|x-permission|confirmationToken|fixtureId|__scenario/);
    expect(sources).toContain('assert_admin_permission');
  });
});
