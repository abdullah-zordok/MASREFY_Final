import nodemailer from 'nodemailer';

import { ReportsSmtp, ReportsSmtpError } from '../../../src/reports/reports.smtp';

const values: Record<string, unknown> = {
  EMAIL_SMTP_HOST: 'smtp.example.test', EMAIL_SMTP_PORT: 587,
  EMAIL_SMTP_USERNAME: 'user', EMAIL_SMTP_PASSWORD: 'password', EMAIL_FROM: 'reports@example.test',
  MASARIFI_EMAIL_SMTP_CONNECTION_TIMEOUT_MS: 1_000, MASARIFI_EMAIL_SMTP_SOCKET_TIMEOUT_MS: 2_000,
  SUPABASE_URL: 'https://project.supabase.co',
};
const config = { getRequired: jest.fn((key: string) => values[key]) };
const attemptId = '99000000-0000-4000-8000-000000000001';
const url = 'https://project.supabase.co/storage/v1/object/sign/report-exports/reports/key?token=opaque';

describe('ReportsSmtp', () => {
  it('constructs one authenticated TLS-only transport with bounded timeouts', () => {
    const transport = { sendMail: jest.fn() };
    const spy = jest.spyOn(nodemailer, 'createTransport').mockReturnValue(transport as never);
    new ReportsSmtp(config as never);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.test', port: 587, secure: false, requireTLS: true,
      auth: { user: 'user', pass: 'password' }, connectionTimeout: 1_000, socketTimeout: 2_000,
      disableFileAccess: true, disableUrlAccess: true,
      tls: { servername: 'smtp.example.test', minVersion: 'TLSv1.2', rejectUnauthorized: true },
    }));
  });

  it('uses a stable Message-ID and treats server acceptance as delivery', async () => {
    const transport = { sendMail: jest.fn().mockResolvedValue({ accepted: ['owner@example.test'], rejected: [] }) };
    const smtp = new ReportsSmtp(config as never, transport);
    await expect(smtp.send(attemptId, 'owner@example.test', url, new Date('2026-09-04T00:00:00.000Z')))
      .resolves.toEqual({ providerMessageId: '<report-99000000-0000-4000-8000-000000000001@example.test>', acceptedByServerAt: '2026-09-04T00:00:00.000Z' });
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@example.test', subject: 'Your Masarifi report is ready',
      messageId: '<report-99000000-0000-4000-8000-000000000001@example.test>',
      attachments: undefined,
    }));
  });

  it.each([
    [{ responseCode: 451 }, 'REPORT_SMTP_TRANSIENT', true, false],
    [{ responseCode: 550 }, 'REPORT_SMTP_REJECTED', false, false],
    [{ code: 'ETIMEDOUT', command: 'DATA' }, 'DELIVERY_ACCEPTANCE_UNKNOWN', false, true],
    [{ code: 'ECONNREFUSED' }, 'REPORT_SMTP_TRANSIENT', true, false],
  ])('classifies safe SMTP failures', async (failure, code, retryable, ambiguous) => {
    const smtp = new ReportsSmtp(config as never, { sendMail: jest.fn().mockRejectedValue(failure) });
    await expect(smtp.send(attemptId, 'owner@example.test', url)).rejects.toMatchObject({ code, retryable, ambiguous });
  });

  it('rejects header injection and foreign or insecure URLs before sending', async () => {
    const transport = { sendMail: jest.fn() };
    const smtp = new ReportsSmtp(config as never, transport);
    await expect(smtp.send(attemptId, 'owner@example.test\r\nBcc:victim@example.test', url)).rejects.toBeInstanceOf(ReportsSmtpError);
    await expect(smtp.send(attemptId, 'owner@example.test', 'http://evil.test/report')).rejects.toBeInstanceOf(ReportsSmtpError);
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
