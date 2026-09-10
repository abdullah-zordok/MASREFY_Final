import { buildReportEvent } from '../../../src/reports/reports.events';
import {
  normalizeAdminExportRequest,
  normalizeCreateReport,
  normalizeReportList,
  normalizeSummaryQuery,
  normalizeScheduleCreate,
  normalizeSchedulePatch,
  normalizeVerifyRecipient,
} from '../../../src/reports/reports.dto';
import { parseReportSnapshot } from '../../../src/reports/reports.schemas';

const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-09-04T00:00:00.000Z',
  ledgerVersion: 42,
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
  dataState: 'complete',
  evidence: [{ kind: 'ledger', id: 'ledger-v42', version: 42, asOf: '2026-09-04T00:00:00.000Z' }],
  summary: {
    incomeMinor: 250_000,
    expenseMinor: 125_000,
    netCashFlowMinor: 125_000,
  },
  breakdowns: [],
  detailedRows: [],
};

describe('Phase 10 report schemas', () => {
  it('accepts the exact immutable snapshot and returns a detached value', () => {
    const parsed = parseReportSnapshot(snapshot);
    expect(parsed).toEqual(snapshot);
    expect(parsed).not.toBe(snapshot);
  });

  it.each([
    { ...snapshot, schemaVersion: 2 },
    { ...snapshot, reportType: 'arbitrary_sql' },
    { ...snapshot, ledgerVersion: -1 },
    { ...snapshot, currencyCode: 'sar' },
    { ...snapshot, format: 'html' },
    { ...snapshot, delivery: 'push' },
    { ...snapshot, extra: true },
    { ...snapshot, summary: { ...snapshot.summary, amount: Number.NaN } },
  ])('rejects malformed or extended snapshots', (candidate) => {
    expect(() => parseReportSnapshot(candidate)).toThrow('REPORT_SNAPSHOT_INVALID');
  });

  it.each(['recipient', 'signedUrl', 'storageRef', 'password', 'providerPayload', 'token'])(
    'rejects forbidden nested key %s',
    (key) => {
      expect(() =>
        parseReportSnapshot({
          ...snapshot,
          summary: { ...snapshot.summary, nested: { [key]: 'private' } },
        }),
      ).toThrow('REPORT_SNAPSHOT_INVALID');
    },
  );

  it('enforces the encoded snapshot byte limit', () => {
    expect(() => parseReportSnapshot(snapshot, 100)).toThrow('REPORT_SNAPSHOT_TOO_LARGE');
  });

  it('builds only the six exact safe event contracts', () => {
    expect(
      buildReportEvent('report.requested', {
        attemptId: '99000000-0000-4000-8000-000000000001',
        reportType: 'financial_summary',
        format: 'pdf',
        delivery: 'email',
        ledgerVersion: 42,
      }),
    ).toEqual({
      type: 'report.requested',
      schemaVersion: 1,
      data: {
        attemptId: '99000000-0000-4000-8000-000000000001',
        reportType: 'financial_summary',
        format: 'pdf',
        delivery: 'email',
        ledgerVersion: 42,
      },
    });
    expect(() => buildReportEvent('report.started', { attemptId: 'x' })).toThrow(
      'REPORT_EVENT_INVALID',
    );
    expect(() =>
      buildReportEvent('report.ready', {
        attemptId: '99000000-0000-4000-8000-000000000001',
        format: 'pdf',
        bytes: 10,
        expiresAt: '2026-09-05T00:00:00.000Z',
        signedUrl: 'https://private.example',
      }),
    ).toThrow('REPORT_EVENT_INVALID');
  });

  it('normalizes bounded report creation and list inputs', () => {
    expect(
      normalizeCreateReport({
        type: 'financial_summary',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        format: 'pdf',
        delivery: 'email',
        recipient: ' Reports@Example.Test ',
      }),
    ).toEqual({
      type: 'financial_summary',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      format: 'pdf',
      delivery: 'email',
      recipient: 'reports@example.test',
    });
    expect(normalizeReportList({ limit: '100' })).toEqual({
      cursor: null,
      limit: 100,
      scheduleId: null,
      status: null,
    });
    expect(() => normalizeCreateReport({ ...snapshot, periodEnd: '2027-01-02' })).toThrow(
      'VALIDATION_FAILED',
    );
    expect(() => normalizeReportList({ limit: 101 })).toThrow('VALIDATION_FAILED');
  });

  it('normalizes exact report and dashboard summary queries', () => {
    expect(
      normalizeSummaryQuery(
        { type: 'financial_summary', period: 'monthly', currency: 'SAR' },
        true,
      ),
    ).toEqual({
      type: 'financial_summary',
      period: 'monthly',
      anchorDate: null,
      currency: 'SAR',
    });
    expect(normalizeSummaryQuery({ period: 'annual' }, false)).toEqual({
      type: 'financial_summary',
      period: 'annual',
      anchorDate: null,
      currency: null,
    });
    expect(() => normalizeSummaryQuery({ period: 'monthly', currency: 'sar' }, false)).toThrow(
      'VALIDATION_FAILED',
    );
    expect(() =>
      normalizeSummaryQuery({ type: 'financial_summary', period: 'monthly', extra: true }, true),
    ).toThrow('VALIDATION_FAILED');
  });

  it('normalizes recipient and versioned schedule mutations without extra fields', () => {
    expect(normalizeVerifyRecipient({ email: ' Reports@Example.Test ' })).toEqual({
      email: 'reports@example.test',
    });
    expect(
      normalizeScheduleCreate({
        reportType: 'financial_summary',
        frequency: 'monthly',
        timezone: 'Asia/Riyadh',
        deliveryChannel: 'email',
        recipient: 'reports@example.test',
        enabled: true,
      }),
    ).toMatchObject({ recipient: 'reports@example.test', enabled: true });
    expect(normalizeSchedulePatch({ expectedVersion: 2, enabled: false })).toEqual({
      expectedVersion: 2,
      patch: { enabled: false },
    });
    expect(() => normalizeSchedulePatch({ expectedVersion: 2, extra: true })).toThrow(
      'VALIDATION_FAILED',
    );
  });

  it('allows only server-known bounded Admin exports', () => {
    expect(
      normalizeAdminExportRequest({
        exportType: 'overview',
        period: '30d',
        platform: 'all',
        format: 'csv',
      }),
    ).toEqual({ exportType: 'overview', period: '30d', platform: 'all', format: 'csv' });
    expect(() =>
      normalizeAdminExportRequest({
        exportType: 'arbitrary_sql',
        period: '30d',
        format: 'csv',
        sql: 'select * from users',
      }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeAdminExportRequest({ exportType: 'user_report', period: '7d', format: 'pdf' }),
    ).toThrow('VALIDATION_FAILED');
  });
});
