import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { layoutDirectionStyle } from '@/design-system/direction';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, spacing } from '@/design-system/tokens';
import type { Category } from '@/domain/core-finance';
import { invalidateCoreFinanceScopes } from '@/features/core-finance/core-finance-queries';
import { currentLocale, translate } from '@/localization/i18n';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import {
  CategoryIconPickerSheet,
  resolveEmojiForKey
} from './CategoryIconPickerSheet';

const PALETTE_COLORS = [
  colorTokens.raw['E91E63'], // Pink
  colorTokens.raw['5C6BC0'], // Indigo
  colorTokens.raw['FFA726'], // Amber / Orange
  colorTokens.raw['AB47BC'], // Purple
  colorTokens.raw['EF5350'], // Red
  colorTokens.raw['42A5F5'], // Blue
  colorTokens.raw['FF7043'], // Deep Orange
  colorTokens.raw['103F37'] // Teal
];

export function GroupFormModal({
  visible,
  onClose,
  onCreated
}: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (group: Category) => void;
}) {
  const theme = useTheme();
  const client = useQueryClient();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = currentLocale();
  const isRtl = direction === 'rtl';

  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState('housing');
  const [selectedColor, setSelectedColor] = useState<string>(
    colorTokens.raw['103F37']
  );
  const [financialType, setFinancialType] =
    useState<NonNullable<Category['financialType']>>('expense');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);

  const emoji = resolveEmojiForKey(iconKey);

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) {
      setError(translate('coreFinance.validation.required'));
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const result = await coreFinanceService.createCategory({
        labelAr: name.trim(),
        labelEn: name.trim(),
        financialType,
        iconKey,
        colorKey: selectedColor,
        parentId: null,
        isFavorite: false
      });
      await invalidateCoreFinanceScopes(client, result.affectedScopes);
      setName('');
      if (onCreated) onCreated(result.value);
      onClose();
    } catch {
      setError(translate('coreFinance.state.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable
          testID="group-form-modal-backdrop"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          testID="group-form-modal-content"
          accessibilityViewIsModal
          style={[
            styles.modalContent,
            { backgroundColor: theme.colors.surface }
          ]}
        >
          {/* Top Nav Bar */}
          <View
            style={[
              styles.navBar,
              styles.physicalLtr,
              { flexDirection: isRtl ? 'row-reverse' : 'row' }
            ]}
          >
            {/* Close action */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('coreFinance.cancel')}
              onPress={onClose}
              style={styles.navBtn}
              hitSlop={8}
            >
              <DesignIcon
                name="close"
                label={translate('coreFinance.cancel')}
                color={theme.colors.textSecondary}
                size="sm"
                decorative
              />
            </Pressable>

            {/* Title */}
            <Text
              style={[
                styles.navTitle,
                {
                  color: theme.colors.textPrimary,
                  textAlign: 'center',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.categories.newGroup')}
            </Text>

            {/* Save checkmark */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('coreFinance.categories.save')}
              disabled={saving}
              onPress={() => void handleSave()}
              style={[
                styles.navBtn,
                styles.navSaveBtn,
                {
                  backgroundColor: colorTokens.teal[900],
                  opacity: saving ? 0.6 : 1
                }
              ]}
            >
              <DesignIcon
                name="check"
                label={translate('coreFinance.categories.save')}
                color={colorTokens.raw['FFFFFF']}
                size="sm"
                decorative
              />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            {/* Hero Folder Icon */}
            <View style={styles.heroSection}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPickerOpen(true)}
                style={[
                  styles.heroBadge,
                  {
                    backgroundColor:
                      theme.colors.surfaces?.grouped ??
                      colorTokens.raw['EAF5F0'],
                    borderColor:
                      theme.colors.borders?.subtle ?? colorTokens.raw['E8EFEC']
                  }
                ]}
              >
                <Text style={styles.heroEmoji}>{emoji}</Text>
                {/* Tiny smiley overlay badge */}
                <View style={styles.smileyBadge}>
                  <Text style={styles.smileyEmoji}>😊</Text>
                </View>
              </Pressable>

              <Text
                style={[
                  styles.heroHint,
                  {
                    color: theme.colors.textSecondary,
                    textAlign: 'center',
                    writingDirection: direction
                  }
                ]}
              >
                {locale === 'ar'
                  ? 'اضغط لاختيار رمز تعبيري'
                  : 'Tap to choose an emoji'}
              </Text>
            </View>

            {/* Name Field */}
            <View style={styles.fieldSection}>
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: theme.colors.textSecondary,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('coreFinance.categories.groupName')}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={translate(
                  'coreFinance.categories.groupNamePlaceholder'
                )}
                placeholderTextColor={theme.colors.textSecondary}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: error
                      ? colorTokens.raw['C04B45']
                      : (theme.colors.borders?.subtle ??
                        colorTokens.raw['E7E9E6']),
                    color: theme.colors.textPrimary,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Text
                style={[
                  styles.helperText,
                  {
                    color: theme.colors.textSecondary,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('coreFinance.categories.groupHelper')}
              </Text>
            </View>

            <View style={styles.fieldSection}>
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: theme.colors.textSecondary,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('coreFinance.filters.type')}
              </Text>
              <ChipSelector
                options={[
                  translate('coreFinance.type.expense'),
                  translate('coreFinance.type.income')
                ]}
                selected={[
                  translate(`coreFinance.type.${financialType}` as never)
                ]}
                onToggle={(value) =>
                  setFinancialType(
                    value === translate('coreFinance.type.income')
                      ? 'income'
                      : 'expense'
                  )
                }
              />
            </View>

            {/* Color Palette */}
            <View style={styles.fieldSection}>
              <Text
                style={[
                  styles.fieldLabel,
                  {
                    color: theme.colors.textSecondary,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {translate('coreFinance.categories.color')}
              </Text>

              <View
                style={[
                  styles.paletteRow,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' }
                ]}
              >
                {PALETTE_COLORS.map((c) => {
                  const isSelected = selectedColor === c;
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="button"
                      onPress={() => setSelectedColor(c)}
                      style={[styles.colorDot, { backgroundColor: c }]}
                    >
                      {isSelected ? (
                        <Text style={styles.checkIcon}>✓</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Emoji Picker Sheet */}
      <CategoryIconPickerSheet
        visible={pickerOpen}
        selectedKey={iconKey}
        onSelect={(key) => setIconKey(key)}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    display: 'flex',
    writingDirection: 'ltr'
  },
  backdrop: {
    backgroundColor: 'rgba(6, 29, 25, 0.52)',
    flex: 1
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 32,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  navBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    minHeight: 48
  },
  navBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  navSaveBtn: {
    elevation: 3,
    shadowColor: colorTokens.teal[900],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4
  },
  navTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700'
  },
  scrollBody: {
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  heroSection: {
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: spacing.sm
  },
  heroBadge: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    position: 'relative',
    width: 96
  },
  heroEmoji: {
    fontSize: 46
  },
  smileyBadge: {
    alignItems: 'center',
    backgroundColor: colorTokens.raw['FFFFFF'],
    borderRadius: 12,
    bottom: -4,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    width: 24,
    elevation: 2,
    shadowColor: colorTokens.raw['000'],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2
  },
  smileyEmoji: {
    fontSize: 13
  },
  heroHint: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.xs,
    opacity: 0.7
  },
  fieldSection: {
    gap: spacing.xs
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    opacity: 0.7
  },
  errorText: {
    color: colorTokens.raw['C04B45'],
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2
  },
  paletteRow: {
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  colorDot: {
    alignItems: 'center',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  checkIcon: {
    color: colorTokens.raw['FFFFFF'],
    fontSize: 16,
    fontWeight: '700'
  }
});
