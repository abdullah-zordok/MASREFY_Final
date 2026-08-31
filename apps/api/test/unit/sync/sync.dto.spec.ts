import {
  normalizeAckRequest,
  normalizeBootstrapQuery,
  normalizeConflictListQuery,
  normalizeDeltaQuery,
  normalizeDeviceId,
  normalizeMutationBatch,
  normalizeResolutionRequest,
} from '../../../src/sync/sync.dto';

const operationId = '63000000-0000-4000-8000-000000000001';
const deviceId = '63000000-0000-4000-8000-000000000002';

describe('sync DTO normalization', () => {
  it('normalizes bounded bootstrap, delta, ack, and conflict inputs', () => {
    expect(normalizeDeviceId(` ${deviceId} `)).toBe(deviceId);
    expect(normalizeBootstrapQuery({ domains: 'transactions,accounts', limit: '250' })).toEqual({
      domains: ['accounts', 'transactions'],
      after: null,
      limit: 250,
    });
    expect(normalizeDeltaQuery({ domain: 'transactions', cursor: 'opaque', limit: '500' })).toEqual(
      {
        domain: 'transactions',
        cursor: 'opaque',
        limit: 500,
      },
    );
    expect(normalizeAckRequest({ domain: 'accounts', cursor: 'opaque' })).toEqual({
      domain: 'accounts',
      cursor: 'opaque',
      lastMutationId: null,
    });
    expect(normalizeConflictListQuery({ status: 'open' })).toEqual({
      status: 'open',
      after: null,
      limit: 50,
    });
    expect(
      normalizeResolutionRequest({ resolution: 'merged', payload: { title: 'Fixed' } }),
    ).toEqual({ resolution: 'merged', payload: { title: 'Fixed' } });
  });

  it('normalizes a mutation batch without accepting owner or server state', () => {
    expect(
      normalizeMutationBatch({
        mutations: [
          {
            operationId,
            domain: 'transactions',
            resourceType: 'transaction',
            schemaVersion: 1,
            dependsOn: [],
            operation: 'update',
            resourceId: ' local-1 ',
            baseVersion: 2,
            payload: { title: 'Coffee' },
          },
        ],
      }).mutations,
    ).toEqual([
      {
        operationId,
        domain: 'transactions',
        resourceType: 'transaction',
        schemaVersion: 1,
        dependsOn: [],
        operation: 'update',
        resourceId: 'local-1',
        baseVersion: 2,
        payload: { title: 'Coffee' },
      },
    ]);
  });

  it('orders dependencies before dependants and rejects dependency cycles', () => {
    const parent = '63000000-0000-4000-8000-000000000003';
    const child = '63000000-0000-4000-8000-000000000004';
    const mutation = (id: string, dependsOn: string[]) => ({
      operationId: id,
      domain: 'accounts',
      resourceType: 'account',
      schemaVersion: 1,
      dependsOn,
      operation: 'create',
      payload: { name: id },
    });
    expect(
      normalizeMutationBatch({
        mutations: [mutation(child, [parent]), mutation(parent, [])],
      }).executionOrder.map(({ operationId: id }) => id),
    ).toEqual([parent, child]);
    expect(() =>
      normalizeMutationBatch({ mutations: [mutation(parent, [child]), mutation(child, [parent])] }),
    ).toThrow('VALIDATION_FAILED');
  });

  it.each([
    () => normalizeDeviceId(''),
    () => normalizeDeviceId('x'.repeat(129)),
    () => normalizeBootstrapQuery({ domains: 'accounts,unknown' }),
    () => normalizeBootstrapQuery({ domains: 'accounts,transactions', after: 'opaque' }),
    () => normalizeBootstrapQuery({ domains: 'accounts', limit: 501 }),
    () => normalizeDeltaQuery({ domain: 'accounts', cursor: '', limit: 1 }),
    () => normalizeDeltaQuery({ domain: 'accounts', cursor: 'x', limit: 501 }),
    () => normalizeAckRequest({ domain: 'accounts', cursor: 'x', ownerId: 'spoof' }),
    () => normalizeMutationBatch({ mutations: [] }),
    () => normalizeMutationBatch({ mutations: Array.from({ length: 101 }, () => ({})) }),
    () =>
      normalizeMutationBatch({
        mutations: [
          {
            operationId,
            domain: 'transactions',
            resourceType: 'transaction',
            schemaVersion: 1,
            dependsOn: [],
            operation: 'update',
            baseVersion: -1,
            payload: {},
          },
        ],
      }),
    () => normalizeResolutionRequest({ resolution: 'keep_both' }),
    () => normalizeConflictListQuery({ status: 'unknown' }),
  ])('rejects invalid public sync input %#', (run) => {
    expect(run).toThrow('VALIDATION_FAILED');
  });
});
