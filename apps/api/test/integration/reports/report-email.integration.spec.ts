import { ReportsSmtpError } from '../../../src/reports/reports.smtp';
import { ReportsWorker } from '../../../src/reports/reports.worker';
import type { ReportWorkOutcome } from '../../../src/reports/reports.repository';

const snapshot = {
  schemaVersion: 1, generatedAt: '2026-09-04T00:00:00.000Z', ledgerVersion: 1,
  reportType: 'financial_summary', period: { startDate: '2026-08-01', endDate: '2026-08-31', timezone: 'Asia/Riyadh', kind: 'monthly' },
  format: 'pdf', delivery: 'email', currencyCode: 'SAR', dataState: 'empty', evidence: [], summary: {}, breakdowns: [], detailedRows: [],
};
const claim = { id: '99000000-0000-4000-8000-000000000001', userId: 'owner', status: 'ready', snapshot, storageRef: 'reports/key', expiresAt: '2026-09-05T00:00:00.000Z', attemptCount: 1, recipient: 'owner@example.test' };
const config = { getRequired: jest.fn((key: string) => ({ MASARIFI_REPORT_BATCH_SIZE: 10, MASARIFI_REPORT_MAX_BYTES: 1_000_000, MASARIFI_REPORT_MAX_ATTEMPTS: 3, MASARIFI_REPORT_SIGNED_URL_SECONDS: 300 } as Record<string, number>)[key]) };

function repositoryFor(result: (value: ReportWorkOutcome) => void, workClaim = claim) {
  let delivered = false;
  return {
    listDueSchedules: jest.fn().mockResolvedValue([]), enqueueDueSchedule: jest.fn(),
    listWork: jest.fn().mockImplementation((kind: string) => Promise.resolve(kind === 'report.email.deliver' && !delivered ? ['id'] : [])),
    withWorkLock: jest.fn().mockImplementation(async (_kind: string, _id: string, action: (work: never) => Promise<ReportWorkOutcome>) => {
      delivered = true;
      result(await action(workClaim as never));
      return true;
    }),
  };
}

describe('report email worker', () => {
  it('signs at send time and records one SMTP acceptance on replay', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = repositoryFor((value) => { outcome = value; });
    const storage = { sign: jest.fn().mockResolvedValue('https://project.supabase.co/storage/v1/object/sign/report-exports/reports/key?token=opaque') };
    const smtp = { send: jest.fn().mockResolvedValue({ providerMessageId: '<stable@example.test>', acceptedByServerAt: '2026-09-04T00:00:00.000Z' }) };
    const worker = new ReportsWorker(repository as never, storage as never, config as never, undefined, smtp as never);
    await worker.runOnce();
    await worker.runOnce();
    expect(storage.sign).toHaveBeenCalledTimes(1);
    expect(smtp.send).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ status: 'delivered', providerMessageId: '<stable@example.test>', event: { type: 'report.delivery_succeeded' } });
  });

  it.each([
    [new ReportsSmtpError('REPORT_SMTP_TRANSIENT', true), 'ready', true],
    [new ReportsSmtpError('REPORT_SMTP_REJECTED'), 'failed', false],
    [new ReportsSmtpError('DELIVERY_ACCEPTANCE_UNKNOWN', false, true), 'failed', false],
  ])('classifies delivery failure without exposing provider content', async (failure, status, retryable) => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = repositoryFor((value) => { outcome = value; });
    const storage = { sign: jest.fn().mockResolvedValue('https://project.supabase.co/storage/v1/object/sign/report-exports/reports/key?token=opaque') };
    const smtp = { send: jest.fn().mockRejectedValue(failure) };
    await new ReportsWorker(repository as never, storage as never, config as never, undefined, smtp as never).runOnce();
    expect(outcome).toMatchObject({ status, errorCode: failure.code, event: { type: 'report.delivery_failed', data: { retryable } } });
    expect(JSON.stringify(outcome)).not.toContain('owner@example.test');
  });

  it('fails a recovered sending claim without risking a duplicate SMTP acceptance', async () => {
    let outcome: ReportWorkOutcome | undefined;
    const repository = repositoryFor((value) => { outcome = value; }, { ...claim, status: 'sending' });
    const storage = { sign: jest.fn() };
    const smtp = { send: jest.fn() };
    await new ReportsWorker(repository as never, storage as never, config as never, undefined, smtp as never).runOnce();
    expect(smtp.send).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ status: 'failed', errorCode: 'DELIVERY_ACCEPTANCE_UNKNOWN' });
  });
});
