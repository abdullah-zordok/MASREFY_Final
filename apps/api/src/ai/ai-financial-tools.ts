import { HttpException, Injectable } from '@nestjs/common';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { LedgerService } from '../ledger/ledger.service';
import { PlanningService } from '../planning/planning.service';
import { ReportsService } from '../reports/reports.service';
import type { ReportsSummaryResponse } from '../reports/reports.repository';
import type { AssistantIntent } from './ai-routing';

export interface FinancialToolResult {
  answer: string | null;
  context: Record<string, unknown>;
  evidence: Array<{ kind: string; version: number; asOf?: string }>;
}

@Injectable()
export class AssistantFinancialTools {
  constructor(
    private readonly reports: ReportsService,
    private readonly planning: PlanningService,
    private readonly ledger: LedgerService,
  ) {}

  async resolve(
    principal: ClerkPrincipal,
    intent: AssistantIntent,
    question: string,
    requestId: string,
  ): Promise<FinancialToolResult> {
    if (['spending_summary', 'income_summary', 'category_breakdown'].includes(intent))
      return this.reportResult(principal, intent, question, requestId);
    if (
      [
        'budget_status',
        'savings_status',
        'obligations_status',
        'upcoming_obligations',
        'salary_status',
      ].includes(intent)
    )
      return this.planningResult(principal, intent, question, requestId);
    if (intent === 'purchase_affordability')
      return this.affordabilityResult(principal, question, requestId);
    if (intent === 'recent_transactions' || intent === 'transaction_search')
      return this.transactionResult(principal, requestId);
    if (intent === 'general_finance' || intent === 'resolve_tracking_review') return emptyResult();
    return this.reasoningResult(principal, intent, requestId);
  }

  private async reportResult(
    principal: ClerkPrincipal,
    intent: AssistantIntent,
    question: string,
    requestId: string,
  ): Promise<FinancialToolResult> {
    const report = await this.monthlyReport(principal, requestId);
    const summary = report.summaries[0];
    if (!summary) return unavailableResult();
    if (intent === 'category_breakdown') return categoryResult(report, question);
    const amount = intent === 'income_summary' ? summary.income : summary.expense;
    const noun = intent === 'income_summary' ? 'دخلك' : 'صرفت';
    return {
      answer: `${noun} ${money(amount.amountMinor)} ${currencyLabel(amount.currency)} هذا الشهر.`,
      context: {
        [intent === 'income_summary' ? 'monthlyIncomeMinor' : 'monthlySpendingMinor']:
          amount.amountMinor,
        currency: amount.currency,
      },
      evidence: report.metadata.evidence,
    };
  }

  private async planningResult(
    principal: ClerkPrincipal,
    intent: AssistantIntent,
    question: string,
    requestId: string,
  ): Promise<FinancialToolResult> {
    const summary = planningRecord(
      await this.planning.getPlanningSummary(principal, { period: currentMonth() }, requestId),
    );
    if (intent === 'budget_status') return budgetResult(summary, question);
    if (intent === 'savings_status') return savingsResult(summary);
    if (intent === 'salary_status') return salaryResult(summary);
    return obligationResult(summary);
  }

  private async affordabilityResult(
    principal: ClerkPrincipal,
    question: string,
    requestId: string,
  ): Promise<FinancialToolResult> {
    const price = priceMinor(question);
    if (price === null) return unavailableResult();
    const summary = planningRecord(
      await this.planning.getPlanningSummary(principal, { period: currentMonth() }, requestId),
    );
    const salary = record(summary.salary);
    const income = minor(salary.actualIncomeMinor);
    const expense = minor(salary.actualExpenseMinor);
    const obligations = minor(salary.reservedObligationMinor);
    return {
      answer: null,
      context: {
        purchasePriceMinor: price,
        availableAfterObligationsMinor: income - expense - obligations,
        currency: text(salary.currencyCode, 'SAR'),
      },
      evidence: planningEvidence(summary),
    };
  }

  private async transactionResult(
    principal: ClerkPrincipal,
    requestId: string,
  ): Promise<FinancialToolResult> {
    const response = record(
      await this.ledger.listTransactions(
        principal,
        { limit: 10, kind: undefined, status: 'confirmed' },
        requestId,
      ),
    );
    const items = Array.isArray(response.items) ? response.items : [];
    return {
      answer:
        items.length === 0
          ? 'لا توجد معاملات حديثة مؤكدة.'
          : `لديك ${items.length.toString()} معاملات حديثة مؤكدة.`,
      context: { recentTransactions: items },
      evidence: [{ kind: 'ledger', version: Number(response.ledgerVersion ?? 0) }],
    };
  }

  private async reasoningResult(
    principal: ClerkPrincipal,
    intent: AssistantIntent,
    requestId: string,
  ): Promise<FinancialToolResult> {
    const report = await this.monthlyReport(principal, requestId);
    if (intent === 'period_comparison') {
      const previous = await this.reports.getReportSummary(
        principal,
        {
          type: 'category_spending',
          period: 'monthly',
          anchorDate: previousMonth(),
          currency: null,
        },
        requestId,
      );
      return {
        answer: null,
        context: { current: compactReport(report), previous: compactReport(previous) },
        evidence: report.metadata.evidence,
      };
    }
    const planning = planningRecord(
      await this.planning.getPlanningSummary(principal, { period: currentMonth() }, requestId),
    );
    return {
      answer: null,
      context: { report: compactReport(report), planning: compactPlanning(planning) },
      evidence: report.metadata.evidence,
    };
  }

