import { SyncHandlers } from '../../../src/sync/sync.handlers';

const principal = { userId: 'owner', sessionId: 'session' } as never;

describe('SyncHandlers', () => {
  it('routes supported mutations through existing finance services', async () => {
    const reference = { execute: jest.fn().mockResolvedValue({ id: 'account' }) };
    let revisedInput: unknown;
    const ledger = {
      reviseTransaction: jest.fn((input: unknown) => {
        revisedInput = input;
        return Promise.resolve({ id: 'transaction' });
      }),
    };
    const handlers = new SyncHandlers(reference as never, ledger as never);
    await handlers.dispatch(
      principal,
      {
        operationId: '63000000-0000-4000-8000-000000000001',
        domain: 'accounts',
        resourceType: 'account',
        schemaVersion: 1,
        dependsOn: [],
        operation: 'create',
        resourceId: null,
        baseVersion: null,
        payload: { name: 'Cash' },
      },
      'request',
    );
    await handlers.dispatch(
      principal,
      {
        operationId: '63000000-0000-4000-8000-000000000002',
        domain: 'transactions',
        resourceType: 'transaction',
        schemaVersion: 1,
        dependsOn: [],
        operation: 'update',
        resourceId: '63000000-0000-4000-8000-000000000003',
        baseVersion: 2,
        payload: { reason: 'correct', title: 'Coffee' },
      },
      'request',
    );
    expect(reference.execute).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'createAccount' }),
    );
    expect(ledger.reviseTransaction).toHaveBeenCalledTimes(1);
    expect(revisedInput).toMatchObject({ body: { expectedVersion: 2 } });
  });

  it('rejects unsupported or incomplete mutations without a side effect', async () => {
    const reference = { execute: jest.fn() };
    const ledger = { reviseTransaction: jest.fn() };
    const handlers = new SyncHandlers(reference as never, ledger as never);
    await expect(
      handlers.dispatch(
        principal,
        {
          operationId: '63000000-0000-4000-8000-000000000001',
          domain: 'transactions',
          resourceType: 'transaction',
          schemaVersion: 1,
          dependsOn: [],
          operation: 'update',
          resourceId: null,
          baseVersion: null,
          payload: {},
        },
        'request',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(reference.execute).not.toHaveBeenCalled();
    expect(ledger.reviseTransaction).not.toHaveBeenCalled();
  });
});
