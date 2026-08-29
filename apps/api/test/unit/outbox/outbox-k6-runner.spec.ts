import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildOutboxK6Arguments,
  buildOutboxK6Environment,
  forwardTerminationSignals,
} from '../../performance/run-outbox-k6';

describe('outbox k6 runner', () => {
  it('selects bounded load and stress scenarios with separate evidence files', () => {
    expect(buildOutboxK6Arguments(false)).toEqual([
      'run',
      '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
      '--summary-export=test/performance/artifacts/outbox-summary.json',
      'test/performance/outbox-dispatch.k6.js',
    ]);
    expect(buildOutboxK6Arguments(true)).toEqual([
      'run',
      '--summary-trend-stats=avg,min,med,max,p(90),p(95),p(99)',
      '--env',
      'MASARIFI_STRESS=1',
      '--summary-export=test/performance/artifacts/outbox-stress-summary.json',
      'test/performance/outbox-dispatch.k6.js',
    ]);
  });

  it('disables TLS only for loopback databases and bounds database connections', () => {
    expect(
      buildOutboxK6Environment('postgresql://postgres:postgres@127.0.0.1:54322/postgres', {})
        .DATABASE_URL,
    ).toBe('postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable');
    expect(
      buildOutboxK6Environment('postgresql://user:secret@db.example.com:5432/app', {}).DATABASE_URL,
    ).toBe('postgresql://user:secret@db.example.com:5432/app');

    const script = readFileSync(
      resolve(process.cwd(), 'test/performance/outbox-dispatch.k6.js'),
      'utf8',
    );
    expect(script).toContain('max_open_conns: 1');
    expect(script).toContain('const claimBatchSize = 50;');
    expect(script).toContain('claimBatchSize,');
    expect(script).toContain("'outbox_claim_duration_ms{phase:steady}'");
    expect(script).toContain("claimDuration.add(Date.now() - started, { phase });");
    expect(script).toContain("{ duration: '1m', target: 75 }");
    expect(script.match(/if \(__VU !== 1 \|\| __ITER % 20 !== 0\) return;/g)).toHaveLength(2);

    const runner = readFileSync(
      resolve(process.cwd(), 'test/performance/run-outbox-k6.ts'),
      'utf8',
    );
    expect(runner).not.toMatch(/grant masarifi_worker|revoke masarifi_worker/);
  });

  it('forwards termination to k6 and removes signal handlers after completion', () => {
    const listeners = new Map<string, () => void>();
    const signalProcess = {
      once: jest.fn((signal: string, listener: () => void) => {
        listeners.set(signal, listener);
      }),
      removeListener: jest.fn((signal: string) => {
        listeners.delete(signal);
      }),
    };
    const child = { kill: jest.fn(() => true) };

    const cleanup = forwardTerminationSignals(child, signalProcess);
    listeners.get('SIGINT')?.();
    expect(child.kill).toHaveBeenCalledWith('SIGINT');

    cleanup();
    expect(listeners.size).toBe(0);
  });
});
