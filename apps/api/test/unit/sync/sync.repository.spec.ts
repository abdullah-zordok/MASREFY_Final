import { SyncRepository } from '../../../src/sync/sync.repository';

const principal = { userId: 'owner-one', sessionId: 'session-one', factorAgeSeconds: 700 } as never;
const mutation = {
  operationId: '63000000-0000-4000-8000-000000000001',
  domain: 'transactions',
  resourceType: 'transaction',
  schemaVersion: 1,
  dependsOn: [],
  operation: 'update',
  resourceId: 'local-1',
  baseVersion: 2,
  payload: { title: 'Coffee' },
} as const;

describe('SyncRepository owner boundary', () => {
  it('derives the mutation owner from the principal inside an API-role transaction', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve({
        rows: sql.includes('receive_client_mutation')
          ? [
              {
                outcome: 'received',
                mutation_id: mutation.operationId,
                status: 'received',
                result: null,
                error: null,
              },
            ]
          : [],
      }),
    );
    const repository = new SyncRepository({
      withClient: (action: (client: { query: typeof query }) => unknown) => action({ query }),
    } as never);

    const receipt = await repository.receiveMutation(
      principal,
      'device-one',
      mutation,
      'sha256:' + 'a'.repeat(64),
    );

    expect(receipt).toEqual({
      outcome: 'received',
      mutationId: mutation.operationId,
      status: 'received',
      result: null,
      error: null,
    });
    expect(query).toHaveBeenNthCalledWith(1, 'begin');
    expect(query).toHaveBeenNthCalledWith(2, "select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role: 'authenticated', sub: 'owner-one', sid: 'session-one' }),
    ]);
    expect(query).toHaveBeenNthCalledWith(3, 'set local role masarifi_api');
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('$7,$8::uuid[],$9,$10,$11,$12,$13::jsonb'),
      [
        'owner-one',
        'device-one',
        700,
        mutation.operationId,
        mutation.domain,
        mutation.resourceType,
        mutation.schemaVersion,
        mutation.dependsOn,
        mutation.operation,
        mutation.resourceId,
        mutation.baseVersion,
        'sha256:' + 'a'.repeat(64),
        JSON.stringify(mutation.payload),
      ],
    );
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it('rolls back when durable receipt creation fails', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('receive_client_mutation'))
        return Promise.reject(new Error('database down'));
      return Promise.resolve({ rows: [] });
    });
    const repository = new SyncRepository({
      withClient: (action: (client: { query: typeof query }) => unknown) => action({ query }),
    } as never);

    await expect(
      repository.receiveMutation(principal, 'device-one', mutation, 'sha256:' + 'a'.repeat(64)),
    ).rejects.toThrow('database down');
    expect(query).toHaveBeenLastCalledWith('rollback');
  });
});