  private async monthlyReport(principal: ClerkPrincipal, requestId: string) {
    return (await this.reports.getReportSummary(
      principal,
      { type: 'category_spending', period: 'monthly', anchorDate: null, currency: null },
      requestId,
    )) as ReportsSummaryResponse;
  }
}

function categoryResult(report: ReportsSummaryResponse, question: string): FinancialToolResult {
  const category =
    report.breakdowns.find(
      ({ labelAr, labelEn }) =>
        question.toLowerCase().includes(labelAr.toLowerCase()) ||
        question.toLowerCase().includes(labelEn.toLowerCase()),
    ) ?? report.breakdowns[0];
  if (!category) return unavailableResult();
  return {
    answer: `صرفك في ${category.labelAr} هو ${money(category.expenseMinor)} ${currencyLabel(category.currencyCode)} هذا الشهر.`,
    context: {
      category: {
        label: category.labelAr,
        expenseMinor: category.expenseMinor,
        currency: category.currencyCode,
      },
    },
    evidence: report.metadata.evidence,
  };
}

function budgetResult(summary: Record<string, unknown>, question: string): FinancialToolResult {
  const budgets = records(summary.budgets);
  const selected = budgets.find(({ name }) => question.includes(String(name))) ?? budgets[0];
  if (!selected) return unavailableResult();
  const remaining = minor(selected.remainingMinor);
  const currency = String(selected.currencyCode);
  return {
    answer: `باقي لك ${money(remaining)} ${currencyLabel(currency)} من ميزانية ${String(selected.name)}.`,
    context: { budgets: [{ name: selected.name, remainingMinor: remaining, currency }] },
    evidence: planningEvidence(summary),
  };
}

function savingsResult(summary: Record<string, unknown>): FinancialToolResult {
  const goals = records(summary.savings);
  const goal = goals[0];
  if (!goal) return unavailableResult();
  const currency = String(goal.currencyCode);
  return {
    answer: `ادخرت ${money(minor(goal.progressMinor))} ${currencyLabel(currency)} من هدف بقيمة ${money(minor(goal.targetMinor))} ${currencyLabel(currency)}.`,
    context: { savings: goals.map(compactSavings) },
    evidence: planningEvidence(summary),
  };
}

function salaryResult(summary: Record<string, unknown>): FinancialToolResult {
  const salary = record(summary.salary);
  if (Object.keys(salary).length === 0) return unavailableResult();
  const currency = String(salary.currencyCode);
  const income = minor(salary.actualIncomeMinor);
  return {
    answer: `دخلك المؤكد هذا الشهر ${money(income)} ${currencyLabel(currency)}.`,
    context: { salary: { actualIncomeMinor: income, currency } },
    evidence: planningEvidence(summary),
  };
}

function obligationResult(summary: Record<string, unknown>): FinancialToolResult {
  const payables = records(record(summary.obligations).payables);
  const total = payables.reduce((sum, item) => sum + minor(item.remainingMinor), 0);
  const currency = text(payables[0]?.currencyCode, 'SAR');
  const count = payables.length;
  return {
    answer: `عندك ${count === 1 ? 'التزام واحد' : `${count.toString()} التزامات`} قادم بإجمالي ${money(total)} ${currencyLabel(currency)}.`,
    context: { count, totalMinor: total, currency },
    evidence: planningEvidence(summary),
  };
}

function compactReport(value: unknown) {
  const report = value as ReportsSummaryResponse;
  return { summaries: report.summaries, categories: report.breakdowns };
}

function compactPlanning(value: Record<string, unknown>) {
  return {
    salary: value.salary,
    budgets: value.budgets,
    obligations: value.obligations,
    savings: value.savings,
  };
}

function compactSavings(value: Record<string, unknown>) {
  return {
    name: value.name,
    targetMinor: minor(value.targetMinor),
    progressMinor: minor(value.progressMinor),
    remainingMinor: minor(value.remainingMinor),
    currency: value.currencyCode,
  };
}

function planningEvidence(summary: Record<string, unknown>) {
  return [{ kind: 'report', version: Number(summary.ledgerVersion ?? 0) }];
}

function planningRecord(value: unknown): Record<string, unknown> {
  const result = record(value);
  if (result.dataState === 'partial')
    throw new HttpException({ code: 'AI_EVIDENCE_INCOMPLETE' }, 409);
  return result;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function minor(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed))
    throw new HttpException({ code: 'AI_EVIDENCE_INCOMPLETE' }, 409);
  return parsed;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function priceMinor(question: string): number | null {
  const latin = question.replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const match = latin.replace(/,/gu, '').match(/(?:بـ|ب|for|price)?\s*(\d+(?:\.\d{1,2})?)/iu);
  if (!match) return null;
  const value = Math.round(Number(match[1]) * 100);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function previousMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15))
    .toISOString()
    .slice(0, 10);
}

function money(amountMinor: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amountMinor / 100);
}

function currencyLabel(currency: string): string {
  return currency === 'SAR' ? 'ريال' : currency;
}

function emptyResult(): FinancialToolResult {
  return { answer: null, context: {}, evidence: [] };
}

function unavailableResult(): FinancialToolResult {
  return {
    answer: 'ما قدرت أجيب بيانات كافية للإجابة بدقة حاليًا.',
    context: {},
    evidence: [],
  };
}
