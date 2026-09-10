import { createLiveReportsService, ReportsApiError } from './reports-service';
import { ReportsRepository } from '@/storage/reports-repository';

const generatedAt = '2026-09-04T00:00:00.000Z';
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
const input = {
  kind: 'monthly' as const,
  anchorDate: '2026-08-17' as const,
  currencyCode: 'SAR',
  timeZone: 'Asia/Riyadh'
};

function summary(dataState: 'complete' | 'empty' | 'partial' = 'complete') {
  return {
    metadata: {
      schemaVersion: 1,
      generatedAt,
      ledgerVersion: 7,
      reportType: 'financial_summary',
      period: 'monthly',
      range: {
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        timezone: 'Asia/Riyadh'
      },
      dataState,
      evidence: [{ kind: 'ledger', version: 7, asOf: generatedAt }]
    },
    summaries: [
      {
        income: { amountMinor: 10_000, currency: 'SAR' },
        expense: { amountMinor: 4_000, currency: 'SAR' },
        netCashFlow: { amountMinor: 6_000, currency: 'SAR' },
        savingsRateBasisPoints: 6_000,
        transactionCount: 2
      }
    ],
    breakdowns: [
      {
        categoryId: '99000000-0000-4000-8000-000000000001',
        labelAr: 'طعام',
        labelEn: 'Food',
        currencyCode: 'SAR',
        expenseMinor: 4_000,
        transactionCount: 1
      }
    ]
  };
}

function service(request: jest.Mock) {
  return createLiveReportsService({
    baseUrl: 'https://api.example.test',
    token: async () => 'owner-token',
    request
  });
}

describe('live reports strict mapping', () => {
  it('sends the exact anchor and validates the server-owned range and timezone', async () => {
    const request = jest.fn().mockResolvedValue(json(summary()));
    const reports = service(request);

    await expect(reports.getReport(input)).resolves.toMatchObject({
      period: {
        anchorDate: '2026-08-17',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        timeZone: 'Asia/Riyadh'
      },
      dataState: 'partial',
      completenessReasons: ['unsupported_by_server'],
      summary: {
        income: { status: 'available', value: { minorUnits: 10_000 } },
        obligationPayments: {
          status: 'unavailable',
          reason: 'unsupported_by_server'
        },
        largestTransaction: {
          status: 'unavailable',
          reason: 'unsupported_by_server'
        }
      },
      breakdowns: [
        {
          dimension: 'category',
          items: [{ id: '99000000-0000-4000-8000-000000000001' }]
        }
      ]
    });
    expect(String(request.mock.calls[0]?.[0])).toContain(
      'period=monthly&anchorDate=2026-08-17&currency=SAR'
    );

    await expect(
      reports.getReport({ ...input, accountIds: ['account-1'] })
    ).rejects.toEqual(new ReportsApiError('report_account_scope_unavailable'));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('preserves partial source state and rejects mismatched or unknown response data', async () => {
    const partial = service(
      jest.fn().mockResolvedValue(json(summary('partial')))
    );
    await expect(partial.getReport(input)).resolves.toMatchObject({
      dataState: 'partial',
      completenessReasons: expect.arrayContaining([
        'source_incomplete',
        'unsupported_by_server'
      ]),
      summary: {
        income: {
          status: 'incomplete',
          value: { minorUnits: 10_000 },
          reasons: ['source_incomplete']
        }
      }
    });

    const wrongZone = summary();
    wrongZone.metadata.range.timezone = 'UTC';
    await expect(
      service(jest.fn().mockResolvedValue(json(wrongZone))).getReport(input)
    ).rejects.toMatchObject({ code: 'report_timezone_unavailable' });

    const unknown = { ...summary(), extra: true };
    await expect(
      service(jest.fn().mockResolvedValue(json(unknown))).getReport(input)
    ).rejects.toMatchObject({ code: 'contract_mismatch' });

    await expect(
      service(
        jest.fn().mockResolvedValue(new Response('not-json', { status: 200 }))
      ).getReport(input)
    ).rejects.toMatchObject({ code: 'contract_mismatch' });
  });

  it('makes unsupported breakdown and schedule settings explicit while keeping drafts local', async () => {
    const repository = new ReportsRepository(false);
    const request = jest.fn().mockResolvedValue(json(summary()));
    const reports = createLiveReportsService({
      baseUrl: 'https://api.example.test',
      token: async () => 'owner-token',
      request,
      repository
    });
    await expect(
      reports.getBreakdown({ ...input, dimension: 'merchant' })
    ).rejects.toMatchObject({ code: 'report_dimension_unavailable' });
    await expect(
      reports.saveSchedule(
        {
          recipientEmail: 'owner@example.test',
          frequency: 'monthly',
          language: 'en',
          currencyCode: 'SAR',
          deliveryDay: 7,
          timeZone: 'Asia/Riyadh',
          includeAssistantSummary: true,
          detailLevel: 'detailed'
        },
        null,
        'schedule-key'
      )
    ).rejects.toMatchObject({ code: 'report_schedule_settings_unavailable' });

    const draft = {
      id: 'report_schedule' as const,
      payload: {
        recipientEmail: 'owner@example.test',
        frequency: 'monthly' as const,
        language: 'en' as const,
        currencyCode: 'SAR',
        deliveryDay: 7,
        timeZone: 'Asia/Riyadh',
        includeAssistantSummary: true,
        detailLevel: 'detailed' as const
      },
      baseVersion: null,
      status: 'editing' as const,
      updatedAt: 1
    };
    await reports.saveScheduleDraft(draft);
    await expect(reports.loadScheduleDraft()).resolves.toEqual(draft);
  });

  it('keeps delivery server-owned and fails closed for cold other-device attempts', async () => {
    const request = jest.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = String(url);
        if (path.includes('/reports/summary')) return json(summary());
        if (path.endsWith('/reports') && init?.method === 'POST')
          return json(
            {
              attemptId: '99000000-0000-4000-8000-000000000002',
              status: 'queued',
              ledgerVersion: 7,
              schemaVersion: 1,
              generatedAt
            },
            202
          );
        if (path.includes('/reports?'))
          return json({
            items: [
              {
                id: '99000000-0000-4000-8000-000000000003',
                reportType: 'financial_summary',
                format: 'pdf',
                delivery: 'email',
                status: 'delivered',
                metadata: {},
                requestedAt: generatedAt,
                expiresAt: '2026-09-05T00:00:00.000Z'
              }
            ],
            nextCursor: null
          });
        throw new Error(`unexpected:${path}`);
      }
    );
    const reports = service(request);
    const preview = await reports.previewOutput({
      ...input,
      language: 'en',
      detailLevel: 'summary'
    });
    await expect(
      reports.requestOutput(
        { kind: 'send_now', previewId: preview.previewId },
        'output-key'
      )
    ).resolves.toMatchObject({
      value: {
        id: '99000000-0000-4000-8000-000000000002',
        status: 'scheduled'
      }
    });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toMatchObject({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      delivery: 'email'
    });

    const cold = service(
      jest.fn().mockResolvedValue(
        json({
          items: [
            {
              id: '99000000-0000-4000-8000-000000000003',
              reportType: 'financial_summary',
              format: 'pdf',
              delivery: 'email',
              status: 'delivered',
              metadata: {},
              requestedAt: generatedAt,
              expiresAt: '2026-09-05T00:00:00.000Z'
            }
          ],
          nextCursor: null
        })
      )
    );
    await expect(cold.listAttempts()).rejects.toMatchObject({
      code: 'report_snapshot_unavailable'
    });
  });
});
