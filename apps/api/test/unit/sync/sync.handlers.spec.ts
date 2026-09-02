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

  it('routes planning roots, dependents, and tombstones through the existing planning service', async () => {
    const reverseSavingsMovement = jest
      .fn<Promise<unknown>, [string, string, { body: Record<string, unknown> }]>()
      .mockResolvedValue({ id: 'movement' });
    const planning = {
      createSavingsGoal: jest.fn().mockResolvedValue({ id: 'goal' }),
      reverseSavingsMovement,
    };
    const handlers = new SyncHandlers({} as never, {} as never, planning as never);
    await handlers.dispatch(
      principal,
      {
        operationId: '63000000-0000-4000-8000-000000000011',
        domain: 'planning',
        resourceType: 'savings-goal',
        schemaVersion: 1,
        dependsOn: [],
        operation: 'create',
        resourceId: null,
        baseVersion: null,
        payload: { name: 'Emergency', targetMinor: '100', currencyCode: 'SAR' },
      },
      'request',
    );
    await handlers.dispatch(
      principal,
      {
        operationId: '63000000-0000-4000-8000-000000000012',
        domain: 'planning',
        resourceType: 'savings-movement',
        schemaVersion: 1,
        dependsOn: [],
        operation: 'delete',
        resourceId: '63000000-0000-4000-8000-000000000013',
        baseVersion: 2,
        payload: { goalId: '63000000-0000-4000-8000-000000000014' },
      },
      'request',
    );
    expect(planning.createSavingsGoal).toHaveBeenCalled();
    const call = reverseSavingsMovement.mock.calls[0];
    expect(call?.slice(0, 2)).toEqual([
      '63000000-0000-4000-8000-000000000014',
      '63000000-0000-4000-8000-000000000013',
    ]);
    expect(call?.[2].body).toMatchObject({ expectedVersion: 2 });
    expect(call?.[2].body).not.toHaveProperty('goalId');
  });
});
