import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { layoutDirectionStyle } from '@/design-system/direction';
import { StateView } from '@/design-system/components/feedback/StateView';
import { DesignIcon } from '@/design-system/icons';
import type { Category } from '@/domain/core-finance';
import {
  invalidateCoreFinanceScopes,
  useCategories,
  useTransactions
} from '@/features/core-finance/core-finance-queries';
import {
  currentLocale,
  translate,
  translateDynamic
} from '@/localization/i18n';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { spacing, colorTokens } from '@/design-system/tokens';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { CategoryRow } from './CategoryRow';
import { CategoryForm } from './CategoryForm';
import { GroupFormModal } from './GroupFormModal';
import { MoveToGroupSheet } from './MoveToGroupSheet';
import {
  matchesCategorySearch,
  projectCategory,
  type CategoryPresentation
} from './category-presentation';

export function CategoryListScreen() {
  const theme = useTheme();
  const client = useQueryClient();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = usePreferenceStore((state) => state.locale);
  const isRtl = direction === 'rtl';

  const [search, setSearch] = useState('');
  const [targetCategoryForGroup, setTargetCategoryForGroup] =
    useState<Category | null>(null);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const query = useCategories(true);
  const txQuery = useTransactions();
  const resolvedLocale = currentLocale();

  const txCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const transactions = txQuery.data?.items ?? [];

    for (const tx of transactions) {
      if (tx.categoryId) {
        counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [txQuery.data]);

  const allCategories = useMemo(
    () => (query.data ?? []) as Category[],
    [query.data]
  );

  const byId = useMemo(
    () =>
      new Map<string, Category>(allCategories.map((item) => [item.id, item])),
    [allCategories]
  );

  const items = useMemo<CategoryPresentation[]>(() => {
    const seen = new Set<string>();
    return allCategories
      .filter((item) => {
        if (!item?.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      })
      .map((item) =>
        projectCategory(
          item,
          resolvedLocale,
          item.parentId ? byId.get(item.parentId) : undefined
        )
      )
      .filter((item) => matchesCategorySearch(item, search))
      .sort(
        (a: CategoryPresentation, b: CategoryPresentation) =>
          Number(b.category.isFavorite) - Number(a.category.isFavorite) ||
          a.label.localeCompare(b.label)
      );
  }, [allCategories, byId, resolvedLocale, search]);

  // Delete category with confirmation
  const handleDeleteCategory = (cat: Category, catLabel: string) => {
    Alert.alert(
      translate('coreFinance.categories.deleteCategory'),
      translateDynamic('coreFinance.categories.deleteConfirm', {
        name: catLabel
      }),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: translate('coreFinance.categories.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const result = await coreFinanceService.setCategoryStatus(
                  cat.id,
                  'archived'
                );
                await invalidateCoreFinanceScopes(
                  client,
                  result.affectedScopes
                );
              } catch (e) {
                console.error('Failed to delete category', e);
              }
            })();
          }
        }
      ]
    );
  };

  // Move category to group
  const handleSelectGroup = async (groupId: string | null) => {
    const target = targetCategoryForGroup;
    if (!target?.financialType) return;
    try {
      const result = await coreFinanceService.updateCategory(target.id, {
        labelAr: target.labelAr,
        labelEn: target.labelEn,
        financialType: target.financialType,
        parentId: groupId,
        iconKey: target.iconKey,
        colorKey: target.colorKey,
        isFavorite: target.isFavorite
      });
      await invalidateCoreFinanceScopes(client, result.affectedScopes);
    } catch (e) {
      console.error('Failed to update category group', e);
    } finally {
      setTargetCategoryForGroup(null);
    }
  };

  // When a new group is created, if there was a targetCategoryForGroup, move it in!
  const handleGroupCreated = async (newGroup: Category) => {
    const target = targetCategoryForGroup;
    if (target?.financialType) {
      try {
        const result = await coreFinanceService.updateCategory(target.id, {
          labelAr: target.labelAr,
          labelEn: target.labelEn,
          financialType: target.financialType,
          parentId: newGroup.id,
          iconKey: target.iconKey,
          colorKey: target.colorKey,
          isFavorite: target.isFavorite
        });
        await invalidateCoreFinanceScopes(client, result.affectedScopes);
      } catch (e) {
        console.error('Failed to assign category to newly created group', e);
      } finally {
        setTargetCategoryForGroup(null);
      }
    }
  };

  if (query.isLoading)
    return (
      <StateView
        state="loading"
        title={translate('coreFinance.state.loading')}
      />
    );
  if (query.isError)
    return (
      <StateView
        state="error"
        title={translate('coreFinance.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => void query.refetch()}
      />
    );

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(item, index) =>
          item.category.id
            ? `category-item-${item.category.id}`
            : `cat-item-index-${index}`
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Page title */}
            <Text
              style={[
                styles.pageTitle,
                {
                  color: theme.colors.textPrimary,
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {locale === 'ar' ? 'الفئات' : 'Categories'}
            </Text>

            {/* Search input */}
            <View
              style={[
                styles.searchContainer,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor:
                    theme.colors.borders?.subtle ?? colorTokens.raw['E8EFEC'],
                  flexDirection: isRtl ? 'row-reverse' : 'row'
                }
              ]}
            >
              <DesignIcon
                name="search"
                label=""
                color={theme.colors.textSecondary}
                size="sm"
                decorative
              />
              <TextInput
                accessibilityLabel={translate('coreFinance.categories.search')}
                placeholder={translate('coreFinance.categories.search')}
                placeholderTextColor={theme.colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                style={[
                  styles.searchInput,
                  {
                    color: theme.colors.textPrimary,
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              />
            </View>

            {/* Quick action buttons row */}
            <View
              style={[
                styles.quickActionsRow,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              {/* Add Category */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={translate('coreFinance.categories.add')}
                onPress={() => setCategoryModalVisible(true)}
                style={({ pressed }) => [
                  styles.quickAction,
                  {
                    backgroundColor: pressed
                      ? colorTokens.teal[100]
                      : colorTokens.raw['EEF2FF'],
                    flexDirection: isRtl ? 'row-reverse' : 'row',
                    justifyContent: 'center'
                  }
                ]}
              >
                <View style={styles.quickActionIcon}>
                  <Text style={styles.quickActionIconText}>＋</Text>
                </View>
                <Text
                  style={[
                    styles.quickActionLabel,
                    {
                      color: colorTokens.teal[800],
                      textAlign: 'center',
                      writingDirection: direction
                    }
                  ]}
                >
                  {locale === 'ar' ? 'إضافة فئة' : 'Add Category'}
                </Text>
              </Pressable>

              {/* Add Group */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  locale === 'ar' ? 'إضافة مجموعة' : 'Add Group'
                }
                onPress={() => setGroupModalVisible(true)}
                style={({ pressed }) => [
                  styles.quickAction,
                  {
                    backgroundColor: pressed
                      ? colorTokens.teal[100]
                      : colorTokens.raw['EEF2FF'],
                    flexDirection: isRtl ? 'row-reverse' : 'row',
                    justifyContent: 'center'
                  }
                ]}
              >
                <View style={styles.quickActionIcon}>
                  <Text style={styles.quickActionIconText}>📁</Text>
                </View>
                <Text
                  style={[
                    styles.quickActionLabel,
                    {
                      color: colorTokens.teal[800],
                      textAlign: 'center',
                      writingDirection: direction
                    }
                  ]}
                >
                  {locale === 'ar' ? 'إضافة مجموعة' : 'Add Group'}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <StateView
            state="empty"
            title={
              allCategories.length
                ? translate('coreFinance.categories.noSearchResults')
                : translate('coreFinance.categories.empty')
            }
          />
        }
        renderItem={({ item, index }) => (
          <CategoryRow
            presentation={item}
            rowIndex={index}
            txCount={txCounts.get(item.category.id) ?? 0}
            onPress={() => setEditingCategory(item.category)}
            onDelete={() => handleDeleteCategory(item.category, item.label)}
            onMoveToGroup={() => setTargetCategoryForGroup(item.category)}
          />
        )}
      />

      {/* Add / Edit Category Modal */}
      <Modal
        visible={categoryModalVisible || Boolean(editingCategory)}
        transparent={false}
        animationType="slide"
        onRequestClose={() => {
          setCategoryModalVisible(false);
          setEditingCategory(null);
        }}
      >
        <View
          testID="category-form-modal-content"
          accessibilityViewIsModal
          style={{
            flex: 1,
            backgroundColor:
              theme.colors.background ?? colorTokens.raw['F6F8F7'],
            paddingTop: 20
          }}
        >
          <CategoryForm
            category={editingCategory ?? undefined}
            onClose={() => {
              setCategoryModalVisible(false);
              setEditingCategory(null);
            }}
            onSuccess={() => {
              setCategoryModalVisible(false);
              setEditingCategory(null);
            }}
          />
        </View>
      </Modal>

      {/* Move To Group Bottom Sheet */}
      <MoveToGroupSheet
        visible={Boolean(targetCategoryForGroup)}
        category={targetCategoryForGroup}
        groups={allCategories}
        onSelectGroup={(groupId) => void handleSelectGroup(groupId)}
        onNewGroup={() => setGroupModalVisible(true)}
        onClose={() => setTargetCategoryForGroup(null)}
      />

      {/* New Group Modal */}
      <GroupFormModal
        visible={groupModalVisible}
        onCreated={(newGroup) => void handleGroupCreated(newGroup)}
        onClose={() => setGroupModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 48,
    paddingTop: spacing.xl
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.lg
  },

  // Page title
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: spacing.xs
  },

  // Search
  searchContainer: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    ...layoutDirectionStyle('ltr'),
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 44
  },

  // Quick actions
  quickActionsRow: {
    ...layoutDirectionStyle('ltr'),
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  quickAction: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  quickActionIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 24
  },
  quickActionIconText: {
    fontSize: 16
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1
  }
});
