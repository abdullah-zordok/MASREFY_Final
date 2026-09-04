import { buildReportEvent } from '../../../src/reports/reports.events';

describe('report delivery events', () => {
  const attemptId = '99000000-0000-4000-8000-000000000001';
  it('keeps delivery success and failure metadata exact and private', () => {
    expect(buildReportEvent('report.delivery_succeeded', { attemptId, acceptedByServerAt: '2026-09-04T00:00:00.000Z' })).toEqual({
      type: 'report.delivery_succeeded', schemaVersion: 1, data: { attemptId, acceptedByServerAt: '2026-09-04T00:00:00.000Z' },
    });
    expect(buildReportEvent('report.delivery_failed', { attemptId, errorCode: 'REPORT_SMTP_REJECTED', retryable: false, attemptCount: 1 })).not.toHaveProperty('data.recipient');
    expect(() => buildReportEvent('report.delivery_failed', { attemptId, errorCode: 'REPORT_SMTP_REJECTED', retryable: false, attemptCount: 1, recipient: 'private@example.test' })).toThrow('REPORT_EVENT_INVALID');
  });
});
