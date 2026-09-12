import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'react-native';

import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { radius, spacing, colorTokens } from '@/design-system/tokens';
import { currentLocale, translate, translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import type { CategoryPresentation } from './category-presentation';
import { resolveEmojiForKey } from './CategoryIconPickerSheet';
import { resolveCategoryVisual } from '@/design-system/components/financial/category-visuals';
import { categoryIconName } from './category-presentation';

/** Soft tinted background colors cycling for category icon badges */
const ICON_BG_TONES = [
  colorTokens.raw["FFF3E8"], // warm amber
  colorTokens.raw["EBF7EE"], // soft green
  colorTokens.raw["EAF4F4"], // cool teal
  colorTokens.raw["FDF0ED"], // soft salmon
  colorTokens.raw["FEF8E7"], // pale yellow
  colorTokens.raw["EBF0FC"], // lavender blue
  colorTokens.raw["F0F8EC"], // mint
];

function iconBgForIndex(index: number): string {
  return ICON_BG_TONES[index % ICON_BG_TONES.length];
}

function formatTxCount(count: number, locale: string): string {
  if (count === 0) return translate('coreFinance.categories.txCountZero');
  if (locale === 'ar') {
    if (count === 1) return translate('coreFinance.categories.txCountOne');
    if (count === 2) return translate('coreFinance.categories.txCountTwo');
    if (count >= 3 && count <= 10) {
      return translateDynamic('coreFinance.categories.txCountFew', {
        count: String(count)
      });
    }
    return translateDynamic('coreFinance.categories.txCountMany', {
      count: String(count)
    });
  }
  if (count === 1) return translate('coreFinance.categories.txCountOne');
  return translateDynamic('coreFinance.categories.txCountFew', {
    count: String(count)
  });
}

export function CategoryRow({
  presentation,
  selected = false,
  groupedPosition,
  rowIndex = 0,
  txCount,
  onPress,
  onDelete,
  onMoveToGroup
}: {
  presentation: CategoryPresentation;
  selected?: boolean;
  groupedPosition?: 'first' | 'middle' | 'last' | 'only';
  rowIndex?: number;
  txCount?: number;
  onPress?: () => void;
  onDelete?: () => void;
  onMoveToGroup?: () => void;
}) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = currentLocale();
  const isRtl = direction === 'rtl';
  const { category, label, parentLabel, statusLabelKey, originLabelKey } =
    presentation;
  const status = statusLabelKey ? translate(statusLabelKey as never) : null;

  // Resolve visual: try openmoji image asset, then emoji fallback
  const visual = resolveCategoryVisual(
    category.iconKey,
    categoryIconName(category.iconKey)
  );
  const emoji = resolveEmojiForKey(category.iconKey ?? '');
  const iconBg = iconBgForIndex(rowIndex);

  const isGrouped = Boolean(groupedPosition);

  const subtitleParts: string[] = [];
  if (parentLabel) {
    subtitleParts.push(parentLabel);
  }
  if (typeof txCount === 'number') {
    subtitleParts.push(formatTxCount(txCount, locale));
  } else if (!parentLabel) {
    subtitleParts.push(translate(originLabelKey as never));
  }
  const subtitle = subtitleParts.join('  ·  ');

  return (
    <Pressable
      testID="category-row"
      accessibilityLabel={[label, subtitle, status].filter(Boolean).join(', ')}
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.card,
        styles.physicalLtr,
        {
          backgroundColor: selected
            ? theme.colors.surfaces?.brandSubtle ?? colorTokens.raw["EBF7EE"]
            : theme.colors.surface,
          borderColor: selected
            ? colorTokens.teal[500]
            : theme.colors.borders?.subtle ?? colorTokens.raw["E8EFEC"]
        },
        isGrouped && styles.grouped,
        groupedPosition === 'first' && styles.groupedFirst,
        groupedPosition === 'middle' && styles.groupedMiddle,
        groupedPosition === 'last' && styles.groupedLast,
        groupedPosition === 'only' && styles.groupedOnly,
        !isGrouped && styles.standalone
      ]}
    >
      <View
        style={[
          styles.inner,
          { flexDirection: isRtl ? 'row-reverse' : 'row' }
        ]}
      >
        {/* ── Start: Icon Badge ── */}
        <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
          {visual ? (
            <Image
              accessible={false}
              resizeMode="contain"
              source={visual.asset}
              style={styles.iconImage}
            />
          ) : (
            <Text style={styles.iconEmoji}>{emoji}</Text>
          )}
        </View>

        {/* ── Middle: Label & Subtitle (Tx count / parent) ── */}
        <View
          style={[
            styles.textBlock,
            { alignItems: isRtl ? 'flex-end' : 'flex-start' }
          ]}
        >
          <Text
            style={[
              styles.categoryLabel,
              {
                color: theme.colors.content?.primary ?? theme.colors.textPrimary,
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {label}
          </Text>

          <Text
            style={[
              styles.categoryMeta,
              {
                color: theme.colors.content?.secondary ?? theme.colors.textSecondary,
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {subtitle}
            {category.isFavorite && !isGrouped ? `  ·  ${translate('coreFinance.categories.favoriteShort')}` : ''}
          </Text>

          {status ? (
            <Text
              style={[
                styles.statusLabel,
                { color: theme.colors.status?.pending ?? colorTokens.raw["6B7280"] }
              ]}
            >
              {status}
            </Text>
          ) : null}
        </View>

        {!isGrouped && (onMoveToGroup || onDelete) ? (
          <View
            style={[
              styles.trailingActions,
              { flexDirection: isRtl ? 'row-reverse' : 'row' }
            ]}
          >
            {/* Move to Group button (Folder Icon) */}
            {onMoveToGroup ? (
              <Pressable
                key="action-btn-move-to-group"
                accessibilityRole="button"
                accessibilityLabel={`${translate('coreFinance.categories.moveToGroup')}: ${label}`}
                onPress={(event) => {
                  event.stopPropagation();
                  onMoveToGroup();
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: pressed ? colorTokens.raw["EEF2FF"] : 'transparent',
                    opacity: pressed ? 0.8 : 1
                  }
                ]}
                hitSlop={8}
              >
                <DesignIcon
                  name="folder"
                  label={translate('coreFinance.categories.moveToGroup')}
                  color={colorTokens.raw["94A3B8"]}
                  size="sm"
                  decorative
                />
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${translate('coreFinance.categories.delete')}: ${label}`}
                onPress={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                style={({ pressed }) => [
                  styles.actionBtn,
                  {
                    backgroundColor: pressed
                      ? colorTokens.raw["FEE2E2"]
                      : 'transparent'
                  }
                ]}
                hitSlop={8}
              >
                <DesignIcon
                  name="trash"
                  label={translate('coreFinance.categories.delete')}
                  color={colorTokens.raw["C04B45"]}
                  size="sm"
                  decorative
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Chevron for selection/detail lists ── */}
        {onPress && isGrouped ? (
          <View style={styles.chevron}>
            <Text style={[styles.chevronText, { color: theme.colors.textSecondary }]}>
              {isRtl ? '‹' : '›'}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  physicalLtr: { ...layoutDirectionStyle('ltr'), display: 'flex', writingDirection: 'ltr' },

  // Standalone card (list view)
  standalone: {
    borderWidth: 1,
    marginBottom: spacing.sm,
    shadowColor: colorTokens.raw["000"],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    borderRadius: radius.group
  },
  grouped: {
    marginBottom: 0
  },
  groupedFirst: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg
  },
  groupedMiddle: {
    borderTopWidth: 0,
    borderRadius: 0
  },
  groupedLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0
  },
  groupedOnly: {
    borderRadius: radius.group
  },

  // Grouped card styles (used in detail / picker)
  card: {
    overflow: 'hidden'
  },

  inner: {
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },

  // Icon badge
  iconBadge: {
    alignItems: 'center',
    borderRadius: radius.control,
    height: 48,
    justifyContent: 'center',
    width: 48,
    flexShrink: 0
  },
  iconImage: {
    height: 32,
    width: 32
  },
  iconEmoji: {
    fontSize: 24
  },

  // Text
  textBlock: {
    flex: 1,
    gap: 3,
    justifyContent: 'center'
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
    lineHeight: 22
  },
  categoryMeta: {
    fontSize: 12,
    lineHeight: 17
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 2
  },

  // Trailing Actions
  trailingActions: {
    alignItems: 'center',
    gap: spacing.xs
  },
  actionBtn: {
    alignItems: 'center',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48
  },

  // Chevron
  chevron: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20
  },
  chevronText: {
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 24
  }
});
