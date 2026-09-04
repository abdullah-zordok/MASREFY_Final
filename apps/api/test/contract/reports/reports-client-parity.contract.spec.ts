import { readFileSync } from 'node:fs';

import { load } from 'js-yaml';

type Operation = { operationId?: string };
type ApiDocument = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, { enum?: string[] }> } };

describe('Phase 10 client/OpenAPI parity', () => {
  const contract = load(readFileSync('specs/010-reports-analytics-exports-email/contracts/openapi.yaml', 'utf8')) as ApiDocument;
  const operations = new Set(Object.values(contract.paths).flatMap((path) => Object.values(path).map((operation) => operation.operationId)));
  const mobile = readFileSync('../mobile/src/services/live/reports-service.ts', 'utf8');
  const admin = readFileSync('../admin-web/src/features/overview/report-exports.ts', 'utf8');

  it('keeps every Mobile and Admin report operation in the frozen API contract', () => {
    expect([...operations]).toEqual(expect.arrayContaining([
      'getReportSummary', 'listReportAttempts', 'createReport', 'getReportAttempt', 'retryReportDelivery',
      'listReportSchedules', 'createReportSchedule', 'verifyReportRecipient', 'updateReportSchedule', 'deleteReportSchedule',
      'getAdminOverview', 'getAdminPlatformAnalytics', 'getAdminOverviewActivity', 'createAdminExport', 'getAdminExport',
    ]));
    for (const path of ['/api/v1/reports/summary', '/api/v1/reports', '/api/v1/report-schedules']) expect(mobile).toContain(path);
    for (const path of ['/api/v1/admin/exports', '/api/v1/admin/exports/']) expect(admin).toContain(path);
  });

  it('keeps public enums exact and bounded', () => {
    const values = (name: string) => contract.components.schemas[name]?.enum;
    expect(values('ReportType')).toEqual(['financial_summary', 'category_spending', 'budget_performance', 'obligation_progress', 'savings_progress', 'account_activity']);
    expect(values('ReportPeriod')).toEqual(['monthly', 'three_months', 'half_year', 'annual']);
    expect(values('ReportFormat')).toEqual(['json', 'csv', 'pdf']);
    expect(values('DeliveryChannel')).toEqual(['download', 'email']);
    expect(values('ReportStatus')).toEqual(['queued', 'generating', 'ready', 'sending', 'delivered', 'failed', 'expired']);
  });
});
