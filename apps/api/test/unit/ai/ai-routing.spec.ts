import {
  routeAssistantMessage,
  selectConversationHistory,
} from '../../../src/ai/ai-routing';

describe('assistant domain and intent routing', () => {
  it.each([
    ['اكتبلي كود React', 'unrelated'],
    ['مين كسب ماتش الهلال؟', 'unrelated'],
    ['اكتب قصة قصيرة', 'unrelated'],
  ] as const)('keeps unrelated request %s out of provider routing', (content, intent) => {
    expect(routeAssistantMessage({ content })).toMatchObject({
      intent,
      execution: 'deterministic',
      financialTools: [],
    });
  });

  it.each([
    ['صرفي كام الشهر ده؟', 'spending_summary', 'deterministic'],
    ['أعلى فئة صرف عندي إيه؟', 'category_breakdown', 'deterministic'],
    ['كم باقي من الميزانية؟', 'budget_status', 'deterministic'],
    ['ليه صرفي زاد عن الشهر الماضي؟', 'period_comparison', 'provider'],
    ['خلّي ميزانية المطاعم 1000 ريال', 'update_budget', 'provider'],
    ['عدّل معاملة المطعم إلى 80 ريال', 'update_transaction', 'provider'],
    ['أنشئ هدف ادخار للطوارئ', 'create_savings_goal', 'provider'],
    ['سجّل دفعة الالتزام', 'record_obligation_payment', 'provider'],
    ['اعتمد مراجعة التتبع', 'resolve_tracking_review', 'provider'],
  ] as const)('routes %s to %s', (content, intent, execution) => {
    expect(routeAssistantMessage({ content })).toMatchObject({ intent, execution });
  });

  it('uses trusted quick-question metadata independently of localized display text', () => {
    expect(
      routeAssistantMessage({
        content: 'Show me the number',
        intentHint: 'spending_summary',
      }),
    ).toMatchObject({
      intent: 'spending_summary',
      execution: 'deterministic',
      financialTools: ['reports.monthly_summary'],
    });
  });

  it('sends no personal financial tools for general finance', () => {
    expect(routeAssistantMessage({ content: 'يعني إيه تضخم؟' })).toEqual(
      expect.objectContaining({
        intent: 'general_finance',
        execution: 'provider',
        financialTools: [],
      }),
    );
  });

  it('resolves a previous-period follow-up from bounded conversation context', () => {
    expect(
      routeAssistantMessage({
        content: 'طب والشهر اللي قبله؟',
        recentTurns: [
          { role: 'user', content: 'صرفي كام الشهر ده؟', intent: 'spending_summary' },
          { role: 'assistant', content: 'صرفت 2,350 ريال هذا الشهر.', intent: null },
        ],
      }),
    ).toMatchObject({ intent: 'period_comparison', execution: 'provider' });
  });

  it('keeps only the four newest relevant turns', () => {
    const turns = Array.from({ length: 7 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `turn-${index.toString()}`,
      intent: index === 0 ? 'unrelated' : 'spending_summary',
    }));
    expect(selectConversationHistory(turns).map(({ content }) => content)).toEqual([
      'turn-3',
      'turn-4',
      'turn-5',
      'turn-6',
    ]);
  });
});
