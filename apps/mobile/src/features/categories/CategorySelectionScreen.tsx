import React, { useMemo, useState } from 'react';
import {
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { StateView } from '@/design-system/components/feedback/StateView';
import { CategoryIcon } from '@/design-system/components/financial/FinancialPrimitives';
import { DesignIcon } from '@/design-system/icons';
import {
  elevation,
  minTouchTarget,
  radius,
  spacing,
  typography
} from '@/design-system/tokens';
import type { Category } from '@/domain/core-finance';
import { useCategories } from '@/features/core-finance/core-finance-queries';
import { currentLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import {
  matchesCategorySearch,
  projectCategory
} from './category-presentation';

export function CategorySelectionScreen({
  allowClear = false,
  excludedIds,
  selectedId,
  onBack,
  onSelect
}: {
  allowClear?: boolean;
  excludedIds: readonly string[];
  selectedId?: string;
  onBack: () => void;
  onSelect: (categoryId: string | null) => void;
}) {
  const categories = useCategories(true);
  const direction = usePreferenceStore((state) => state.direction);
  const theme = useTheme();
  const locale = currentLocale();
  const [search, setSearch] = useState('');
  const byId = useMemo(
    () =>
      new Map(
        ((categories.data ?? []) as Category[]).map((category) => [
          category.id,
          category
        ])
      ),
    [categories.data]
  );
  const filtered = useMemo(
    () =>
      ((categories.data ?? []) as Category[])
        .filter(
          (category) =>
            category.status === 'active' && !excludedIds.includes(category.id)
        )
        .map((category) =>
          projectCategory(
            category,
            locale,
            category.parentId ? byId.get(category.parentId) : undefined
          )
        )
        .filter((category) => matchesCategorySearch(category, search))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [byId, categories.data, excludedIds, locale, search]
  );
  const favorite = filtered.filter(({ category }) => category.isFavorite);
  const other = filtered.filter(({ category }) => !category.isFavorite);

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.surfaces.page }]}
    >
      <View
        testID="category-selection-header"
        style={[
          styles.header,
          {
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        <Pressable
          accessibilityLabel={translate('appShell.navigation.back')}
          accessibilityRole="button"
          onPress={onBack}
          style={styles.headerAction}
        >
          <DesignIcon
            color={theme.colors.content.primary}
            decorative
            direction={direction}
            label={translate('appShell.navigation.back')}
            name="back"
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.colors.content.primary }]}
        >
          {translate('coreFinance.categoryPicker.title')}
        </Text>
        <View style={styles.headerAction} />
      </View>

      <View
        style={[
          styles.search,
          {
            backgroundColor: theme.colors.surfaces.card,
            borderColor: theme.colors.borders.subtle,
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
          }
        ]}
      >
        <DesignIcon
          color={theme.colors.content.muted}
          decorative
          label={translate('coreFinance.categoryPicker.search')}
          name="search"
        />
        <TextInput
          accessibilityLabel={translate('coreFinance.categoryPicker.search')}
          onChangeText={setSearch}
          placeholder={translate('coreFinance.categoryPicker.search')}
          placeholderTextColor={theme.colors.content.muted}
          returnKeyType="search"
          style={[
            styles.searchInput,
            {
              color: theme.colors.content.primary,
              textAlign: direction === 'rtl' ? 'right' : 'left',
              writingDirection: direction
            }
          ]}
          value={search}
        />
      </View>

      {categories.isError ? (
        <StateView
          actionLabel={translate('coreFinance.action.retry')}
          onAction={() => void categories.refetch()}
          state="error"
          title={translate('coreFinance.state.error')}
        />
      ) : categories.isLoading ? (
        <StateView
          state="loading"
          title={translate('coreFinance.state.loading')}
        />
      ) : !filtered.length ? (
        <StateView
          state="empty"
          title={translate('coreFinance.categories.noSearchResults')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {allowClear ? (
            <CategoryGroup
              key="clear"
              items={[
                {
                  id: 'clear',
                  label: translate('coreFinance.categories.noParent'),
                  visualKey: null
                }
              ]}
              onSelect={() => onSelect(null)}
              selectedId={selectedId}
              testID="category-selection-clear"
            />
          ) : null}
          {favorite.length ? (
            <CategorySection
              items={favorite.map(({ category, label }) => ({
                id: category.id,
                label,
                visualKey: category.iconKey
              }))}
              onSelect={onSelect}
              selectedId={selectedId}
              testID="category-selection-most-used"
              title={translate('coreFinance.categories.mostUsed')}
            />
          ) : null}
          {other.length ? (
            <CategorySection
              items={other.map(({ category, label }) => ({
                id: category.id,
                label,
                visualKey: category.iconKey
              }))}
              onSelect={onSelect}
              selectedId={selectedId}
              testID="category-selection-others"
              title={translate('coreFinance.categoryPicker.others')}
            />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

interface SelectionItem {
  id: string;
  label: string;
  visualKey: string | null;
}

function CategorySection({
  items,
  onSelect,
  selectedId,
  testID,
  title
}: {
  items: SelectionItem[];
  onSelect: (categoryId: string) => void;
  selectedId?: string;
  testID: string;
  title: string;
}) {
  const direction = usePreferenceStore((state) => state.direction);
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text
        style={[
          styles.sectionTitle,
          {
            color: theme.colors.content.secondary,
            textAlign: direction === 'rtl' ? 'right' : 'left',
            writingDirection: direction
          }
        ]}
      >
        {title}
      </Text>
      <CategoryGroup
        items={items}
        onSelect={onSelect}
        selectedId={selectedId}
        testID={testID}
      />
    </View>
  );
}

function CategoryGroup({
  items,
  onSelect,
  selectedId,
  testID
}: {
  items: SelectionItem[];
  onSelect: (categoryId: string) => void;
  selectedId?: string;
  testID: string;
}) {
  const direction = usePreferenceStore((state) => state.direction);
  const theme = useTheme();
  const largeText = PixelRatio.getFontScale() >= 1.5;
  return (
    <View
      testID={testID}
      style={[
        styles.group,
        {
          backgroundColor: theme.colors.surfaces.card,
          borderColor: theme.colors.borders.default
        }
      ]}
    >
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            testID={`category-selection-row-${item.id}`}
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: selected
                  ? theme.colors.surfaces.brandSubtle
                  : pressed
                    ? theme.colors.interactions.quietPressed
                    : theme.colors.surfaces.card,
                borderBottomColor: theme.colors.borders.subtle,
                direction: 'ltr',
                flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
                minHeight: largeText ? 72 : 64
              },
              index === items.length - 1 && styles.lastRow
            ]}
          >
            <CategoryIcon
              label={item.label}
              size="md"
              visualKey={item.visualKey}
            />
            <Text
              style={[
                styles.rowLabel,
                {
                  color: theme.colors.content.primary,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {item.label}
            </Text>
            {selected ? (
              <DesignIcon
                color={theme.colors.content.link}
                decorative
                label={translate('designSystem.state.selected')}
                name="check"
                testID={`category-selection-check-${item.id}`}
              />
            ) : (
              <View style={styles.checkSpace} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    writingDirection: 'ltr'
  },
  headerAction: {
    alignItems: 'center',
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget
  },
  title: { ...typography.title, flex: 1, textAlign: 'center' },
  search: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    writingDirection: 'ltr'
  },
  searchInput: { flex: 1, fontSize: 17, lineHeight: 24, minHeight: 54 },
  content: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 18
  },
  group: {
    ...elevation.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden'
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    writingDirection: 'ltr'
  },
  lastRow: { borderBottomWidth: 0 },
  rowLabel: { flex: 1, fontSize: 17, fontWeight: '600', lineHeight: 24 },
  checkSpace: { height: 24, width: 24 }
});
