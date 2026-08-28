import { OutboxRepository } from '../../../src/platform/outbox/outbox.repository';

function databaseResult(result: { rowCount?: number; rows: unknown[] }) {
  const query = jest.fn().mockImplementation((text: string) => {
    if (text === 'begin' || text === 'set local role masarifi_worker' || text === 'commit') {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve(result);
  });
  return {
    database: { withClient: (action: (client: { query: typeof query }) => unknown) => action({ query }) },
    query,
  };
}

describe('OutboxRepository', () => {
  it('claims through the bounded database function', async () => {
    const { database, query } = databaseResult({ rows: [] });
    const repository = new OutboxRepository(database as never);

    await repository.claim('worker-1', 50, 30);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('private.claim_outbox_batch'),
      ['worker-1', 50, 30],
    );
    expect(query).toHaveBeenNthCalledWith(1, 'begin');
    expect(query).toHaveBeenNthCalledWith(2, 'set local role masarifi_worker');
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('private.claim_outbox_batch'),
      ['worker-1', 50, 30],
    );
    expect(query).toHaveBeenNthCalledWith(4, 'commit');
  });

  it('completes only the current lease owner and clears the lease', async () => {
    const { database, query } = databaseResult({ rowCount: 1, rows: [{ id: 'event-1' }] });
    const repository = new OutboxRepository(database as never);

    await expect(repository.complete('event-1', 'worker-1')).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/id = \$1[\s\S]*locked_by = \$2/),
      ['event-1', 'worker-1'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('locked_by = null'),
      expect.any(Array),
    );
    expect(query).toHaveBeenCalledWith(
      expect.not.stringContaining('payload ='),
      expect.any(Array),
    );
  });

  it('reports a stale completion as false', async () => {
    const { database } = databaseResult({ rowCount: 0, rows: [] });
    const repository = new OutboxRepository(database as never);

    await expect(repository.complete('event-1', 'stale-worker')).resolves.toBe(false);
  });
});
