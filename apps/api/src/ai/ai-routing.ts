export const ASSISTANT_INTENTS = [
  'spending_summary',
  'income_summary',
  'category_breakdown',
  'budget_status',
  'savings_status',
  'obligations_status',
  'upcoming_obligations',
  'salary_status',
  'period_comparison',
  'recent_transactions',
  'transaction_search',
  'financial_health',
  'financial_advice',
  'purchase_affordability',
  'general_finance',
  'create_transaction',
  'update_transaction',
  'update_budget',
  'create_savings_goal',
  'record_obligation_payment',
  'resolve_tracking_review',
  'unsupported',
  'unrelated',
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];
export type AssistantTurn = {
  role: 'user' | 'assistant';
  content: string;
  intent: string | null;
};

export type FinancialTool =
  | 'reports.monthly_summary'
  | 'reports.category_spending'
  | 'planning.current_summary'
  | 'reports.period_comparison'
  | 'ledger.recent_transactions'
  | 'planning.purchase_affordability';

export interface AssistantRoute {
  intent: AssistantIntent;
  execution: 'deterministic' | 'provider';
  financialTools: FinancialTool[];
}

const DETERMINISTIC_TOOLS: Partial<Record<AssistantIntent, FinancialTool[]>> = {
  spending_summary: ['reports.monthly_summary'],
  income_summary: ['reports.monthly_summary'],
  category_breakdown: ['reports.category_spending'],
  budget_status: ['planning.current_summary'],
  savings_status: ['planning.current_summary'],
  obligations_status: ['planning.current_summary'],
  upcoming_obligations: ['planning.current_summary'],
  salary_status: ['planning.current_summary'],
  recent_transactions: ['ledger.recent_transactions'],
};

const PROVIDER_TOOLS: Partial<Record<AssistantIntent, FinancialTool[]>> = {
  period_comparison: ['reports.period_comparison'],
  transaction_search: ['ledger.recent_transactions'],
  financial_health: ['reports.monthly_summary', 'planning.current_summary'],
  financial_advice: ['reports.monthly_summary', 'planning.current_summary'],
  purchase_affordability: ['planning.purchase_affordability'],
  create_transaction: ['ledger.recent_transactions'],
  update_transaction: ['ledger.recent_transactions'],
  update_budget: ['planning.current_summary'],
  create_savings_goal: ['planning.current_summary'],
  record_obligation_payment: ['planning.current_summary'],
  resolve_tracking_review: [],
};

const RULES: Array<[RegExp, AssistantIntent]> = [
  [/(?:اكتب|write).*(?:كود|code|قصة|story|بوست|post)|(?:ترجم|translate)|(?:ماتش|match|رياضة|sports)|(?:لابتوب|laptop)/iu, 'unrelated'],
  [/(?:تضخم|inflation|فائدة مركبة|compound interest)/iu, 'general_finance'],
  [/(?:عد(?:ل|لّ)|غي(?:ر|رّ)|update).*(?:معامل|transaction)/iu, 'update_transaction'],
  [/(?:أنشئ|انشئ|create|add).*(?:هدف).*(?:ادخار|توفير|saving)/iu, 'create_savings_goal'],
  [/(?:سجل|سجّل|record).*(?:دفعة|payment).*(?:التزام|obligation)/iu, 'record_obligation_payment'],
  [/(?:اعتمد|حل|resolve).*(?:مراجعة|review).*(?:تتبع|tracking)/iu, 'resolve_tracking_review'],
  [/(?:خل.?[يى]|عد(?:ل|لّ)|غي(?:ر|رّ)).*(?:ميزاني|budget)/iu, 'update_budget'],
  [/(?:سجل|اضف|أضف|create|add).*(?:مصروف|دخل|transaction)/iu, 'create_transaction'],
  [/(?:اشتريت|اشتري|شراء|afford|buy).*(?:هل|ميزاني|budget|ضغط)/iu, 'purchase_affordability'],
  [/(?:ليه|لماذا|why|مقارن|compare|زاد|انخفض).*(?:صرف|مصروف|spend)|(?:الشهر اللي قبله|previous month)/iu, 'period_comparison'],
  [/(?:أعلى|اكبر|أكبر|فئة|category).*(?:صرف|مصروف|spend)|(?:صرف|spend).*(?:فئة|category)/iu, 'category_breakdown'],
  [/(?:باقي|متبقي|remaining|status).*(?:ميزاني|budget)|(?:ميزاني|budget).*(?:باقي|متبقي|status)/iu, 'budget_status'],
  [/(?:التزام|التزامات|obligation|فاتور).*(?:جاي|قادم|upcoming|due)/iu, 'upcoming_obligations'],
  [/(?:التزام|التزامات|obligation|debt)/iu, 'obligations_status'],
  [/(?:ادخار|توفير|savings|goal)/iu, 'savings_status'],
  [/(?:راتب|salary)/iu, 'salary_status'],
  [/(?:دخل|income|كسبت)/iu, 'income_summary'],
  [/(?:صرف|مصروف|أنفقت|انفقت|spend|expense)/iu, 'spending_summary'],
  [/(?:ميزاني|ادخار|مالي|فلوس|money|finance|budget|saving)/iu, 'financial_advice'],
];

export function selectConversationHistory(turns: readonly AssistantTurn[]): AssistantTurn[] {
  return turns.filter(({ intent }) => intent !== 'unrelated').slice(-4);
}

export function routeAssistantMessage(input: {
  content: string;
  intentHint?: AssistantIntent;
  recentTurns?: readonly AssistantTurn[];
}): AssistantRoute {
  const history = selectConversationHistory(input.recentTurns ?? []);
  const intent = input.intentHint ?? inferredIntent(input.content, history);
  const deterministicTools = DETERMINISTIC_TOOLS[intent];
  if (deterministicTools)
    return { intent, execution: 'deterministic', financialTools: deterministicTools };
  if (intent === 'unrelated' || intent === 'unsupported')
    return { intent, execution: 'deterministic', financialTools: [] };
  return { intent, execution: 'provider', financialTools: PROVIDER_TOOLS[intent] ?? [] };
}

function inferredIntent(content: string, history: readonly AssistantTurn[]): AssistantIntent {
  const normalized = content
    .normalize('NFKC')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, '')
    .trim()
    .toLowerCase();
  if (/(?:الشهر اللي قبله|previous month)/iu.test(normalized) && history.length > 0)
    return 'period_comparison';
  return RULES.find(([pattern]) => pattern.test(normalized))?.[1] ?? 'unsupported';
}
