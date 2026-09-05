import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { PickerField } from '@/design-system/components/forms/PickerField';
import type { Category } from '@/domain/core-finance';
import {
  invalidateCoreFinanceScopes,
  useCategories
} from '@/features/core-finance/core-finance-queries';
import {
  currentLocale,
  translate,
  translateDynamic
} from '@/localization/i18n';
import { categoryLifecycleService } from '@/services/mocks/core-finance-service';
import type { CategoryUsagePreview } from '@/services/contracts/core-finance-service';
import { CategoryRow } from './CategoryRow';
import { projectCategory } from './category-presentation';
import { openCategorySelection } from './category-selection-session';

export function CategoryDetailScreen({ id }: { id: string }) {
  const client = useQueryClient();
  const query = useCategories(true);
  const locale = currentLocale();
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [targetId, setTargetId] = useState<string>();
  const category = query.data?.find((item: Category) => item.id === id);
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
  if (!category)
    return (
      <StateView
        state="error"
        title={translate('coreFinance.categories.missing')}
        actionLabel={translate('appShell.navigation.back')}
        onAction={() => router.back()}
      />
    );
  const target = query.data?.find(
    (item: Category) =>
      item.id === targetId &&
      item.kind === 'custom' &&
      item.status === 'active' &&
      item.financialType === category.financialType
  );
  const categoryLabel = locale === 'ar' ? category.labelAr : category.labelEn;
  const parent = query.data?.find(
    (item: Category) => item.id === category.parentId
  );
  const presentation = projectCategory(category, locale, parent);
  const lifecycleLabel =
    category.status === 'archived'
      ? translate('coreFinance.categories.restore')
      : translate('coreFinance.categories.archive');
  const confirmLifecycle = (preview: CategoryUsagePreview) => {
    Alert.alert(
      lifecycleLabel,
      translateDynamic('coreFinance.categories.archiveConfirmNamed', {
        name: categoryLabel,
        count: String(preview.linkedTransactionCount)
      }),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: lifecycleLabel,
          style: category.status === 'archived' ? 'default' : 'destructive',
          onPress: () => {
            void (async () => {
              if (working) return;
              setWorking(true);
              setActionError(undefined);
              try {
                const result = await categoryLifecycleService.setCategoryStatus(
                  id,
                  category.status === 'archived' ? 'active' : 'archived',
                  preview
                );
                await invalidateCoreFinanceScopes(
                  client,
                  result.affectedScopes
                );
                router.replace('/categories');
              } catch {
                setActionError(translate('coreFinance.state.error'));
              } finally {
                setWorking(false);
              }
            })();
          }
        }
      ]
    );
  };
  const loadUsage = async () => {
    if (working) return undefined;
    setWorking(true);
    setActionError(undefined);
    try {
      return await categoryLifecycleService.getCategoryUsage(id);
    } catch {
      setActionError(translate('coreFinance.state.error'));
      return undefined;
    } finally {
      setWorking(false);
    }
  };
  const runLifecycle = () => {
    void loadUsage().then((preview) => {
      if (preview) confirmLifecycle(preview);
    });
  };
  const confirmMerge = (preview: CategoryUsagePreview) => {
    if (!target) return;
    const targetLabel = locale === 'ar' ? target.labelAr : target.labelEn;
    Alert.alert(
      translate('coreFinance.categories.merge'),
      translateDynamic('coreFinance.categories.mergeConfirmNamed', {
        source: categoryLabel,
        target: targetLabel,
        count: String(preview.linkedTransactionCount)
      }),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: translate('coreFinance.categories.merge'),
          onPress: () => {
            void (async () => {
              if (working) return;
              setWorking(true);
              setActionError(undefined);
              try {
                const result = await categoryLifecycleService.mergeCategory(
                  id,
                  target.id,
                  preview
                );
                await invalidateCoreFinanceScopes(
                  client,
                  result.affectedScopes
                );
                router.replace('/categories');
              } catch {
                setActionError(translate('coreFinance.state.error'));
              } finally {
                setWorking(false);
              }
            })();
          }
        }
      ]
    );
  };
  const runMerge = () => {
    if (!target) return;
    void loadUsage().then((preview) => {
      if (preview) confirmMerge(preview);
    });
  };
  return (
    <ScrollView contentContainerStyle={styles.stack}>
      <CategoryRow presentation={presentation} groupedPosition="only" />
      <ActionButton
        label={translate('coreFinance.categories.edit')}
        variant="secondary"
        onPress={() => router.push(`/categories/${id}?edit=1`)}
      />
      {category.kind === 'custom' ? (
        <ActionButton
          label={lifecycleLabel}
          loading={working}
          variant={category.status === 'archived' ? 'secondary' : 'destructive'}
          onPress={runLifecycle}
        />
      ) : null}
      {category.kind === 'custom' && category.status === 'active' ? (
        <>
          <PickerField
            label={translate('coreFinance.categories.selectMergeTarget')}
            value={
              target
                ? locale === 'ar'
                  ? target.labelAr
                  : target.labelEn
                : undefined
            }
            placeholder={translate('coreFinance.categories.selectMergeTarget')}
            onPress={() =>
              openCategorySelection({
                selectedId: targetId,
                excludedIds: [id],
                onSelect: (categoryId) => {
                  if (categoryId) setTargetId(categoryId);
                }
              })
            }
          />
          <ActionButton
            disabled={!target || working}
            label={translate('coreFinance.categories.merge')}
            variant="secondary"
            onPress={runMerge}
          />
        </>
      ) : null}
      {actionError ? (
        <StyledText variant="caption">{actionError}</StyledText>
      ) : null}
    </ScrollView>
  );
}
const styles = StyleSheet.create({ stack: { gap: 12, padding: 16 } });
