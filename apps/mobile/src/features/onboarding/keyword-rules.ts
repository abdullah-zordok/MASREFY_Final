import type { KeywordRule } from '@/domain/app-shell';

export type KeywordChange =
  | { rules: KeywordRule[]; error?: never; warning?: never }
  | { rules: KeywordRule[]; error: 'empty' | 'duplicate'; warning?: never }
  | { rules: KeywordRule[]; warning: 'last_enabled'; error?: never };

export type KeywordRuleSummary = KeywordRule & {
  recentUseCount: number;
  lastUsedAt: number | null;
};

export function normalizeKeyword(value: string, language: KeywordRule['language']): string {
  return value.trim().toLocaleLowerCase(language);
}

export function addKeywordRule(
  rules: KeywordRule[],
  input: Pick<KeywordRule, 'group' | 'language' | 'value'>
): KeywordChange {
  const normalizedValue = normalizeKeyword(input.value, input.language);
  if (!normalizedValue) return { rules, error: 'empty' };
  if (
    rules.some(
      (rule) =>
        rule.group === input.group &&
        rule.language === input.language &&
        rule.normalizedValue === normalizedValue
    )
  ) {
    return { rules, error: 'duplicate' };
  }
  return {
    rules: [
      ...rules,
      {
        id: `${input.group}-${input.language}-${normalizedValue}`,
        group: input.group,
        language: input.language,
        value: input.value.trim(),
        normalizedValue,
        origin: 'custom',
        enabled: true
      }
    ]
  };
}

export function deleteKeywordRule(rules: KeywordRule[], id: string): KeywordRule[] {
  return rules.filter((rule) => rule.id !== id || rule.origin === 'default');
}

export function editKeywordRule(
  rules: KeywordRule[],
  id: string,
  value: string
): KeywordChange {
  const target = rules.find((rule) => rule.id === id);
  if (!target) return { rules };
  const normalizedValue = normalizeKeyword(value, target.language);
  if (!normalizedValue) return { rules, error: 'empty' };
  const duplicate = rules.some(
    (rule) =>
      rule.id !== id &&
      rule.group === target.group &&
      rule.language === target.language &&
      rule.normalizedValue === normalizedValue
  );
  if (duplicate) return { rules, error: 'duplicate' };
  return {
    rules: rules.map((rule) =>
      rule.id === id ? { ...rule, value: value.trim(), normalizedValue } : rule
    )
  };
}

export function disableKeywordRule(rules: KeywordRule[], id: string): KeywordChange {
  const target = rules.find((rule) => rule.id === id);
  if (!target) return { rules };
  const enabledPeers = rules.filter(
    (rule) =>
      rule.group === target.group &&
      rule.language === target.language &&
      rule.enabled
  );
  if (enabledPeers.length <= 1) return { rules, warning: 'last_enabled' };
  return {
    rules: rules.map((rule) =>
      rule.id === id ? { ...rule, enabled: false } : rule
    )
  };
}

export function restoreDefaultKeywordRules(rules: KeywordRule[]): KeywordRule[] {
  return rules.map((rule) =>
    rule.origin === 'default' ? { ...rule, enabled: true } : rule
  );
}

export function deriveKeywordRuleSummaries(
  rules: KeywordRule[],
  recentUseByRuleId: Record<string, { count: number; lastUsedAt: number | null }> = {}
): KeywordRuleSummary[] {
  return rules.map((rule) => ({
    ...rule,
    recentUseCount: recentUseByRuleId[rule.id]?.count ?? 0,
    lastUsedAt: recentUseByRuleId[rule.id]?.lastUsedAt ?? null
  }));
}
