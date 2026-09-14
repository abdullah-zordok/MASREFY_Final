import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';

import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, radius, spacing } from '@/design-system/tokens';
import { translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { SelectionGrid } from './SelectionGrid';
import { SelectionList } from './SelectionList';
import type { SelectionScreenProps } from './selection-types';

export function SelectionScreen<T = string>({
  title,
  subtitle,
  items,
  selectedId,
  onSelect,
  onBack,
  searchable = false,
  searchPlaceholder,
  searchQuery: externalQuery,
  onSearchChange: externalOnSearchChange,
  searchFilter,
  layoutMode = 'list',
  numColumns = 4,
  renderItem,
  headerAction,
  emptyStateText
}: SelectionScreenProps<T>) {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  const [internalQuery, setInternalQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const query = externalQuery !== undefined ? externalQuery : internalQuery;
  const setQuery =
    externalOnSearchChange !== undefined
      ? externalOnSearchChange
      : setInternalQuery;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchable || !query.trim()) {
      return items;
    }
    const q = query.trim().toLowerCase();
    if (searchFilter) {
      return items.filter((item) => searchFilter(item, query));
    }
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q))
    );
  }, [items, query, searchable, searchFilter]);

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.surfaces.page }]}
    >
      {/* Top Header Navigation Bar */}
      <View
        testID="selection-header"
        style={[
          styles.headerBar,
          layoutDirectionStyle(direction),
          { flexDirection: 'row' }
        ]}
      >
        <Pressable
          accessibilityLabel={translate('common.back')}
          accessibilityRole="button"
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backButton}
        >
          <DesignIcon
            name="back"
            label="Back"
            color={theme.colors.content.primary}
            direction={direction}
            size="md"
            decorative
          />
        </Pressable>

        <View style={styles.headerSpacer} />

        {headerAction ? <View>{headerAction}</View> : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title & Subtitle Header */}
        <View
          testID="selection-title-section"
          style={[
            styles.titleSection,
            layoutDirectionStyle(direction),
            { alignItems: 'flex-start' }
          ]}
        >
          <Text
            testID="selection-title"
            style={[
              styles.title,
              {
                color: theme.colors.content.primary,
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              testID="selection-subtitle"
              style={[
                styles.subtitle,
                {
                  color: theme.colors.content.secondary,
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        {/* Search Bar */}
        {searchable ? (
          <View
            style={[
              styles.searchBar,
              layoutDirectionStyle(direction),
              {
                backgroundColor: theme.colors.surface,
                borderColor: isSearchFocused
                  ? colorTokens.teal[600]
                  : theme.colors.borders.subtle,
                flexDirection: 'row'
              }
            ]}
          >
            <DesignIcon
              name="search"
              label="Search"
              color={
                isSearchFocused
                  ? colorTokens.teal[600]
                  : theme.colors.content.muted
              }
              size="sm"
              decorative
            />
            <TextInput
              testID="selection-search-input"
              value={query}
              onChangeText={setQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder={
                searchPlaceholder ?? translate('common.searchPlaceholder')
              }
              placeholderTextColor={theme.colors.content.muted}
              style={[
                styles.searchInput,
                {
                  color: theme.colors.content.primary,
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            />
            {query.length > 0 ? (
              <Pressable
                accessibilityLabel={translate('common.clearSearch')}
                accessibilityRole="button"
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.clearButton}
              >
                <DesignIcon
                  name="close"
                  label="Clear"
                  color={theme.colors.content.muted}
                  size="sm"
                  decorative
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* List or Grid items */}
        {layoutMode === 'grid' ? (
          <SelectionGrid
            items={filteredItems}
            selectedId={selectedId}
            numColumns={numColumns}
            onSelect={onSelect}
            renderItem={renderItem}
            direction={direction}
            emptyStateText={emptyStateText}
          />
        ) : (
          <SelectionList
            items={filteredItems}
            selectedId={selectedId}
            onSelect={onSelect}
            renderItem={renderItem}
            direction={direction}
            emptyStateText={emptyStateText}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  headerBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    width: 40,
    borderRadius: 20
  },
  headerSpacer: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: spacing.xxl
  },
  titleSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: 4
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20
  },
  searchBar: {
    alignItems: 'center',
    borderRadius: radius.overlay,
    borderWidth: 1,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    height: 48,
    paddingHorizontal: spacing.md,
    shadowColor: colorTokens.raw['103F37'],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
    paddingVertical: 0
  },
  clearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28
  }
});
