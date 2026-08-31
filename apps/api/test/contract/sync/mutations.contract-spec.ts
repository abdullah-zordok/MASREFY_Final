import { normalizeMutationBatch } from '../../../src/sync/sync.dto';

const mutation = (operationId: string) => ({
  operationId,
  domain: 'accounts',
  resourceType: 'account',
  schemaVersion: 1,
  dependsOn: [],
  operation: 'create',
  payload: { name: 'Cash' },
});

describe('sync mutation batch contract', () => {
  it.each([1, 100])('accepts %i operations and preserves their order', (count) => {
    const mutations = Array.from({ length: count }, (_, index) =>
      mutation(`63000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
    );
    expect(normalizeMutationBatch({ mutations }).mutations.map((item) => item.operationId)).toEqual(
      mutations.map((item) => item.operationId),
    );
  });

  it.each([0, 101])('rejects %i operations', (count) => {
    expect(() =>
      normalizeMutationBatch({
        mutations: Array.from({ length: count }, (_, index) =>
          mutation(`63000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`),
        ),
      }),
    ).toThrow('VALIDATION_FAILED');
  });

  it('rejects a batch over 512 KiB', () => {
    expect(() =>
      normalizeMutationBatch({
        mutations: [
          {
            ...mutation('63000000-0000-4000-8000-000000000001'),
            payload: { text: 'x'.repeat(524_288) },
          },
        ],
      }),
    ).toThrow('VALIDATION_FAILED');
  });
});
