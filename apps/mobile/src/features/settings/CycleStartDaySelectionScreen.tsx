import React, { useMemo } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { SelectionScreen } from '@/design-system/components/selection/SelectionScreen';
import type { SelectionItem, SelectionItemRenderProps } from '@/design-system/components/selection/selection-types';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens, elevation, radius, spacing } from '@/design-system/tokens';
import {
  calculateCycleDateRange,
  formatDayOrdinal,
  SUPPORTED_CYCLE_START_DAYS
} from '@/domain/cycle-start';
import { currentLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';

export function CycleStartDaySelectionScreen({
  selectedDay,
  onSelectDay,
  onBack
}: {
  selectedDay?: number;
  onSelectDay?: (day: number) => void;
  onBack?: () => void;
}) {
  const locale = currentLocale();
  const largeText = PixelRatio.getFontScale() >= 1.5;
  const globalMonthStartDay = usePreferenceStore((state) => state.monthStartDay);
  const setMonthStartDay = usePreferenceStore((state) => state.setMonthStartDay);

  const activeDay = selectedDay ?? globalMonthStartDay;

  const items: SelectionItem<number>[] = useMemo(() => {
    const now = new Date();
    return SUPPORTED_CYCLE_START_DAYS.map((day) => {
      const range = calculateCycleDateRange(day, now, locale);
      return {
        id: day,
        title: formatDayOrdinal(day, locale),
        subtitle: range.formattedRange,
        metadata: { range }
      };
    });
  }, [locale]);

  const handleSelect = (item: SelectionItem<number>) => {
    if (onSelectDay) {
      onSelectDay(item.id);
    } else {
      setMonthStartDay(item.id);
      if (onBack) {
        onBack();
      } else {
        router.back();
      }
    }
  };

  const renderDayItem = ({
    item,
    isSelected,
    onPress,
    theme
  }: SelectionItemRenderProps<number>) => {
    const range = item.metadata?.range as
      | ReturnType<typeof calculateCycleDateRange>
      | undefined;
    const isSingleMonth = range && range.startMonthName === range.endMonthName;

    return (
      <Pressable
        key={item.id}
        testID={`cycle-start-day-${item.id}`}
        accessibilityLabel={`${item.title}, ${item.subtitle}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.dayCard,
          {
            backgroundColor: isSelected
              ? theme.colors.surfaces.brandSubtle
              : pressed
                ? theme.colors.surfaceMuted
                : theme.colors.surfaces.card,
            borderColor: isSelected
              ? colorTokens.teal[300]
              : theme.colors.borders.default,
            borderWidth: isSelected ? 1.5 : 1
          }
        ]}
      >
        {/* Day Number Header */}
        <View style={styles.numberRow}>
          <Text
            style={[
              styles.dayTitle,
              {
                color: isSelected
                  ? colorTokens.teal[900]
                  : theme.colors.content.primary
              }
            ]}
          >
            {item.title}
          </Text>

          {isSelected ? (
            <View style={styles.checkCircle}>
              <DesignIcon
                name="check"
                label="Selected"
                color={colorTokens.raw["FFFFFF"]}
                size="xs"
                decorative
              />
            </View>
          ) : null}
        </View>

        {/* Structured Date Range */}
        {range ? (
          <View style={styles.rangeContainer}>
            {isSingleMonth ? (
              <Text
                testID={`cycle-start-range-${item.id}`}
                numberOfLines={largeText ? undefined : 1}
                style={[
                  styles.dayRangeSingle,
                  {
                    color: isSelected
                      ? colorTokens.teal[800]
                      : theme.colors.content.secondary
                  }
                ]}
              >
                {range.compactRange}
              </Text>
            ) : (
              <>
                <Text
                  testID={`cycle-start-range-${item.id}`}
                  numberOfLines={largeText ? undefined : 1}
                  style={[
                    styles.dayRangeLine,
                    {
                      color: isSelected
                        ? colorTokens.teal[800]
                        : theme.colors.content.secondary
                    }
                  ]}
                >
                  {range.startLabel}
                </Text>
                <Text
                  numberOfLines={largeText ? undefined : 1}
                  style={[
                    styles.dayRangeLine,
                    {
                      color: isSelected
                        ? colorTokens.teal[700]
                        : theme.colors.content.muted
                    }
                  ]}
                >
                  {range.endLabel}
                </Text>
              </>
            )}
          </View>
        ) : item.subtitle ? (
          <Text
            testID={`cycle-start-range-${item.id}`}
            numberOfLines={largeText ? undefined : 2}
            style={[
              styles.dayRangeSingle,
              {
                color: isSelected
                  ? colorTokens.teal[800]
                  : theme.colors.content.muted
              }
            ]}
          >
            {item.subtitle}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SelectionScreen<number>
      title={translate('settings.application.monthStartScreenTitle')}
      subtitle={translate('settings.application.monthStartSubtitle')}
      items={items}
      selectedId={activeDay}
      onSelect={handleSelect}
      onBack={onBack}
      layoutMode="grid"
      numColumns={largeText ? 2 : 4}
      renderItem={renderDayItem}
    />
  );
}

const styles = StyleSheet.create({
  dayCard: {
    ...elevation.card,
    alignItems: 'center',
    borderRadius: radius.card,
    gap: 3,
    justifyContent: 'space-between',
    minHeight: 74,
    paddingHorizontal: 4,
    paddingVertical: spacing.sm
  },
  numberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center'
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24
  },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal[600],
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    width: 16
  },
  rangeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1
  },
  dayRangeSingle: {
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
    textAlign: 'center'
  },
  dayRangeLine: {
    fontSize: 10,
    fontWeight: '500',
    lineHeight: 13,
    textAlign: 'center'
  }
});
