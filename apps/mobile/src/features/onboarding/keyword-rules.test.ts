import {
  addKeywordRule,
  deleteKeywordRule,
  deriveKeywordRuleSummaries,
  disableKeywordRule,
  editKeywordRule,
  normalizeKeyword,
  restoreDefaultKeywordRules
} from './keyword-rules';
import type { KeywordRule } from '@/domain/app-shell';

const baseRule: KeywordRule = {
  id: 'expense-en-default',
  group: 'expense',
  language: 'en',
  value: 'Grocery',
  normalizedValue: 'grocery',
  origin: 'default',
  enabled: true
};

describe('keyword rules', () => {
  it('normalizes, rejects empty values, and rejects duplicates by group and language', () => {
    expect(normalizeKeyword('  Grocery  ', 'en')).toBe('grocery');

    expect(addKeywordRule([baseRule], {
      group: 'expense',
      language: 'en',
      value: ' '
    })).toMatchObject({ error: 'empty' });

    expect(addKeywordRule([baseRule], {
      group: 'expense',
      language: 'en',
      value: 'grocery'
    })).toMatchObject({ error: 'duplicate' });
  });

  it('adds custom rules and only deletes custom-origin rules', () => {
    const added = addKeywordRule([baseRule], {
      group: 'expense',
      language: 'en',
      value: 'Cafe'
    });

    expect(added.rules).toContainEqual(
      expect.objectContaining({
        group: 'expense',
        language: 'en',
        normalizedValue: 'cafe',
        origin: 'custom'
      })
    );
    expect(deleteKeywordRule(added.rules, 'expense-en-default')).toHaveLength(2);
    expect(deleteKeywordRule(added.rules, added.rules[1].id)).toHaveLength(1);
  });

  it('edits a rule while rejecting an empty or duplicate value', () => {
    const cafe = {
      ...baseRule,
      id: 'expense-en-cafe',
      value: 'Cafe',
      normalizedValue: 'cafe',
      origin: 'custom' as const
    };

    expect(
      editKeywordRule([baseRule, cafe], cafe.id, '  Coffee  ').rules[1]
    ).toMatchObject({ value: 'Coffee', normalizedValue: 'coffee' });
    expect(editKeywordRule([baseRule, cafe], cafe.id, ' ')).toMatchObject({
      error: 'empty'
    });
    expect(editKeywordRule([baseRule, cafe], cafe.id, 'grocery')).toMatchObject(
      { error: 'duplicate' }
    );
  });

  it('disables, warns on last enabled rule, and restores defaults', () => {
    const disabled = disableKeywordRule([baseRule], baseRule.id);
    expect(disabled).toMatchObject({ warning: 'last_enabled' });

    const second = { ...baseRule, id: 'expense-en-cafe', value: 'Cafe', normalizedValue: 'cafe' };
    expect(disableKeywordRule([baseRule, second], baseRule.id).rules[0]).toMatchObject({
      enabled: false
    });
    expect(restoreDefaultKeywordRules([{ ...baseRule, enabled: false }])[0]).toMatchObject({
      enabled: true
    });
  });

  it('derives recent use counts without storing a second rule state', () => {
    expect(
      deriveKeywordRuleSummaries([baseRule], {
        [baseRule.id]: { count: 3, lastUsedAt: 123 }
      })[0]
    ).toMatchObject({ recentUseCount: 3, lastUsedAt: 123 });
  });
});
