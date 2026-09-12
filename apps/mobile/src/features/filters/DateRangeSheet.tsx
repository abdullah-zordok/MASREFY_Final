import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/design-system/components/ActionButton';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import {
  colorTokens,
  elevation,
  minTouchTarget,
  radius,
  spacing
} from '@/design-system/tokens';
import { localDateInTimeZone } from '@/domain/financial-period';
import { daysBetween, type LocalDate } from '@/domain/financial-planning';
import { TransactionDateField } from '@/features/transactions/TransactionDateField';
import { translate, translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import {
  customPeriodFromDates,
  formatDaySpan,
  lastMonthPeriod,
  lastWeekPeriod,
  thisMonthPeriod,
  thisWeekPeriod,
  todayPeriod,
  yesterdayPeriod,
  type DatePeriod
} from './date-period';

type Step = 'choose' | 'custom';

export function DateRangeSheet({
  visible,
  period,
  onApply,
  onDismiss
}: {
  visible: boolean;
  period: DatePeriod;
  onApply: (period: DatePeriod) => void;
  onDismiss: () => void;
}) {
  const locale = usePreferenceStore((state) => state.locale);
  const direction = usePreferenceStore((state) => state.direction);
  const timeZone = usePreferenceStore((state) => state.timeZone);
  const monthStartDay = usePreferenceStore((state) => state.monthStartDay);
  const theme = useTheme();
  const [step, setStep] = useState<Step>('choose');
  const [startDate, setStartDate] = useState<LocalDate>(() =>
    localDateInTimeZone(period.periodStart, timeZone)
  );
  const [endDate, setEndDate] = useState<LocalDate>(() =>
    localDateInTimeZone(period.periodEnd, timeZone)
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;
    setStep('choose');
    setStartDate(localDateInTimeZone(period.periodStart, timeZone));
    setEndDate(localDateInTimeZone(period.periodEnd, timeZone));
    setNow(Date.now());
  }, [visible, period.periodStart, period.periodEnd, timeZone]);
  const periodContext = useMemo(
    () => ({ timeZone, monthStartDay }),
    [monthStartDay, timeZone]
  );

  const today = useMemo(
    () => todayPeriod(now, periodContext),
    [now, periodContext]
  );
  const yesterday = useMemo(
    () => yesterdayPeriod(now, periodContext),
    [now, periodContext]
  );
  const thisWeek = useMemo(
    () => thisWeekPeriod(now, periodContext),
    [now, periodContext]
  );
  const lastWeek = useMemo(
    () => lastWeekPeriod(now, periodContext),
    [now, periodContext]
  );
  const thisMonth = useMemo(
    () => thisMonthPeriod(now, periodContext),
    [now, periodContext]
  );
  const lastMonth = useMemo(
    () => lastMonthPeriod(now, periodContext),
    [now, periodContext]
  );

  const isTodaySelected =
    period.periodStart === today.periodStart &&
    period.periodEnd === today.periodEnd;
  const isYesterdaySelected =
    period.periodStart === yesterday.periodStart &&
    period.periodEnd === yesterday.periodEnd;
  const isThisWeekSelected =
    period.periodStart === thisWeek.periodStart &&
    period.periodEnd === thisWeek.periodEnd;
  const isLastWeekSelected =
    period.periodStart === lastWeek.periodStart &&
    period.periodEnd === lastWeek.periodEnd;
  const isThisMonthSelected =
    period.periodStart === thisMonth.periodStart &&
    period.periodEnd === thisMonth.periodEnd;
  const isLastMonthSelected =
    period.periodStart === lastMonth.periodStart &&
    period.periodEnd === lastMonth.periodEnd;

  const isCustomSelected =
    !isTodaySelected &&
    !isYesterdaySelected &&
    !isThisWeekSelected &&
    !isLastWeekSelected &&
    !isThisMonthSelected &&
    !isLastMonthSelected;

  const title =
    step === 'custom'
      ? translate('coreFinance.home.period.custom')
      : translate('coreFinance.home.period.choose');

  return (
    <AppSheet title={title} visible={visible} onDismiss={onDismiss}>
      {step === 'choose' ? (
        <View style={styles.stack}>
          {/* Subtitle / Instruction directly below title */}
          <Text
            style={[
              styles.sheetInstruction,
              {
                color: theme.colors.content.secondary,
                textAlign: direction === 'rtl' ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {translate('coreFinance.home.period.instruction')}
          </Text>

          {/* 1. Custom Range (نطاق مخصص) */}
          <DateRangeOptionRow
            appearance="featured"
            testID="date-period-option-custom"
            title={translate('coreFinance.home.period.custom')}
            subtitle={translate('coreFinance.home.period.customSubtitle')}
            selected={isCustomSelected}
            direction={direction}
            onPress={() => setStep('custom')}
          />

          <View
            testID="date-period-presets"
            style={[
              styles.presetGroup,
              {
                backgroundColor: theme.colors.surfaces.card,
                borderColor: theme.colors.borders.subtle
              }
            ]}
          >
            <DateRangeOptionRow
              appearance="grouped"
              testID="date-period-option-today"
              title={translate('coreFinance.home.period.today')}
              subtitle={formatDaySpan(
                today.periodStart,
                today.periodEnd,
                locale,
                timeZone
              )}
              selected={isTodaySelected}
              direction={direction}
              onPress={() => {
                onApply(today);
                onDismiss();
              }}
            />
            <DateRangeOptionRow
              appearance="grouped"
              testID="date-period-option-yesterday"
              title={translate('coreFinance.home.period.yesterday')}
              subtitle={formatDaySpan(
                yesterday.periodStart,
                yesterday.periodEnd,
                locale,
                timeZone
              )}
              selected={isYesterdaySelected}
              direction={direction}
              onPress={() => {
                onApply(yesterday);
                onDismiss();
              }}
            />
            <DateRangeOptionRow
              appearance="grouped"
              testID="date-period-option-thisWeek"
              title={translate('coreFinance.home.period.thisWeek')}
              subtitle={formatDaySpan(
                thisWeek.periodStart,
                thisWeek.periodEnd,
                locale,
                timeZone
              )}
              selected={isThisWeekSelected}
              direction={direction}
              onPress={() => {
                onApply(thisWeek);
                onDismiss();
              }}
            />
            <DateRangeOptionRow
              appearance="grouped"
              testID="date-period-option-lastWeek"
              title={translate('coreFinance.home.period.lastWeek')}
              subtitle={formatDaySpan(
                lastWeek.periodStart,
                lastWeek.periodEnd,
                locale,
                timeZone
              )}
              selected={isLastWeekSelected}
              direction={direction}
              onPress={() => {
                onApply(lastWeek);
                onDismiss();
              }}
            />
            <DateRangeOptionRow
              appearance="grouped"
              testID="date-period-option-thisMonth"
              title={translate('coreFinance.home.period.thisMonth')}
              subtitle={formatDaySpan(
                thisMonth.periodStart,
                thisMonth.periodEnd,
                locale,
                timeZone
              )}
              selected={isThisMonthSelected}
              direction={direction}
              onPress={() => {
                onApply(thisMonth);
                onDismiss();
              }}
            />
            <DateRangeOptionRow
              appearance="grouped-last"
              testID="date-period-option-lastMonth"
              title={translate('coreFinance.home.period.lastMonth')}
              subtitle={formatDaySpan(
                lastMonth.periodStart,
                lastMonth.periodEnd,
                locale,
                timeZone
              )}
              selected={isLastMonthSelected}
              direction={direction}
              onPress={() => {
                onApply(lastMonth);
                onDismiss();
              }}
            />
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <BackAction direction={direction} onPress={() => setStep('choose')} />
          <TransactionDateField
            label={translate('coreFinance.filters.periodStart')}
            value={pickerDateValue(startDate)}
            onChange={(value) => setStartDate(localDateFromPicker(value))}
          />
          <TransactionDateField
            label={translate('coreFinance.filters.periodEnd')}
            value={pickerDateValue(endDate)}
            onChange={(value) => setEndDate(localDateFromPicker(value))}
          />
          {startDate <= endDate ? (
            <Text
              style={[
                styles.duration,
                {
                  color: theme.colors.content.secondary,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translateDynamic('coreFinance.home.period.duration', {
                count: selectedDayCount(startDate, endDate)
              })}
            </Text>
          ) : (
            <Text
              style={[
                styles.duration,
                {
                  color: theme.colors.status.danger,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {translate('coreFinance.filters.dateRangeInvalid')}
            </Text>
          )}
          <ActionButton
            label={translate('coreFinance.home.period.apply')}
            disabled={startDate > endDate}
            onPress={() => {
              onApply(customPeriodFromDates(startDate, endDate, periodContext));
              onDismiss();
            }}
          />
        </View>
      )}
    </AppSheet>
  );
}

function DateRangeOptionRow({
  appearance,
  testID,
  title,
  subtitle,
  selected,
  direction,
  onPress
}: {
  appearance: 'featured' | 'grouped' | 'grouped-last';
  testID: string;
  title: string;
  subtitle: string;
  selected: boolean;
  direction: 'rtl' | 'ltr';
  onPress: () => void;
}) {
  const isRtl = direction === 'rtl';
  const theme = useTheme();
  const featured = appearance === 'featured';

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={`${title}, ${subtitle}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        styles.physicalLtr,
        featured ? styles.featuredOption : styles.groupedOption,
        appearance === 'grouped-last' && styles.groupedLastOption,
        {
          backgroundColor: selected
            ? theme.colors.surfaces.brandSubtle
            : theme.colors.surfaces.card,
          borderColor: selected
            ? theme.colors.borders.selected
            : theme.colors.borders.subtle,
          flexDirection: isRtl ? 'row-reverse' : 'row'
        },
        pressed && {
          backgroundColor: colorTokens.sand['200']
        }
      ]}
    >
      {/* 1. START of reading: Content Group (Calendar icon badge + Text Stack) */}
      <View
        style={[
          styles.contentGroup,
          styles.physicalLtr,
          { flexDirection: isRtl ? 'row-reverse' : 'row' }
        ]}
      >
        {/* Calendar Icon Badge */}
        {featured ? (
          <View testID="date-period-icon-custom" style={styles.iconBadge}>
            <DesignIcon
              name="calendar"
              size="sm"
              label={title}
              color={colorTokens.teal['700']}
              direction={direction}
              decorative
            />
          </View>
        ) : null}

        {/* Text Stack */}
        <View style={styles.textStack}>
          <Text
            style={[
              styles.optionTitle,
              {
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.optionSubtitle,
              {
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      {/* 2. END of reading: Radio Selection Indicator */}
      <View
        style={[
          styles.radioOuter,
          {
            borderColor: selected
              ? colorTokens.teal['700']
              : colorTokens.sand['400'],
            borderWidth: selected ? 2 : 1.5
          }
        ]}
      >
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

function BackAction({
  direction,
  onPress
}: {
  direction: 'rtl' | 'ltr';
  onPress: () => void;
}) {
  const theme = useTheme();
  const label = translate('appShell.navigation.back');
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.back,
        { alignSelf: direction === 'rtl' ? 'flex-end' : 'flex-start' }
      ]}
    >
      <DesignIcon
        name="back"
        label={label}
        color={theme.colors.content.link}
        direction={direction}
        decorative
      />
    </Pressable>
  );
}

function selectedDayCount(startDate: LocalDate, endDate: LocalDate): number {
  return daysBetween(startDate, endDate) + 1;
}

function pickerDateValue(localDate: LocalDate): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12).getTime();
}

function localDateFromPicker(timestamp: number): LocalDate {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-') as LocalDate;
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  sheetInstruction: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: spacing.xs
  },
  optionCard: {
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  featuredOption: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64
  },
  presetGroup: {
    ...elevation.raised,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden'
  },
  groupedOption: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56
  },
  groupedLastOption: { borderBottomWidth: 0 },
  contentGroup: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    minWidth: 0
  },
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    writingDirection: 'ltr'
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal['50'],
    borderColor: colorTokens.teal['100'],
    borderRadius: radius.md,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  textStack: {
    flex: 1,
    gap: 2,
    minWidth: 0
  },
  optionTitle: {
    color: colorTokens.ink['900'],
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20
  },
  optionSubtitle: {
    color: colorTokens.ink['500'],
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16
  },
  radioOuter: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22
  },
  radioInner: {
    backgroundColor: colorTokens.teal['700'],
    borderRadius: 5,
    height: 10,
    width: 10
  },
  back: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: minTouchTarget,
    width: minTouchTarget
  },
  duration: {
    fontSize: 13,
    lineHeight: 20
  }
});
