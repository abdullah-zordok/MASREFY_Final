import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import type { Category } from '@/domain/core-finance';
import { currentLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { resolveEmojiForKey } from './CategoryIconPickerSheet';

export function MoveToGroupSheet({
  visible,
  category,
  groups,
  onSelectGroup,
  onNewGroup,
  onClose
}: {
  visible: boolean;
  category: Category | null;
  groups: Category[];
  onSelectGroup: (groupId: string | null) => void;
  onNewGroup: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = currentLocale();
  const isRtl = direction === 'rtl';

  if (!category) return null;

  const categoryName = locale === 'ar' ? category.labelAr : category.labelEn;
  const availableGroups = groups.filter(
    (group) =>
      group.id !== category.id &&
      !group.parentId &&
      group.kind === 'custom' &&
      group.status === 'active' &&
      group.financialType === category.financialType
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        testID="move-to-group-backdrop"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View
        testID="move-to-group-sheet"
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { backgroundColor: theme.colors.surface }
        ]}
      >
        {/* Top Header */}
        <View
          style={[
            styles.header,
            styles.physicalLtr,
            { flexDirection: isRtl ? 'row-reverse' : 'row' }
          ]}
        >
          <View style={[styles.headerTitles, { alignItems: 'center' }]}>
            <Text
              style={[
                styles.title,
                {
                  color: theme.colors.textPrimary,
                  textAlign: 'center',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.categories.moveToGroup')}
            </Text>
            <Text
              style={[
                styles.subtitle,
                {
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  writingDirection: direction
                }
              ]}
            >
              {categoryName}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('coreFinance.cancel')}
            onPress={onClose}
            style={[
              styles.closeBtn,
              isRtl ? styles.closeBtnRtl : styles.closeBtnLtr
            ]}
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
        </View>

        {/* Content Body */}
        {availableGroups.length === 0 ? (
          /* Empty Groups State */
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconBadge,
                { backgroundColor: colorTokens.raw["EEF2FF"] }
              ]}
            >
              <Text style={styles.emptyIconText}>📁</Text>
            </View>
            <Text
              style={[
                styles.emptyTitle,
                {
                  color: theme.colors.textPrimary,
                  textAlign: 'center',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.categories.noGroupsYet')}
            </Text>
            <Text
              style={[
                styles.emptyDescription,
                {
                  color: theme.colors.textSecondary,
                  textAlign: 'center',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.categories.groupsExplainer')}
            </Text>
          </View>
        ) : (
          /* Groups List */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.groupsList}
          >
            {/* Option to clear group if category currently has a parent */}
            {category.parentId ? (
              <Pressable
                key="remove-from-group"
                accessibilityRole="button"
                onPress={() => {
                  onSelectGroup(null);
                  onClose();
                }}
                style={[
                  styles.groupCard,
                  styles.physicalLtr,
                  {
                    backgroundColor: theme.colors.surfaces?.grouped ?? colorTokens.raw["F8FAFB"],
                    borderColor: theme.colors.borders?.subtle ?? colorTokens.raw["E8EFEC"],
                    flexDirection: isRtl ? 'row-reverse' : 'row'
                  }
                ]}
              >
                <Text style={styles.groupEmoji}>❌</Text>
                <Text
                  style={[
                    styles.groupName,
                    {
                      color: colorTokens.raw["C04B45"],
                      flex: 1,
                      textAlign: isRtl ? 'right' : 'left',
                      writingDirection: direction
                    }
                  ]}
                >
                  {translate('coreFinance.categories.removeFromGroup')}
                </Text>
              </Pressable>
            ) : null}

            {availableGroups.map((group, index) => {
              const isSelected = category.parentId === group.id;
              const gName = locale === 'ar' ? group.labelAr : group.labelEn;
              const emoji = resolveEmojiForKey(group.iconKey ?? 'housing');

              return (
                <Pressable
                  key={group.id ? `group-${group.id}` : `group-idx-${index}`}
                  accessibilityRole="button"
                  onPress={() => {
                    onSelectGroup(group.id);
                    onClose();
                  }}
                  style={[
                    styles.groupCard,
                    styles.physicalLtr,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.surfaces?.brandSubtle ?? colorTokens.raw["EAF5F0"]
                        : theme.colors.surface,
                      borderColor: isSelected
                        ? colorTokens.teal[600]
                        : theme.colors.borders?.subtle ?? colorTokens.raw["E8EFEC"],
                      flexDirection: isRtl ? 'row-reverse' : 'row'
                    }
                  ]}
                >
                  <Text style={styles.groupEmoji}>{emoji}</Text>
                  <Text
                    style={[
                      styles.groupName,
                      {
                        color: theme.colors.textPrimary,
                        flex: 1,
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: direction
                      }
                    ]}
                  >
                    {gName}
                  </Text>
                  {isSelected ? (
                    <Text style={{ color: colorTokens.teal[700], fontSize: 16 }}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Bottom Action: New Group */}
        <View style={styles.bottomBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('coreFinance.categories.newGroup')}
            onPress={onNewGroup}
            style={({ pressed }) => [
              styles.newGroupBtn,
              {
                backgroundColor: pressed ? colorTokens.raw["E0E7FF"] : colorTokens.raw["EEF2FF"]
              }
            ]}
          >
            <Text
              style={[
                styles.newGroupBtnText,
                { color: colorTokens.raw["4F46E5"], writingDirection: direction }
              ]}
            >
              ＋ {translate('coreFinance.categories.newGroup')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  physicalLtr: { ...layoutDirectionStyle('ltr'), display: 'flex', writingDirection: 'ltr' },
  backdrop: {
    backgroundColor: 'rgba(6, 29, 25, 0.52)',
    flex: 1
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    minHeight: 380,
    paddingBottom: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg
  },
  header: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    position: 'relative'
  },
  headerTitles: {
    flex: 1,
    gap: 2
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500'
  },
  closeBtn: {
    alignItems: 'center',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    width: 48
  },
  closeBtnLtr: { right: 0 },
  closeBtnRtl: { left: 0 },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl
  },
  emptyIconBadge: {
    alignItems: 'center',
    borderRadius: 24,
    height: 80,
    justifyContent: 'center',
    marginBottom: spacing.lg,
    width: 80
  },
  emptyIconText: {
    fontSize: 38
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: spacing.xs
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 20
  },
  groupsList: {
    gap: spacing.sm,
    paddingBottom: spacing.lg
  },
  groupCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  groupEmoji: {
    fontSize: 24
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600'
  },
  bottomBar: {
    marginTop: 'auto',
    paddingTop: spacing.md
  },
  newGroupBtn: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: '100%'
  },
  newGroupBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1
  }
});
