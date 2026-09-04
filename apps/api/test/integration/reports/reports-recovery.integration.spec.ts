import { ReportsWorker } from '../../../src/reports/reports.worker';
import type { ReportWorkOutcome } from '../../../src/reports/reports.repository';

const snapshot = {
  schemaVersion: 1, generatedAt: '2026-09-04T00:00:00.000Z', ledgerVersion: 1,
  reportType: 'financial_summary', period: { startDate: '2026-08-01', endDate: '2026-08-31', timezone: 'Asia/Riyadh', kind: 'monthly' },
  format: 'pdf', delivery: 'email', currencyCode: 'SAR', dataState: 'empty', evidence: [], summary: {}, breakdowns: [], detailedRows: [],
};

describe('report worker recovery', () => {
  it('terminalizes a post-DATA crash recovery without sending twice', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]), enqueueDueSchedule: jest.fn(),
      listWork: jest.fn().mockImplementation((kind: string) => Promise.resolve(kind === 'report.email.deliver' ? ['attempt'] : [])),
      withWorkLock: jest.fn().mockImplementation(async (_kind: string, _id: string, action: (claim: never) => Promise<ReportWorkOutcome>) => {
        outcome = await action({ id: '99000000-0000-4000-8000-000000000001', userId: 'owner', status: 'sending', snapshot, storageRef: 'private', expiresAt: '2026-09-05T00:00:00.000Z', attemptCount: 2 } as never);
      }),
    };
    const smtp = { send: jest.fn() };
    const config = { getRequired: jest.fn((key: string) => ({ MASARIFI_REPORT_BATCH_SIZE: 10, MASARIFI_REPORT_MAX_BYTES: 1_000_000, MASARIFI_REPORT_MAX_ATTEMPTS: 3, MASARIFI_REPORT_SIGNED_URL_SECONDS: 300 } as Record<string, number>)[key]) };
    await new ReportsWorker(repository as never, { sign: jest.fn() } as never, config as never, undefined, smtp as never).runOnce();
    expect(smtp.send).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 'failed', errorCode: 'DELIVERY_ACCEPTANCE_UNKNOWN' });
  });

  it('leaves a failed Storage deletion retryable without losing its private reference', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]), enqueueDueSchedule: jest.fn(),
      listWork: jest.fn().mockImplementation((kind: string) => Promise.resolve(kind === 'report.output.expire' ? ['attempt'] : [])),
      withWorkLock: jest.fn().mockImplementation(async (_kind: string, _id: string, action: (claim: never) => Promise<ReportWorkOutcome>) => {
        outcome = await action({ id: '99000000-0000-4000-8000-000000000001', userId: 'owner', status: 'ready', snapshot: { ...snapshot, delivery: 'download' }, storageRef: 'private', expiresAt: '2026-09-03T00:00:00.000Z', attemptCount: 1 } as never);
      }),
    };
    const config = { getRequired: jest.fn((key: string) => key === 'MASARIFI_REPORT_BATCH_SIZE' ? 10 : 3) };
    await new ReportsWorker(repository as never, { delete: jest.fn().mockRejectedValue(new Error('offline')) } as never, config as never).runOnce();
    expect(outcome).toEqual({ status: 'failed', errorCode: 'REPORT_STORAGE_UNAVAILABLE' });
  });

  it('cleans an orphaned object before replaying a crashed generation claim', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const generationSnapshot = { ...snapshot, format: 'json', delivery: 'download' };
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]), enqueueDueSchedule: jest.fn(),
      listWork: jest.fn().mockImplementation((kind: string) => Promise.resolve(kind === 'report.generate' ? ['attempt'] : [])),
      withWorkLock: jest.fn().mockImplementation(async (_kind: string, _id: string, action: (claim: never) => Promise<ReportWorkOutcome>) => {
        outcome = await action({ id: '99000000-0000-4000-8000-000000000001', userId: 'owner', status: 'generating', snapshot: generationSnapshot, storageRef: null, expiresAt: '2026-09-05T00:00:00.000Z', attemptCount: 2 } as never);
      }),
    };
    const storage = {
      key: jest.fn().mockReturnValue('private'), delete: jest.fn(),
      upload: jest.fn().mockResolvedValue({ key: 'private', bytes: 10 }), verify: jest.fn(),
    };
    const config = { getRequired: jest.fn((key: string) => ({ MASARIFI_REPORT_BATCH_SIZE: 10, MASARIFI_REPORT_MAX_BYTES: 1_000_000, MASARIFI_REPORT_MAX_ATTEMPTS: 3 } as Record<string, number>)[key]) };
    await new ReportsWorker(repository as never, storage as never, config as never).runOnce();
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(storage.upload.mock.invocationCallOrder[0] ?? 0);
    expect(outcome).toMatchObject({ status: 'ready', storageRef: 'private' });
  });
});
