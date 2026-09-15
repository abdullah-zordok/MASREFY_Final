import { AssistantFinancialTools } from '../../../src/ai/ai-financial-tools';

const owner = { userId: 'owner', sessionId: 'session', factorAgeSeconds: 0 };
const report = {
  metadata: {
    generatedAt: '2026-09-15T00:00:00.000Z',
    ledgerVersion: 12,
    range: { startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'Asia/Riyadh' },
    dataState: 'complete',
    evidence: [{ kind: 'ledger', version: 12, asOf: '2026-09-15T00:00:00.000Z' }],
  },
  summaries: [
    {
      income: { amountMinor: 800_000, currency: 'SAR' },
      expense: { amountMinor: 235_000, currency: 'SAR' },
      netCashFlow: { amountMinor: 565_000, currency: 'SAR' },
      savingsRateBasisPoints: 7062,
      transactionCount: 14,
    },
  ],
  breakdowns: [
    {
      categoryId: 'category-id',
      labelAr: 'المطاعم',
      labelEn: 'Restaurants',
      currencyCode: 'SAR',
      expenseMinor: 130_000,
      transactionCount: 4,
    },
  ],
};
const planning = {
  period: '2026-09',
  dataState: 'ready',
  ledgerVersion: 12,
  salary: {
    currencyCode: 'SAR',
    actualIncomeMinor: '800000',
    actualExpenseMinor: '235000',
    reservedObligationMinor: '245000',
  },
  budgets: [
    { name: 'المطاعم', currencyCode: 'SAR', totalMinor: '172000', spentMinor: '130000', remainingMinor: '42000' },
  ],
  obligations: {
    payables: [{ name: 'إيجار', currencyCode: 'SAR', remainingMinor: '245000', nextDueAt: '2026-09-20T00:00:00.000Z' }],
    receivables: [],
  },
  savings: [{ name: 'طوارئ', currencyCode: 'SAR', targetMinor: '1000000', progressMinor: '300000', remainingMinor: '700000' }],
};

describe('AssistantFinancialTools', () => {
  const reports = { getReportSummary: jest.fn(() => Promise.resolve(report)) };
  const planningService = { getPlanningSummary: jest.fn(() => Promise.resolve(planning)) };
  const ledger = { listTransactions: jest.fn(() => Promise.resolve({ items: [] })) };
  const tools = new AssistantFinancialTools(reports as never, planningService as never, ledger as never);

  beforeEach(() => jest.clearAllMocks());

  it('answers monthly spending from the Reports owner result', async () => {
    await expect(
      tools.resolve(owner, 'spending_summary', 'صرفي كام الشهر ده؟', 'request-id'),
    ).resolves.toMatchObject({
      answer: 'صرفت 2,350 ريال هذا الشهر.',
      context: { monthlySpendingMinor: 235_000, currency: 'SAR' },
      evidence: [{ kind: 'ledger', version: 12 }],
    });
  });

  it('answers budget remaining from the Planning owner result', async () => {
    await expect(
      tools.resolve(owner, 'budget_status', 'كم باقي من ميزانية المطاعم؟', 'request-id'),
    ).resolves.toMatchObject({
      answer: 'باقي لك 420 ريال من ميزانية المطاعم.',
      context: { budgets: [{ remainingMinor: 42_000 }] },
    });
  });

  it('answers upcoming obligations without provider arithmetic', async () => {
    await expect(
      tools.resolve(owner, 'upcoming_obligations', 'كم عندي التزامات جاية؟', 'request-id'),
    ).resolves.toMatchObject({
      answer: 'عندك التزام واحد قادم بإجمالي 2,450 ريال.',
      context: { count: 1, totalMinor: 245_000, currency: 'SAR' },
    });
  });

  it('answers salary and savings status from Planning owner values', async () => {
    await expect(
      tools.resolve(owner, 'salary_status', 'كم راتبي هذا الشهر؟', 'request-id'),
    ).resolves.toMatchObject({ answer: 'دخلك المؤكد هذا الشهر 8,000 ريال.' });
    await expect(
      tools.resolve(owner, 'savings_status', 'كيف ادخاري؟', 'request-id'),
    ).resolves.toMatchObject({ answer: 'ادخرت 3,000 ريال من هدف بقيمة 10,000 ريال.' });
  });

  it('builds purchase affordability truth from Reports and Planning owners', async () => {
    await expect(
      tools.resolve(owner, 'purchase_affordability', 'هل أقدر أشتري جوال بـ5000 ريال؟', 'request-id'),
    ).resolves.toMatchObject({
      answer: null,
      context: {
        purchasePriceMinor: 500_000,
        availableAfterObligationsMinor: 320_000,
        currency: 'SAR',
      },
    });
  });

  it('answers an empty recent-transaction quick question deterministically', async () => {
    await expect(
      tools.resolve(owner, 'recent_transactions', 'آخر معاملاتي', 'request-id'),
    ).resolves.toMatchObject({
      answer: 'لا توجد معاملات حديثة مؤكدة.',
      context: { recentTransactions: [] },
    });
  });
});
