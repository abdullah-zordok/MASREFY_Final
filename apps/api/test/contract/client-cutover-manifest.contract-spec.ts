import { readFileSync } from 'node:fs';

const manifestPath =
  'specs/014-client-cutover-mock-migration-production-readiness/contracts/client-contract-manifest-v1.md';

function activeRows(manifest: string) {
  const active = manifest.match(/## Wave 1[\s\S]*?(?=## Reviewed Local)/)?.[0] ?? '';
  let wave = 0;
  return active.split(/\r?\n/).flatMap((line) => {
    const heading = line.match(/^## Wave (\d)/);
    if (heading) wave = Number(heading[1]);
    if (!line.startsWith('| `')) return [];
    const firstCell = line.split('|')[1] ?? '';
    const names = [...firstCell.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1])
      .filter((name): name is string => Boolean(name));
    let namespace = '';
    const operations = names.map((name) => {
      if (/^(mobile|admin)\./.test(name)) {
        namespace = name.slice(0, name.lastIndexOf('.'));
        return name;
      }
      return `${namespace}.${name}`;
    });
    return [{ line, operations, wave }];
  });
}

describe('Phase 14 client contract manifest', () => {
  const manifest = readFileSync(manifestPath, 'utf8');
  const rows = activeRows(manifest);
  const operations = rows.flatMap((row) => row.operations);

  it('declares exact unique active operation totals from the reviewed client inventories', () => {
    const declared = manifest.match(/Declared active operations: Mobile (\d+); Admin (\d+)/);
    expect(declared).not.toBeNull();

    const mobile = operations.filter((value) => value.startsWith('mobile.'));
    const admin = operations.filter((value) => value.startsWith('admin.'));
    expect(new Set(operations).size).toBe(operations.length);
    expect(mobile).toHaveLength(Number(declared?.[1]));
    expect(admin).toHaveLength(123);
    expect(admin).toHaveLength(Number(declared?.[2]));
  });

  it('gives every active row strict mapping, auth, cutover, rollback, and test policies', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.operations).not.toContainEqual(expect.stringContaining('*'));
      for (const operation of row.operations)
        expect(operation).toMatch(/^(mobile|admin)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(row.line).toMatch(/`MAP-(STRICT|FINANCE|PAGE|LOCAL|UNAVAILABLE)`/);
      expect(row.line).toMatch(/`AUTH-(OWNER|ADMIN|META|LOCAL)`/);
      expect(row.line).toContain(`CUT-W${String(row.wave)}`);
      expect(row.line).toContain(`RB-W${String(row.wave)}`);
      expect(row.line).toContain(`TEST-W${String(row.wave)}`);
    }
  });

  it('covers previously omitted boundaries and excludes billing from active waves', () => {
    expect(operations).toEqual(
      expect.arrayContaining([
        'mobile.appShellStorage.loadSession',
        'mobile.appShellStorage.saveProfilePromptDismissed',
        'mobile.trackingPermission.openSettings',
        'admin.imports.act',
        'admin.reportExports.get',
        'admin.security.actOnSecurityIncident',
      ]),
    );
    expect(operations.some((value) => /billing|subscription/i.test(value))).toBe(false);
    expect(manifest).toContain('SPEC-BE-014 owns no database entity');
    expect(manifest).toContain('owner correction required');
  });
});
