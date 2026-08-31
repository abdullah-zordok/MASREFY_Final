import { QueueHealthIndicator } from '../../../src/platform/health/queue-health.indicator';

describe('QueueHealthIndicator', () => {
  it('reports up only when the internal logged queue exists', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [{ healthy: true }] }),
    };
    const indicator = new QueueHealthIndicator(database as never);

    await expect(indicator.check(1_000)).resolves.toBe('up');
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('q_platform-events'),
      [],
      1_000,
    );
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('limit 101'), [], 1_000);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("status='processing'"),
      [],
      1_000,
    );
  });

  it('returns down without exposing the dependency error', async () => {
    const database = {
      query: jest.fn().mockRejectedValue(new Error('postgresql://secret-host')),
    };
    const indicator = new QueueHealthIndicator(database as never);

    await expect(indicator.check(1_000)).resolves.toBe('down');
  });

  it('maps a bounded database timeout to down', async () => {
    const database = {
      query: jest.fn().mockRejectedValue(new Error('DATABASE_QUERY_TIMEOUT')),
    };
    const indicator = new QueueHealthIndicator(database as never);

    await expect(indicator.check(1_000)).resolves.toBe('down');
    expect(database.query).toHaveBeenCalledWith(expect.any(String), [], 1_000);
  });
});
