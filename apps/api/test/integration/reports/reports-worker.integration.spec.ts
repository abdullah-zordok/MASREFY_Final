import { ReportsWorker } from '../../../src/reports/reports.worker';
import type { ReportWorkOutcome } from '../../../src/reports/reports.repository';

const snapshot = {
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
  format: 'json',
  delivery: 'download',
  currencyCode: 'SAR',
  dataState: 'empty',
  evidence: [],
  summary: {},
  breakdowns: [],
  detailedRows: [],
};

describe('ReportsWorker generation and expiry', () => {
  const config = {
    getRequired: jest.fn(
      (key: string) =>
        (
          ({
            MASARIFI_REPORT_BATCH_SIZE: 10,
            MASARIFI_REPORT_MAX_BYTES: 1_000_000,
            MASARIFI_REPORT_MAX_ATTEMPTS: 10,
          }) as Record<string, unknown>
        )[key],
    ),
  };

  it('renders, privately stores, verifies, and completes one immutable claim', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          kind === 'report.generate' ? Promise.resolve(['id']) : Promise.resolve([]),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (
            _kind: string,
            _id: string,
            action: (claim: never) => Promise<ReportWorkOutcome>,
          ) => {
            outcome = await action({
              id: '99000000-0000-4000-8000-000000000001',
              userId: 'owner',
              status: 'queued',
              snapshot,
              storageRef: null,
              expiresAt: '2026-09-05T00:00:00.000Z',
              attemptCount: 0,
            } as never);
            return true;
          },
        ),
    };
    const storage = {
      upload: jest.fn().mockResolvedValue({ key: 'private', bytes: 10, sha256: 'a'.repeat(64) }),
      verify: jest.fn(),
      delete: jest.fn(),
    };
    const worker = new ReportsWorker(
      repository as never,
      storage as never,
      config as never,
      Buffer.from('font'),
    );
    await worker.runOnce();
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.verify).toHaveBeenCalledWith('private', 10);
    expect(repository.withWorkLock).toHaveReturnedTimes(1);
    expect(outcome).toMatchObject({
      status: 'ready',
      storageRef: 'private',
      event: { type: 'report.ready' },
    });
  });

  it('deletes an expired private object before completing the terminal state', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          kind === 'report.output.expire' ? Promise.resolve(['id']) : Promise.resolve([]),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (
            _kind: string,
            _id: string,
            action: (claim: never) => Promise<ReportWorkOutcome>,
          ) => {
            outcome = await action({
              id: '99000000-0000-4000-8000-000000000001',
              userId: 'owner',
              status: 'ready',
              snapshot,
              storageRef: 'private',
              expiresAt: '2026-09-03T00:00:00.000Z',
              attemptCount: 1,
            } as never);
            return true;
          },
        ),
    };
    const storage = { upload: jest.fn(), verify: jest.fn(), delete: jest.fn() };
    await new ReportsWorker(
      repository as never,
      storage as never,
      config as never,
      Buffer.from('font'),
    ).runOnce();
    expect(storage.delete).toHaveBeenCalledWith('private');
    expect(outcome).toMatchObject({ status: 'expired', event: { type: 'report.expired' } });
  });

  it('maps poison snapshots to a terminal safe failure without logging content', async () => {
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]),
      enqueueDueSchedule: jest.fn(),
      listWork: jest
        .fn()
        .mockImplementation((kind: string) =>
          kind === 'report.generate' ? Promise.resolve(['id']) : Promise.resolve([]),
        ),
      withWorkLock: jest
        .fn()
        .mockImplementation(
          async (_kind: string, _id: string, action: (claim: unknown) => Promise<unknown>) =>
            action({
              id: 'id',
              userId: 'owner',
              status: 'queued',
              snapshot: { secret: 'never-log' },
              attemptCount: 9,
            }),
        ),
    };
    const storage = { upload: jest.fn(), verify: jest.fn(), delete: jest.fn() };
    await new ReportsWorker(
      repository as never,
      storage as never,
      config as never,
      Buffer.from('font'),
    ).runOnce();
    expect(storage.upload).not.toHaveBeenCalled();
  });
});
