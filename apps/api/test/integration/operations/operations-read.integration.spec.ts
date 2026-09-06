import { OperationsRepository } from '../../../src/operations/operations.repository';

const principal = {
  userId: 'admin-operations',
  sessionId: 'session-operations',
  claims: {},
} as never;

describe('operations repository reads', () => {
  it('uses one parameterized database function and bounded input', async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: jest.fn((text: string, values?: unknown[]) => {
        calls.push({ text, values });
        return Promise.resolve(
          text.startsWith('select private.read_operations')
            ? { rows: [{ value: { items: [], nextCursor: null } }] }
            : { rows: [] },
        );
      }),
    };
    const repository = new OperationsRepository({
      withClient: async (action: (value: typeof client) => Promise<unknown>) => action(client),
    } as never);

    await expect(
      repository.read(principal, 'job-runs', { limit: 100, status: 'failed' }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(calls.find(({ text }) => text.includes('read_operations'))).toEqual({
      text: 'select private.read_operations($1,$2::jsonb) value',
      values: ['job-runs', '{"limit":100,"status":"failed"}'],
    });
    expect(calls.map(({ text }) => text)).not.toContain('failed');
  });
});
