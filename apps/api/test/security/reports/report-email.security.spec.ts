import { ReportsSmtp } from '../../../src/reports/reports.smtp';

const values: Record<string, unknown> = {
  EMAIL_SMTP_HOST: 'smtp.example.test',
  EMAIL_SMTP_PORT: 465,
  EMAIL_SMTP_USERNAME: 'user',
  EMAIL_SMTP_PASSWORD: 'never-print-this',
  EMAIL_FROM: 'reports@example.test',
  MASARIFI_EMAIL_SMTP_CONNECTION_TIMEOUT_MS: 1_000,
  MASARIFI_EMAIL_SMTP_SOCKET_TIMEOUT_MS: 2_000,
  SUPABASE_URL: 'https://project.supabase.co',
};

describe('report email privacy boundary', () => {
  it('sends only one recipient, a generic subject, text, and no attachment', async () => {
    let message: Record<string, unknown> = {};
    const transport = {
      sendMail: jest.fn((value: Record<string, unknown>) => {
        message = value;
        return Promise.resolve({ accepted: ['owner@example.test'] });
      }),
    };
    const smtp = new ReportsSmtp({ getRequired: (key: string) => values[key] } as never, transport);
    await smtp.send(
      '99000000-0000-4000-8000-000000000001',
      'owner@example.test',
      'https://project.supabase.co/storage/v1/object/sign/report-exports/reports/key?token=opaque',
    );
    expect(message).toMatchObject({
      to: 'owner@example.test',
      subject: 'Your Masarifi report is ready',
      attachments: undefined,
    });
    expect(message).not.toHaveProperty('bcc');
    expect(JSON.stringify(message)).not.toContain('never-print-this');
    expect(JSON.stringify(message)).not.toMatch(/amount|balance|transaction/i);
  });
});
