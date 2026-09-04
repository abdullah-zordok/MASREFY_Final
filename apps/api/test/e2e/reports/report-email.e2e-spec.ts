import { ReportsSmtp } from '../../../src/reports/reports.smtp';
import { ReportsWorker } from '../../../src/reports/reports.worker';

describe('request-to-email delivery without provider credentials', () => {
  it('renders one deterministic SMTP envelope and suppresses replay', async () => {
    const sent: Record<string, unknown>[] = [];
    const smtpConfig = { getRequired: (key: string) => ({
      EMAIL_SMTP_HOST: 'localhost', EMAIL_SMTP_PORT: 465, EMAIL_SMTP_USERNAME: 'fixture', EMAIL_SMTP_PASSWORD: 'fixture',
      EMAIL_FROM: 'reports@example.test', MASARIFI_EMAIL_SMTP_CONNECTION_TIMEOUT_MS: 250,
      MASARIFI_EMAIL_SMTP_SOCKET_TIMEOUT_MS: 500, SUPABASE_URL: 'https://project.supabase.co',
    } as Record<string, unknown>)[key] };
    const smtp = new ReportsSmtp(smtpConfig as never, { sendMail: (message) => { sent.push(message); return Promise.resolve({ accepted: ['owner@example.test'] }); } });
    let pending = true;
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([]), enqueueDueSchedule: jest.fn(),
      listWork: jest.fn().mockImplementation((kind: string) => Promise.resolve(kind === 'report.email.deliver' && pending ? ['id'] : [])),
      withWorkLock: jest.fn().mockImplementation(async (_kind: string, _id: string, action: (claim: never) => Promise<unknown>) => {
        pending = false;
        await action({
          id: '99000000-0000-4000-8000-000000000001', userId: 'owner', status: 'ready', storageRef: 'reports/key', attemptCount: 1,
          expiresAt: '2026-09-05T00:00:00.000Z', recipient: 'owner@example.test',
          snapshot: { schemaVersion: 1, generatedAt: '2026-09-04T00:00:00.000Z', ledgerVersion: 1, reportType: 'financial_summary', period: { startDate: '2026-08-01', endDate: '2026-08-31', timezone: 'UTC', kind: 'monthly' }, format: 'pdf', delivery: 'email', currencyCode: 'SAR', dataState: 'empty', evidence: [], summary: {}, breakdowns: [], detailedRows: [] },
        } as never);
      }),
    };
    const storage = { sign: jest.fn().mockResolvedValue('https://project.supabase.co/storage/v1/object/sign/report-exports/reports/key?token=opaque') };
    const workerConfig = { getRequired: (key: string) => ({ MASARIFI_REPORT_BATCH_SIZE: 10, MASARIFI_REPORT_MAX_BYTES: 1_000_000, MASARIFI_REPORT_MAX_ATTEMPTS: 3, MASARIFI_REPORT_SIGNED_URL_SECONDS: 300 } as Record<string, number>)[key] };
    const worker = new ReportsWorker(repository as never, storage as never, workerConfig as never, undefined, smtp);
    await worker.runOnce();
    await worker.runOnce();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ messageId: '<report-99000000-0000-4000-8000-000000000001@example.test>', attachments: undefined });
  });
});
