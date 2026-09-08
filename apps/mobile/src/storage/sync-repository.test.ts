import { SyncRepository } from './sync-repository';

describe('mobile sync repository', () => {
  it('keeps operation IDs stable and persists cursors/mappings without deleting pending work', async () => {
    const runAsync = jest.fn(async () => undefined);
    const getAllAsync = jest.fn(async () => [
      {
        operation_id: 'operation-one',
        domain: 'accounts',
        resource_type: 'account',
        schema_version: 1,
        depends_on: '[]',
        operation: 'create',
        resource_id: 'local-one',
        base_version: null,
        payload: '{"name":"Cash"}',
        status: 'pending',
        attempt_count: 0,
        next_attempt_at: null,
        last_error_code: null
      }
    ]);
    const transaction = {
      runAsync,
      getAllAsync,
      getFirstAsync: jest.fn(async () => ({ cursor: 'cursor-one' }))
    };
    const database = {
      ...transaction,
      withExclusiveTransactionAsync: jest.fn(
        async (action: (value: unknown) => Promise<void>) => action(transaction)
      )
    };
    const repository = new SyncRepository(database as never);
    await repository.enqueue({
      operationId: 'operation-one',
      domain: 'accounts',
      resourceType: 'account',
      schemaVersion: 1,
      dependsOn: [],
      operation: 'create',
      resourceId: 'local-one',
      baseVersion: null,
      payload: { name: 'Cash' }
    });
    expect((await repository.ready())[0]?.operationId).toBe('operation-one');
    await repository.mapId('accounts', 'local-one', 'server-one');
    await repository.saveCursor(
      transaction as never,
      'accounts',
      'cursor-one',
      'operation-one'
    );
    expect(await repository.cursor('accounts')).toBe('cursor-one');
    expect(runAsync.mock.calls.flat().join(' ')).not.toMatch(
      /DELETE FROM sync_mutation_queue/i
    );
  });

  it('does not upload a dependent mutation until every dependency is durably applied', async () => {
    const rows = [
      {
        operation_id: 'parent-operation',
        domain: 'transactions',
        resource_type: 'transaction',
        schema_version: 1,
        depends_on: '[]',
        operation: 'create',
        resource_id: 'parent',
        base_version: null,
        payload: '{}',
        status: 'pending',
        attempt_count: 0,
        next_attempt_at: null,
        last_error_code: null
      },
      {
        operation_id: 'child-operation',
        domain: 'transactions',
        resource_type: 'transaction',
        schema_version: 1,
        depends_on: '["parent-operation"]',
        operation: 'create',
        resource_id: 'child',
        base_version: null,
        payload: '{}',
        status: 'pending',
        attempt_count: 0,
        next_attempt_at: null,
        last_error_code: null
      }
    ];
    const database = {
      getAllAsync: jest.fn(async (sql: string) =>
        sql.includes('json_each') ? rows.slice(0, 1) : rows
      ),
      runAsync: jest.fn(async () => undefined),
      getFirstAsync: jest.fn(async () => null),
      withExclusiveTransactionAsync: jest.fn()
    };
    const repository = new SyncRepository(database as never);

    await expect(repository.ready()).resolves.toEqual([
      expect.objectContaining({ operationId: 'parent-operation' })
    ]);
    expect(String(database.getAllAsync.mock.calls[0]?.[0])).toMatch(
      /depends_on|json_each/i
    );
  });
});
