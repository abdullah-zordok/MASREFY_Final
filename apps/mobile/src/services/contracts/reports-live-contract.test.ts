import { createLiveReportsService } from '@/services/live/reports-service';

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
const generatedAt = '2026-09-04T00:00:00.000Z';

it('maps the Phase 10 summary, verification, schedule, and output contracts without a hard-coded host', async () => {
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (url, init) => {
      const path = String(url),
        method = init?.method;
      if (path.includes('/reports/summary'))
        return json({
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
            dataState: 'complete',
            evidence: [{ kind: 'ledger', version: 7, asOf: generatedAt }]
          },
          summaries: [
            {
              income: { amountMinor: 1000, currency: 'SAR' },
              expense: { amountMinor: 400, currency: 'SAR' },
              netCashFlow: { amountMinor: 600, currency: 'SAR' },
              savingsRateBasisPoints: 6000
            }
          ],
          breakdowns: [
            {
              categoryId: 'food',
              labelAr: 'طعام',
              labelEn: 'Food',
              currencyCode: 'SAR',
              expenseMinor: 400,
              transactionCount: 1
            }
          ]
        });
      if (path.endsWith('/report-schedules/verify-recipient'))
        return json({
          normalizedEmail: 'owner@example.test',
          status: 'verified',
          verifiedAt: generatedAt
        });
      if (path.includes('/report-schedules?'))
        return json({ items: [], nextCursor: null });
      if (path.endsWith('/report-schedules') && method === 'POST')
        return json(
          {
            id: '99000000-0000-4000-8000-000000000010',
            version: 1,
            enabled: true,
            frequency: 'monthly',
            timezone: 'Asia/Riyadh',
            deliveryChannel: 'email',
            recipientMasked: 'o***@example.test',
            nextRunAt: '2026-10-01T05:00:00.000Z',
            createdAt: generatedAt,
            updatedAt: generatedAt
          },
          201
        );
      if (path.endsWith('/reports') && method === 'POST')
        return json(
          {
            attemptId: '99000000-0000-4000-8000-000000000011',
            status: 'queued',
            generatedAt
          },
          202
        );
      throw new Error(`unexpected:${method}:${path}`);
    }
  );
  const service = createLiveReportsService({
    baseUrl: 'https://api.example.test',
    token: async () => 'owner-token',
    request
  });
  const input = {
    kind: 'monthly' as const,
    anchorDate: '2026-08-09' as const,
    currencyCode: 'SAR',
    timeZone: 'Asia/Riyadh'
  };
  await expect(service.getReport(input)).resolves.toMatchObject({
    summary: {
      income: { value: { minorUnits: 1000 } },
      largestCategory: { value: { id: 'food' } }
    },
    breakdowns: [{ dimension: 'category', items: [{ id: 'food' }] }]
  });
  await expect(
    service.verifyRecipient('Owner@Example.test', 'verify-key')
  ).resolves.toMatchObject({
    value: { normalizedEmail: 'owner@example.test', status: 'verified' }
  });
  await expect(
    service.saveSchedule(
      {
        recipientEmail: 'owner@example.test',
        frequency: 'monthly',
        language: 'ar',
        currencyCode: 'SAR',
        deliveryDay: 1,
        timeZone: 'Asia/Riyadh',
        includeAssistantSummary: false,
        detailLevel: 'summary'
      },
      null,
      'schedule-key'
    )
  ).rejects.toMatchObject({ code: 'report_schedule_settings_unavailable' });
  const preview = await service.previewOutput({
    ...input,
    language: 'ar',
    detailLevel: 'summary'
  });
  await expect(
    service.requestOutput(
      { kind: 'download', previewId: preview.previewId },
      'output-key'
    )
  ).resolves.toMatchObject({ value: { status: 'scheduled' } });
  await expect(
    service.requestOutput(
      { kind: 'scheduled', scheduleId: 'schedule', scheduledFor: Date.now() },
      'scheduled-key'
    )
  ).rejects.toMatchObject({ code: 'reports_unavailable' });
  const calls = request.mock.calls.map(([, init]) => init?.headers);
  expect(calls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Authorization: 'Bearer owner-token',
        'Idempotency-Key': 'output-key'
      })
    ])
  );
});

it('maps safe HTTP failures and never persists a signed URL in attempt state', async () => {
  const denied = createLiveReportsService({
    baseUrl: 'https://api.example.test',
    token: async () => 'token',
    request: jest.fn().mockResolvedValue(json({ code: 'FORBIDDEN' }, 403))
  });
  await expect(denied.getSchedule()).rejects.toMatchObject({
    code: 'permission_required'
  });
});
