import { SyncRepository } from './sync-repository';

describe('Mobile sync queue recovery', () => {
  it('recovers sending rows and caps retry without changing the operation ID', async () => {
    const calls: unknown[][] = [];
    const database = {
      runAsync: jest.fn(async (...arguments_: unknown[]) => {
        calls.push(arguments_);
      })
    };
    const repository = new SyncRepository(database as never);

    await repository.recoverSending(1_000);
    await repository.retry(
      'operation-one',
      999_999,
      'NETWORK_UNAVAILABLE',
      2_000
    );

    expect(calls[0]).toEqual([
      expect.stringContaining("status='pending'"),
      1_000,
      1_000
    ]);
    expect(calls[1]).toEqual([
      expect.stringContaining('next_attempt_at=?'),
      302_000,
      'NETWORK_UNAVAILABLE',
      2_000,
      'operation-one'
    ]);
  });
});
