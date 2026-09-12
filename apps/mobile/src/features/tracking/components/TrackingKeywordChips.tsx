import React, { useState } from 'react';
import {
  PixelRatio,
  Pressable,
  StyleSheet,
  TextInput,
  View
} from 'react-native';

import { StyledText } from '@/components/StyledText';
import { DesignIcon } from '@/design-system/icons';
import type { KeywordRule } from '@/domain/app-shell';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import {
  addKeywordRule,
  deleteKeywordRule,
  editKeywordRule
} from '@/features/onboarding/keyword-rules';

export interface TrackingKeywordChipsProps {
  rules: KeywordRule[];
  onChange: (rules: KeywordRule[]) => void;
  onRestore: () => void;
  disabled?: boolean;
}

export function TrackingKeywordChips({
  rules,
  onChange,
  onRestore,
  disabled = false
}: TrackingKeywordChipsProps) {
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';
  const largeText = PixelRatio.getFontScale() >= 1.5;

  const [languageFilter, setLanguageFilter] = useState<'all' | 'ar' | 'en'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftLang, setDraftLang] = useState<'ar' | 'en'>(isRtl ? 'ar' : 'en');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKeyword, setEditKeyword] = useState('');

  const activeCount = rules.filter((r) => r.enabled).length;

  const visibleRules = rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (languageFilter === 'all') return true;
    return rule.language === languageFilter;
  });

  const handleAddSubmit = () => {
    if (!draftKeyword.trim()) return;
    const result = addKeywordRule(rules, {
      group: 'expense',
      language: draftLang,
      value: draftKeyword.trim()
    });

    if (result.error === 'duplicate') {
      setAddError(translate('appShell.tracking.keywords.duplicate'));
      return;
    }
    if (result.error === 'empty') {
      setAddError(translate('appShell.tracking.keywords.empty'));
      return;
    }

    setAddError(null);
    setDraftKeyword('');
    setIsAdding(false);
    onChange(result.rules);
  };

  const handleRemove = (rule: KeywordRule) => {
    if (disabled) return;
    onChange(deleteKeywordRule(rules, rule.id));
  };

  const submitKeywordEdit = (rule: KeywordRule) => {
    const keywordChange = editKeywordRule(rules, rule.id, editKeyword);
    if (keywordChange.error) {
      setAddError(
        translate(`appShell.tracking.keywords.${keywordChange.error}`)
      );
      return;
    }
    setAddError(null);
    setEditingId(null);
    onChange(keywordChange.rules);
  };

  const handleRestore = () => {
    if (disabled) return;
    onRestore();
  };

  return (
    <View style={[styles.container, { direction }]}>
      {/* Header: START = Title (Count) [Right in RTL, Left in LTR], END = Actions [Left in RTL, Right in LTR] */}
      <View
        testID="tracking-keyword-header"
        style={[
          styles.headerRow,
          largeText ? { alignItems: 'stretch', flexDirection: 'column' } : null
        ]}
      >
        {/* START: Title */}
        <StyledText
          variant="subtitle"
          style={[
            styles.titleText,
            { textAlign: isRtl ? 'right' : 'left' }
          ]}
        >
          {translate('tracking.keywords.sectionTitle')} ({activeCount})
        </StyledText>

        {/* END: Actions */}
        <View style={styles.actionsGroup}>
          {/* Add keyword toggle button */}
          <Pressable
            testID="tracking-add-keyword-toggle"
            onPress={() => {
              setIsAdding(!isAdding);
              setAddError(null);
            }}
            disabled={disabled}
            style={({ pressed }) => [
              styles.addKeywordButton,
              pressed && styles.buttonPressed
            ]}
            accessibilityLabel={translate('appShell.tracking.keywords.add')}
            accessibilityRole="button"
          >
            <DesignIcon
              name="add"
              size="sm"
              color={colorTokens.teal['700']}
              direction={direction}
              decorative
            />
            <StyledText style={styles.addKeywordText}>
              {translate('appShell.tracking.keywords.add')}
            </StyledText>
          </Pressable>

          {/* Restore defaults button */}
          <Pressable
            testID="tracking-restore-keywords-button"
            onPress={handleRestore}
            disabled={disabled}
            style={({ pressed }) => [
              styles.iconActionButton,
              pressed && styles.buttonPressed
            ]}
            accessibilityLabel={translate('appShell.tracking.keywords.restore')}
            accessibilityRole="button"
          >
            <DesignIcon
              name="sync"
              size="sm"
              color={colorTokens.teal['700']}
              direction={direction}
              decorative
            />
          </Pressable>
        </View>
      </View>

      {/* Short explanation */}
      <StyledText
        variant="caption"
        style={[
          styles.explanationText,
          {
            textAlign: isRtl ? 'right' : 'left',
            writingDirection: direction
          }
        ]}
      >
        {translate('tracking.keywords.explanation')}
      </StyledText>

      {/* Language filter pills: START = All, MIDDLE = Arabic, END = English */}
      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setLanguageFilter('all')}
          style={[
            styles.filterPill,
            languageFilter === 'all' && styles.filterPillActive
          ]}
          accessibilityRole="button"
        >
          <StyledText
            style={[
              styles.filterPillText,
              languageFilter === 'all' && styles.filterPillTextActive
            ]}
          >
            {translate('tracking.keywords.filterAll')}
          </StyledText>
        </Pressable>

        <Pressable
          onPress={() => setLanguageFilter('ar')}
          style={[
            styles.filterPill,
            languageFilter === 'ar' && styles.filterPillActive
          ]}
          accessibilityRole="button"
        >
          <StyledText
            style={[
              styles.filterPillText,
              languageFilter === 'ar' && styles.filterPillTextActive
            ]}
          >
            {translate('common.arabic')}
          </StyledText>
        </Pressable>

        <Pressable
          onPress={() => setLanguageFilter('en')}
          style={[
            styles.filterPill,
            languageFilter === 'en' && styles.filterPillActive
          ]}
          accessibilityRole="button"
        >
          <StyledText
            style={[
              styles.filterPillText,
              languageFilter === 'en' && styles.filterPillTextActive
            ]}
          >
            {translate('common.english')}
          </StyledText>
        </Pressable>
      </View>

      {/* Inline Add Form if expanded */}
      {isAdding && (
        <View style={styles.addCard}>
          <View style={styles.addInputRow}>
            {/* Input field */}
            <TextInput
              testID="tracking-new-keyword-input"
              value={draftKeyword}
              onChangeText={setDraftKeyword}
              placeholder={translate('appShell.tracking.keywords.draft')}
              placeholderTextColor={colorTokens.ink['500']}
              style={[
                styles.textInput,
                {
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: draftLang === 'ar' ? 'rtl' : 'ltr'
                }
              ]}
              returnKeyType="done"
              onSubmitEditing={handleAddSubmit}
              autoFocus
            />

            {/* Language toggle for new keyword */}
            <Pressable
              onPress={() => setDraftLang(draftLang === 'ar' ? 'en' : 'ar')}
              style={styles.langBadge}
              accessibilityRole="button"
            >
              <StyledText style={styles.langBadgeText}>
                {draftLang === 'ar' ? 'AR' : 'EN'}
              </StyledText>
            </Pressable>

            {/* Submit add button */}
            <Pressable
              testID="tracking-submit-add-keyword"
              onPress={handleAddSubmit}
              disabled={!draftKeyword.trim()}
              style={[
                styles.submitAddButton,
                !draftKeyword.trim() && styles.submitAddButtonDisabled
              ]}
              accessibilityRole="button"
            >
              <DesignIcon
                name="check"
                size="sm"
                color={colorTokens.surface.white}
                direction={direction}
                decorative
              />
            </Pressable>
          </View>
          {addError ? (
            <StyledText
              style={[
                styles.addErrorText,
                {
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {addError}
            </StyledText>
          ) : null}
        </View>
      )}

      {/* Keyword Chips Grid: wraps naturally in reading direction */}
      <View style={styles.chipsContainer}>
        {visibleRules.map((rule) => {
          const isArabicKeyword = rule.language === 'ar' || /[\u0600-\u06FF]/.test(rule.value);
          return (
            <View
              key={rule.id}
              testID={`tracking-keyword-chip-${rule.id}`}
              style={styles.chip}
            >
              {editingId === rule.id ? (
                <TextInput
                  testID={`tracking-keyword-edit-input-${rule.id}`}
                  value={editKeyword}
                  onChangeText={setEditKeyword}
                  onSubmitEditing={() => submitKeywordEdit(rule)}
                  autoFocus
                  style={styles.editInput}
                  accessibilityLabel={translate('trust.edit')}
                />
              ) : (
                <StyledText
                  style={[
                    styles.chipText,
                    {
                      writingDirection: isArabicKeyword ? 'rtl' : 'ltr',
                      textAlign: isArabicKeyword ? 'right' : 'left'
                    }
                  ]}
                >
                  {rule.value}
                </StyledText>
              )}

              <Pressable
                testID={
                  editingId === rule.id
                    ? `tracking-keyword-save-${rule.id}`
                    : `tracking-keyword-edit-${rule.id}`
                }
                onPress={() => {
                  if (editingId === rule.id) submitKeywordEdit(rule);
                  else {
                    setEditingId(rule.id);
                    setEditKeyword(rule.value);
                    setAddError(null);
                  }
                }}
                disabled={disabled}
                hitSlop={6}
                style={styles.chipRemoveButton}
                accessibilityLabel={translate(
                  editingId === rule.id ? 'tracking.action.save' : 'trust.edit'
                )}
                accessibilityRole="button"
              >
                <DesignIcon
                  name={editingId === rule.id ? 'check' : 'edit'}
                  size="xs"
                  color={colorTokens.ink['700']}
                  direction={direction}
                  decorative
                />
              </Pressable>

              {/* END: Remove button × */}
              <Pressable
                testID={
                  editingId === rule.id
                    ? `tracking-keyword-cancel-${rule.id}`
                    : `tracking-keyword-remove-${rule.id}`
                }
                onPress={() => {
                  if (editingId === rule.id) {
                    setEditingId(null);
                    setAddError(null);
                  } else handleRemove(rule);
                }}
                disabled={disabled}
                hitSlop={6}
                style={styles.chipRemoveButton}
                accessibilityLabel={
                  editingId === rule.id
                    ? translate('designSystem.action.cancel')
                    : translate('appShell.tracking.keywords.delete').replace(
                        '{{value}}',
                        rule.value
                      )
                }
                accessibilityRole="button"
              >
                <DesignIcon
                  name="close"
                  size="xs"
                  color={colorTokens.ink['700']}
                  direction={direction}
                  decorative
                />
              </Pressable>
            </View>
          );
        })}
      </View>
      {!isAdding && addError ? (
        <StyledText style={styles.addErrorText} accessibilityRole="alert">
          {addError}
        </StyledText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    width: '100%'
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  titleText: {
    color: colorTokens.ink['900'],
    fontSize: 16,
    fontWeight: '700'
  },
  actionsGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  iconActionButton: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['100'],
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  addKeywordButton: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['100'],
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  addKeywordText: {
    color: colorTokens.teal['700'],
    fontSize: 12,
    fontWeight: '700'
  },
  buttonPressed: {
    opacity: 0.7
  },
  explanationText: {
    color: colorTokens.ink['500'],
    fontSize: 12,
    lineHeight: 17
  },
  filterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginVertical: 2
  },
  filterPill: {
    backgroundColor: colorTokens.sand['100'],
    borderColor: colorTokens.sand['400'],
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  filterPillActive: {
    backgroundColor: colorTokens.teal['700'],
    borderColor: colorTokens.teal['700']
  },
  filterPillText: {
    color: colorTokens.ink['700'],
    fontSize: 11.5,
    fontWeight: '600'
  },
  filterPillTextActive: {
    color: colorTokens.surface.white,
    fontWeight: '700'
  },
  addCard: {
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['100'],
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm
  },
  addInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs
  },
  textInput: {
    backgroundColor: colorTokens.surface.white,
    borderColor: colorTokens.sand['400'],
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colorTokens.ink['900'],
    flex: 1,
    fontSize: 13,
    minHeight: 38,
    paddingHorizontal: spacing.sm
  },
  langBadge: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['100'],
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  langBadgeText: {
    color: colorTokens.teal['900'],
    fontSize: 12,
    fontWeight: '700'
  },
  submitAddButton: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['700'],
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  submitAddButtonDisabled: {
    opacity: 0.4
  },
  addErrorText: {
    color: colorTokens.status.danger,
    fontSize: 11
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xs
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colorTokens.sand['100'],
    borderColor: colorTokens.sand['400'],
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipText: {
    color: colorTokens.ink['900'],
    fontSize: 13,
    fontWeight: '600'
  },
  editInput: {
    color: colorTokens.ink['900'],
    fontSize: 13,
    minWidth: 96,
    padding: 0
  },
  chipRemoveButton: {
    alignItems: 'center',
    backgroundColor: colorTokens.sand['400'],
    borderRadius: radius.pill,
    height: 18,
    justifyContent: 'center',
    width: 18
  }
});
