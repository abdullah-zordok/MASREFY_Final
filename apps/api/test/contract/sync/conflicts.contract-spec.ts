import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';

describe('sync conflict contract', () => {
  it('publishes owner list, detail, and resolution with financial keep-both absent', () => {
    const contract = load(
      readFileSync('specs/006-offline-sync-idempotency/contracts/openapi.yaml', 'utf8'),
    ) as {
      paths: Record<string, Record<string, { operationId: string }>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(contract.paths['/api/v1/conflicts']?.get?.operationId).toBe('listSyncConflicts');
    expect(contract.paths['/api/v1/conflicts/{conflictId}']?.get?.operationId).toBe(
      'getSyncConflict',
    );
    expect(contract.paths['/api/v1/conflicts/{conflictId}']?.patch?.operationId).toBe(
      'resolveSyncConflict',
    );
    expect(JSON.stringify(contract.components.schemas.ResolveConflictRequest)).not.toContain(
      'keep_both',
    );
  });
});
