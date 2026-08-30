import type { PoolService } from '../../../src/platform/database/pool.service';
import { OutboxDispatcher } from '../../../src/platform/outbox/outbox-dispatcher';
import { OutboxRepository } from '../../../src/platform/outbox/outbox.repository';
import type { QueuePublisher } from '../../../src/platform/outbox/queue-publisher';
import {
  createLivePool,
  describeLiveDatabase,
  removeOutbox,
  seedOutbox,
} from '../../live-database';

describeLiveDatabase('outbox queue recovery', () => {
  let pool: PoolService;
  let repository: OutboxRepository;

  beforeAll(() => {
    pool = createLivePool();
    repository = new OutboxRepository(pool);
  });
  afterAll(async () => pool.onModuleDestroy());

  it('retains rows through outage, slowdown, restart, recovery, and terminal exhaustion', async () => {
    const aggregateId = await seedOutbox(pool, 4);
    try {
      await pool.query(
        "update private.outbox_events set available_at = '1900-01-01T00:00:00Z' where aggregate_id = $1",
        [aggregateId],
      );
      const outageRows = await repository.claim('outage-worker', 3, 30);
      const unavailable = {
        publish: jest.fn().mockRejectedValue(new Error('queue unavailable')),
      } as never;
      const outageDispatcher = new OutboxDispatcher(
        repository,
        unavailable,
        undefined,
        () => 0,
        10,
        1,
        1,
        0,
      );
      await Promise.all(
        outageRows.map((row) => outageDispatcher.dispatch(row, 'outage-worker', 'outage')),
      );

      const retained = await pool.query<{ count: string }>(
        'select count(*)::text as count from private.outbox_events where aggregate_id = $1 and published_at is null',
        [aggregateId],
      );
      expect(retained.rows[0]?.count).toBe('4');

      await pool.query(
        "update private.outbox_events set available_at = '1900-01-01T00:00:00Z' where aggregate_id = $1 and published_at is null",
        [aggregateId],
      );
      const restartedRepository = new OutboxRepository(pool);
      const replay = await restartedRepository.claim('restart-worker', 3, 30);
      const publish = jest.fn(async () => new Promise<void>((resolve) => setTimeout(resolve, 25)));
      const slowPublisher = { publish } as unknown as QueuePublisher;
      const recoveryDispatcher = new OutboxDispatcher(restartedRepository, slowPublisher);
      await Promise.all(
        replay.map((row) => recoveryDispatcher.dispatch(row, 'restart-worker', 'recovery')),
      );
      expect(publish).toHaveBeenCalledTimes(3);

      const terminal = await repository.claim('terminal-worker', 1, 30);
      expect(terminal).toHaveLength(1);
      const terminalEvent = terminal[0];
      if (!terminalEvent) throw new Error('EXPECTED_TERMINAL_CLAIM');
      await pool.query('update private.outbox_events set attempt_count = 9 where id = $1', [
        terminalEvent.id,
      ]);
      terminalEvent.attemptCount = 9;
      const terminalDispatcher = new OutboxDispatcher(
        repository,
        unavailable,
        undefined,
        () => 0,
        10,
        1,
        1,
        0,
      );
      await terminalDispatcher.dispatch(terminalEvent, 'terminal-worker', 'terminal');

      const sourceRows = await pool.query<{
        id: string;
        published_at: Date | null;
        last_error_code: string | null;
      }>(
        'select id, published_at, last_error_code from private.outbox_events where aggregate_id = $1 order by id',
        [aggregateId],
      );
      expect(sourceRows.rows).toHaveLength(4);
      expect(sourceRows.rows.filter((row) => row.published_at)).toHaveLength(3);
      expect(
        sourceRows.rows.filter((row) => row.last_error_code === 'OUTBOX_DELIVERY_EXHAUSTED'),
      ).toHaveLength(1);
    } finally {
      await removeOutbox(pool, aggregateId);
    }
  });
});
