import { ReportsCache } from '../../../src/reports/reports.cache';
import { renderReport } from '../../../src/reports/reports.renderer';
import type { ReportSnapshot } from '../../../src/reports/reports.schemas';
import { ReportsSmtpError } from '../../../src/reports/reports.smtp';
import { ReportsWorker } from '../../../src/reports/reports.worker';

describe('report stress budgets', () => {
  it('renders 100k transaction rows inside the bounded output and time budgets', async () => {
    const startingHeap = process.memoryUsage().heapUsed;
    let peakHeap = startingHeap;
    const detailedRows = Array.from({ length: 100_000 }, (_, index) => ({
      occurredAt: '2026-08-01T00:00:00.000Z',
      kind: 'expense',
      amountMinor: index,
      currencyCode: 'SAR',
      categoryLabel: `category-${String(index % 20)}`,
    }));
    const snapshot: ReportSnapshot = {
      schemaVersion: 1,
      generatedAt: '2026-09-04T00:00:00.000Z',
      ledgerVersion: 1,
      reportType: 'account_activity',
      period: {
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        timezone: 'Asia/Riyadh',
        kind: 'monthly',
      },
      format: 'csv',
      delivery: 'download',
      currencyCode: 'SAR',
      dataState: 'complete',
      evidence: [],
      summary: {},
      breakdowns: [],
      detailedRows,
    };
    const startedAt = performance.now();
    const rendered = renderReport(snapshot, 'csv', 20_000_000);
    let chunks = 0;
    for await (const _chunk of rendered.body) {
      void _chunk;
      chunks += 1;
      peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    }
    const count = await rendered.byteCounter;
    expect(count.bytes).toBeLessThan(20_000_000);
    expect(chunks).toBeGreaterThan(1);
    expect(peakHeap - startingHeap).toBeLessThan(192 * 1024 * 1024);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  }, 15_000);

  it('bounds concurrent runners while draining schedule and expiry backlogs oldest first', async () => {
    const due = Array.from({ length: 25 }, (_, index) => ({
      id: `schedule-${String(index)}`,
    }));
    const expired = Array.from({ length: 25 }, (_, index) => `attempt-${String(index)}`);
    const scheduled: string[] = [];
    const expiredOutcomes: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const repository = {
      listDueSchedules: jest.fn((_now: Date, limit: number) =>
        Promise.resolve(due.slice(0, limit)),
      ),
      enqueueDueSchedule: jest.fn((id: string) => {
        scheduled.push(id);
        due.shift();
        return Promise.resolve(true);
      }),
      listWork: jest.fn((kind: string, limit: number) =>
        Promise.resolve(kind === 'report.output.expire' ? expired.slice(0, limit) : []),
      ),
      withWorkLock: jest.fn(
        async (kind: string, id: string, action: (claim: never) => Promise<{ status: string }>) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          try {
            const outcome = await action({
              id,
              userId: 'owner',
              status: 'ready',
              snapshot: {},
              storageRef: `reports/${id}`,
              expiresAt: '2026-09-03T00:00:00.000Z',
              attemptCount: 1,
            } as never);
            if (kind === 'report.output.expire') {
              expiredOutcomes.push(outcome.status);
              expired.shift();
            }
            return true;
          } finally {
            active -= 1;
          }
        },
      ),
    };
    const storage = {
      delete: jest.fn(() => new Promise<void>((resolve) => setImmediate(resolve))),
    };
    const config = {
      getRequired: jest.fn((key: string) => (key === 'MASARIFI_REPORT_BATCH_SIZE' ? 10 : 3)),
    };
    const worker = new ReportsWorker(repository as never, storage as never, config as never);

    await Promise.all([worker.runOnce(), worker.runOnce()]);
    expect(scheduled).toEqual(
      Array.from({ length: 10 }, (_, index) => `schedule-${String(index)}`),
    );
    expect(expiredOutcomes).toEqual(Array(10).fill('expired'));
    expect(due).toHaveLength(15);
    expect(expired).toHaveLength(15);
    expect(maximumActive).toBe(1);

    await worker.runOnce();
    expect(scheduled).toEqual(
      Array.from({ length: 20 }, (_, index) => `schedule-${String(index)}`),
    );
    expect(due).toHaveLength(5);
    expect(expired).toHaveLength(5);
  });

  it('keeps a transient SMTP outage retryable within one bounded worker pass', async () => {
    let outcome: { status: string; errorCode?: string } | undefined;
    let pending = true;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest.fn((kind: string) =>
        Promise.resolve(kind === 'report.email.deliver' && pending ? ['attempt'] : []),
      ),
      withWorkLock: jest.fn(
        async (
          _kind: string,
          _id: string,
          action: (claim: never) => Promise<{ status: string; errorCode?: string }>,
        ) => {
          pending = false;
          outcome = await action({
            id: '99000000-0000-4000-8000-000000000001',
            userId: 'owner',
            status: 'ready',
            snapshot: {
              schemaVersion: 1,
              generatedAt: '2026-09-04T00:00:00.000Z',
              ledgerVersion: 1,
              reportType: 'financial_summary',
              period: {
                startDate: '2026-08-01',
                endDate: '2026-08-31',
                timezone: 'Asia/Riyadh',
                kind: 'monthly',
              },
              format: 'pdf',
              delivery: 'email',
              currencyCode: 'SAR',
              dataState: 'empty',
              evidence: [],
              summary: {},
              breakdowns: [],
              detailedRows: [],
            },
            storageRef: 'reports/private.pdf',
            expiresAt: '2026-09-05T00:00:00.000Z',
            attemptCount: 1,
            recipient: 'owner@example.test',
          } as never);
          return true;
        },
      ),
    };
    const config = {
      getRequired: jest.fn(
        (key: string) =>
          (
            ({
              MASARIFI_REPORT_BATCH_SIZE: 10,
              MASARIFI_REPORT_MAX_BYTES: 1_000_000,
              MASARIFI_REPORT_MAX_ATTEMPTS: 3,
              MASARIFI_REPORT_SIGNED_URL_SECONDS: 300,
            }) as Record<string, number>
          )[key],
      ),
    };
    const worker = new ReportsWorker(
      repository as never,
      { sign: jest.fn().mockResolvedValue('https://example.test/report') } as never,
      config as never,
      undefined,
      {
        send: jest.fn().mockRejectedValue(new ReportsSmtpError('REPORT_SMTP_TRANSIENT', true)),
      } as never,
    );
    const startedAt = performance.now();
    await worker.runOnce();
    expect(outcome).toMatchObject({
      status: 'ready',
      errorCode: 'REPORT_SMTP_TRANSIENT',
    });
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it('keeps maximum-size cache hits comfortably inside the summary budget', () => {
    const cache = new ReportsCache(500, 300_000);
    for (let index = 0; index < 500; index += 1) {
      cache.set(ReportsCache.key(`owner-${String(index)}`, 'report', 'monthly', 'SAR', 1), {
        value: index,
      });
    }
    const durations: number[] = [];
    const key = ReportsCache.key('owner-499', 'report', 'monthly', 'SAR', 1);
    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      expect(cache.get(key)).toEqual({ value: 499 });
      durations.push(performance.now() - startedAt);
    }
    durations.sort((left, right) => left - right);
    expect(durations[Math.ceil(durations.length * 0.95) - 1]).toBeLessThan(50);
  });
});
