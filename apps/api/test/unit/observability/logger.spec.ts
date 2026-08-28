import {
  PlatformLogger,
  redactSensitive,
} from '../../../src/platform/observability/platform-logger';

describe('PlatformLogger', () => {
  it('writes one bounded JSON record with correlation fields', () => {
    const lines: string[] = [];
    const logger = new PlatformLogger((line) => lines.push(line), 'debug');

    logger.info('request.completed', {
      context: 'Http',
      requestId: 'req-1',
      code: 'OK',
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      level: 'info',
      message: 'request.completed',
      context: 'Http',
      requestId: 'req-1',
      code: 'OK',
    });
  });

  it('redacts credential keys and credential-bearing strings recursively', () => {
    const sentinel = 'sentinel-secret-value';
    const value = redactSensitive({
      password: sentinel,
      nested: { authorization: `Bearer ${sentinel}` },
      database: `postgresql://user:${sentinel}@localhost/db`,
      email: 'owner@example.test',
      phone: '+966500000012',
      sessionId: 'session_fixture_a',
    });
    const encoded = JSON.stringify(value);

    expect(encoded).not.toContain(sentinel);
    expect(encoded).toContain('[REDACTED]');
  });

  it('drops messages below the configured level', () => {
    const lines: string[] = [];
    const logger = new PlatformLogger((line) => lines.push(line), 'warn');

    logger.info('ignored');
    logger.warn('kept');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('kept');
  });
});
