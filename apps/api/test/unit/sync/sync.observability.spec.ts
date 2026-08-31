import { logSyncEvent } from '../../../src/sync/sync.observability';

describe('sync observability', () => {
  it('emits only bounded metadata and cannot accept payloads, keys, owners, or resource IDs', () => {
    const logger = { log: jest.fn() };
    logSyncEvent(logger as never, 'mutation.received', {
      outcome: 'received',
      domain: 'transactions',
      status: 'received',
      attempt: 1,
      requestId: 'request-one',
    });
    expect(logger.log).toHaveBeenCalledWith(
      {
        event: 'mutation.received',
        outcome: 'received',
        domain: 'transactions',
        status: 'received',
        attempt: 1,
        requestId: 'request-one',
      },
      'sync',
    );
    expect(JSON.stringify(logger.log.mock.calls)).not.toMatch(
      /payload|idempotency|owner|resource/i,
    );
  });
});
