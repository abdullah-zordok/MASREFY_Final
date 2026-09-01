import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { layoutDirectionStyle } from '@/design-system/direction';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, spacing } from '@/design-system/tokens';
import type { Category } from '@/domain/core-finance';
import { invalidateCoreFinanceScopes } from '@/features/core-finance/core-finance-queries';
import { useDraftNavigationGuard } from '@/features/shell/useDraftNavigationGuard';
import { currentLocale, translate } from '@/localization/i18n';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import {
  CategoryIconPickerSheet,
  resolveEmojiForKey
} from './CategoryIconPickerSheet';

export function CategoryForm({
  category,
  onClose,
  onSuccess
}: {
  category?: Category;
  onClose?: () => void;
  onSuccess?: (category: Category) => void;
}) {
  const theme = useTheme();
  const client = useQueryClient();
  const locale = currentLocale();
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  const [name, setName] = useState(
    category ? (locale === 'ar' ? category.labelAr : category.labelEn) : ''
  );
  const [iconKey, setIconKey] = useState(category?.iconKey ?? 'food');
  const [financialType, setFinancialType] = useState<
    NonNullable<Category['financialType']>
  >(category?.financialType ?? 'expense');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const dirty =
    name !==
      (category
        ? locale === 'ar'
          ? category.labelAr
          : category.labelEn
        : '') ||
    iconKey !== (category?.iconKey ?? 'food') ||
    financialType !== (category?.financialType ?? 'expense');

  useEffect(() => {
    if (!category) return;
    setName(locale === 'ar' ? category.labelAr : category.labelEn);
    setIconKey(category.iconKey ?? 'food');
    setFinancialType(category.financialType ?? 'expense');
    setError(undefined);
  }, [category, locale]);

  const doClose = () => {
    if (onClose) onClose();
    else router.back();
  };
  const { requestClose: handleCancel, leaveAfterSave } =
    useDraftNavigationGuard({
      dirty,
      discard: () => undefined,
      close: doClose,
      copy: {
        title: translate('coreFinance.categories.discardChanges'),
        message: translate('coreFinance.categories.discardChangesBody'),
        keep: translate('coreFinance.categories.keepEditing'),
        discard: translate('coreFinance.categories.discard')
      }
    });

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) {
      setError(translate('coreFinance.validation.required'));
      return;
    }

    const trimmedName = name.trim();
    const input = {
      labelAr:
        locale === 'ar'
          ? trimmedName
          : category?.labelAr && category.labelAr !== category.labelEn
            ? category.labelAr
            : trimmedName,
      labelEn:
        locale === 'en'
          ? trimmedName
          : category?.labelEn && category.labelEn !== category.labelAr
            ? category.labelEn
            : trimmedName,
      financialType,
      parentId: category?.parentId ?? null,
      iconKey,
      colorKey: category?.colorKey ?? null,
      isFavorite: category?.isFavorite ?? false
    };

    setSaving(true);
    setError(undefined);
    try {
      const result = category
        ? await coreFinanceService.updateCategory(category.id, input)
        : await coreFinanceService.createCategory(input);
      await invalidateCoreFinanceScopes(client, result.affectedScopes);
      leaveAfterSave(() => {
        if (onSuccess) onSuccess(result.value);
        else if (onClose) onClose();
        else router.replace('/categories');
      });
    } catch {
      setError(translate('coreFinance.state.error'));
    } finally {
      setSaving(false);
    }
  };

  const emoji = resolveEmojiForKey(iconKey);
  const isEditing = Boolean(category);
  const headerTitle = isEditing
    ? translate('coreFinance.categories.editCategoryTitle')
    : translate('coreFinance.categories.addCategoryTitle');

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ──────────── Top Navigation Bar ──────────── */}
        <View
          style={[
            styles.navBar,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          {/* Close action (✕) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('coreFinance.cancel')}
            onPress={handleCancel}
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

          {/* Centered Title */}
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
            {headerTitle}
          </Text>

          {/* Save checkmark action (✓) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('coreFinance.categories.save')}
            disabled={saving}
            onPress={() => void handleSave()}
            style={[styles.navBtn, { opacity: saving ? 0.6 : 1 }]}
            hitSlop={8}
          >
            <DesignIcon
              name="check"
              label={translate('coreFinance.categories.save')}
              color={colorTokens.teal[600]}
              size="md"
              decorative
            />
          </Pressable>
        </View>

        {/* ──────────── Hero Emoji Section ──────────── */}
        <View style={styles.heroSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('coreFinance.categories.chooseIcon')}
            onPress={() => setPickerOpen(true)}
            style={[
              styles.heroBadge,
              {
                backgroundColor:
                  theme.colors.surfaces?.grouped ?? colorTokens.raw['F1F5F3'],
                borderColor:
                  theme.colors.borders?.subtle ?? colorTokens.raw['E8EFEC']
              }
            ]}
          >
            <Text style={styles.heroEmoji}>{emoji}</Text>
            {/* Small smiley overlay badge */}
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

        {/* ──────────── Single Simple Name Field ──────────── */}
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
              'coreFinance.categories.categoryNamePlaceholder'
            )}
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: error
                  ? colorTokens.raw['C04B45']
                  : (theme.colors.borders?.subtle ?? colorTokens.raw['E7E9E6']),
                color: theme.colors.textPrimary,
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          />

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.errorText, { color: colorTokens.raw['C04B45'] }]}
            >
              {error}
            </Text>
          ) : null}
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
            selected={[translate(`coreFinance.type.${financialType}` as never)]}
            onToggle={(value) =>
              setFinancialType(
                value === translate('coreFinance.type.income')
                  ? 'income'
                  : 'expense'
              )
            }
          />
        </View>
      </ScrollView>

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
  container: {
    gap: spacing.lg,
    paddingBottom: 48,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },

  // Top Nav Bar
  navBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    minHeight: 48
  },
  navBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  navTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2
  },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    gap: spacing.xs,
    marginVertical: spacing.md
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

  // Simple Name Field
  fieldSection: {
    gap: spacing.xs,
    marginTop: spacing.sm
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
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2
  }
});
