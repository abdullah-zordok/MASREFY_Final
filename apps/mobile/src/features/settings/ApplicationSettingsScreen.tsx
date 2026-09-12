import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { layoutDirectionStyle } from '@/design-system/direction';
import { StyledText } from '@/components/StyledText';
import { ChipSelector } from '@/design-system/components/forms/ChipControls';
import { SwitchRow } from '@/design-system/components/forms/SelectionControls';
import { AppBar } from '@/design-system/components/navigation/AppNavigation';
import { DesignIcon } from '@/design-system/icons';
import { radius, spacing } from '@/design-system/tokens';
import { translateDynamic } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatDayOrdinal } from '@/domain/cycle-start';
import { useAccounts } from '@/features/core-finance/core-finance-queries';
import type { Account } from '@/domain/core-finance';
import { colorTokens } from '@/design-system/tokens';

export function ApplicationSettingsScreen() {
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const isRtl = direction === 'rtl';

  const locale = usePreferenceStore((state) => state.locale);
  const setLocale = usePreferenceStore((state) => state.setLocale);

  const baseCurrencyCode = usePreferenceStore(
    (state) => state.baseCurrencyCode
  );
  const monthStartDay = usePreferenceStore((state) => state.monthStartDay);
  const firstDayOfWeek = usePreferenceStore((state) => state.firstDayOfWeek);
  const defaultAccountId = usePreferenceStore(
    (state) => state.defaultAccountId
  );
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const toggleHideBalances = usePreferenceStore(
    (state) => state.toggleHideBalances
  );
  const update = usePreferenceStore(
    (state) => state.updateApplicationPreferences
  );

  const accountsQuery = useAccounts(true);
  const accounts: Account[] = accountsQuery.data ?? [];
  const selectedAccount = accounts.find((acc) => acc.id === defaultAccountId);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const t = (key: string) => translateDynamic(key, {}, locale);

  const languages = ['ar', 'en'] as const;
  const languageLabels = languages.map((value) =>
    t(`settings.application.language.${value}`)
  );

  const weekStarts = ['sunday', 'monday', 'saturday'] as const;
  const weekStartLabels = weekStarts.map((value) =>
    t(`notifications.preferences.day.${value}`)
  );

  return (
    <ScrollView
      contentContainerStyle={[
        styles.stack,
        { backgroundColor: theme.colors.surfaces.page }
      ]}
    >
      <AppBar
        title={t('settings.application.title')}
        onBack={() => router.back()}
        direction={direction}
      />

      {/* Section 1: Regional Preferences (Language & Week Start) */}
      <View
        testID="application-settings-regional-group"
        style={[
          styles.sectionWrapper,
          styles.physicalLtr,
          { alignItems: isRtl ? 'flex-end' : 'flex-start' }
        ]}
      >
        <StyledText
          style={[
            styles.sectionHeading,
            { textAlign: isRtl ? 'right' : 'left', writingDirection: direction }
          ]}
          variant="caption"
        >
          {t('settings.application.regionalGroup')}
        </StyledText>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }
          ]}
        >
          {/* 1. Language */}
          <View style={styles.fieldGroup}>
            <StyledText
              style={[
                styles.fieldLabel,
                {
                  alignSelf: isRtl ? 'flex-end' : 'flex-start',
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
              variant="body"
            >
              {t('settings.application.language')}
            </StyledText>
            <ChipSelector
              options={languageLabels}
              selected={[t(`settings.application.language.${locale}`)]}
              onToggle={(label) =>
                setLocale(languages[languageLabels.indexOf(label)] ?? locale)
              }
            />
          </View>

          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />

          {/* 2. First Day of Week */}
          <View style={styles.fieldGroup}>
            <StyledText
              style={[
                styles.fieldLabel,
                {
                  alignSelf: isRtl ? 'flex-end' : 'flex-start',
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
              variant="body"
            >
              {t('settings.application.weekStart')}
            </StyledText>
            <ChipSelector
              options={weekStartLabels}
              selected={[t(`notifications.preferences.day.${firstDayOfWeek}`)]}
              onToggle={(label) =>
                update({
                  firstDayOfWeek:
                    weekStarts[weekStartLabels.indexOf(label)] ?? firstDayOfWeek
                })
              }
            />
          </View>

          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />

          {/* 3. Currency */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('settings.application.currency')}, ${baseCurrencyCode}`}
            onPress={() => router.push('/settings/currency')}
            style={({ pressed }) => [
              styles.navRow,
              styles.physicalLtr,
              {
                flexDirection: isRtl ? 'row-reverse' : 'row',
                backgroundColor: pressed
                  ? theme.colors.surfaceMuted
                  : 'transparent'
              }
            ]}
          >
            <View
              style={[
                styles.navRowLeft,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colorTokens.raw['E3F7F2'] }
                ]}
              >
                <DesignIcon
                  name="accounts"
                  label="Currency"
                  color={colorTokens.raw['0F6B58']}
                  size="md"
                  direction={direction}
                  decorative
                />
              </View>
              <StyledText
                style={[
                  styles.navRowTitle,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {t('settings.application.currency')}
              </StyledText>
            </View>

            <View
              style={[
                styles.navRowRight,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <StyledText
                style={[
                  styles.navRowValue,
                  { color: theme.colors.content.secondary }
                ]}
              >
                {baseCurrencyCode}
              </StyledText>
              <DesignIcon
                name="chevronEnd"
                label="Open"
                color={theme.colors.content.muted}
                size="sm"
                direction={direction}
                decorative
              />
            </View>
          </Pressable>

          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />

          {/* 4. Month Start Day */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('settings.application.monthStart')}, ${formatDayOrdinal(monthStartDay, locale)}`}
            onPress={() => router.push('/settings/month-start')}
            style={({ pressed }) => [
              styles.navRow,
              styles.physicalLtr,
              {
                flexDirection: isRtl ? 'row-reverse' : 'row',
                backgroundColor: pressed
                  ? theme.colors.surfaceMuted
                  : 'transparent'
              }
            ]}
          >
            <View
              style={[
                styles.navRowLeft,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <View
                style={[
                  styles.iconBadge,
                  { backgroundColor: colorTokens.raw['F3EEF9'] }
                ]}
              >
                <DesignIcon
                  name="tracking"
                  label="Month Start"
                  color={colorTokens.raw['68469C']}
                  size="md"
                  direction={direction}
                  decorative
                />
              </View>
              <StyledText
                style={[
                  styles.navRowTitle,
                  {
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              >
                {t('settings.application.monthStart')}
              </StyledText>
            </View>

            <View
              style={[
                styles.navRowRight,
                styles.physicalLtr,
                { flexDirection: isRtl ? 'row-reverse' : 'row' }
              ]}
            >
              <StyledText
                style={[
                  styles.navRowValue,
                  { color: theme.colors.content.secondary }
                ]}
              >
                {formatDayOrdinal(monthStartDay, locale)}
              </StyledText>
              <DesignIcon
                name="chevronEnd"
                label="Open"
                color={theme.colors.content.muted}
                size="sm"
                direction={direction}
                decorative
              />
            </View>
          </Pressable>
        </View>
      </View>

      {/* Section 2: Account & Privacy (Default Account Dropdown & Hide Balances) */}
      <View
        style={[
          styles.sectionWrapper,
          styles.physicalLtr,
          { alignItems: isRtl ? 'flex-end' : 'flex-start' }
        ]}
      >
        <StyledText
          style={[
            styles.sectionHeading,
            { textAlign: isRtl ? 'right' : 'left', writingDirection: direction }
          ]}
          variant="caption"
        >
          {t('settings.application.accountDisplayGroup')}
        </StyledText>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }
          ]}
        >
          {/* 3. Default Account Dropdown */}
          <View style={styles.fieldGroup}>
            <StyledText
              style={[
                styles.fieldLabel,
                {
                  alignSelf: isRtl ? 'flex-end' : 'flex-start',
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
              variant="body"
            >
              {t('settings.application.defaultAccount')}
            </StyledText>

            {/* Dropdown Trigger Box */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('settings.application.defaultAccount')} ${
                selectedAccount?.name ??
                t('settings.application.defaultAccount.placeholder')
              }`}
              accessibilityState={{ expanded: isDropdownOpen }}
              onPress={() => setIsDropdownOpen(!isDropdownOpen)}
              style={({ pressed }) => [
                styles.dropdownTrigger,
                {
                  borderColor: isDropdownOpen
                    ? colorTokens.raw['103F37']
                    : theme.colors.border,
                  backgroundColor: isDropdownOpen
                    ? colorTokens.raw['F6FAF8']
                    : colorTokens.raw['FAFCFB'],
                  flexDirection: isRtl ? 'row-reverse' : 'row'
                },
                pressed && { opacity: 0.85 }
              ]}
            >
              <View
                style={[
                  styles.dropdownTriggerLeft,
                  { flexDirection: isRtl ? 'row-reverse' : 'row' }
                ]}
              >
                <View style={styles.dropdownIconBadge}>
                  <DesignIcon
                    name="accounts"
                    label="Account"
                    color={colorTokens.raw['1F7A5A']}
                    size="control"
                    decorative
                  />
                </View>
                <View
                  style={[
                    styles.dropdownTriggerTexts,
                    { alignItems: isRtl ? 'flex-end' : 'flex-start' }
                  ]}
                >
                  <StyledText
                    style={[
                      styles.dropdownSelectedText,
                      {
                        textAlign: isRtl ? 'right' : 'left',
                        writingDirection: direction
                      }
                    ]}
                    variant="body"
                  >
                    {selectedAccount?.name ??
                      t('settings.application.defaultAccount.placeholder')}
                  </StyledText>
                  {selectedAccount ? (
                    <StyledText style={styles.subtext}>
                      {selectedAccount.currencyCode}
                      {selectedAccount.lastFour
                        ? ` · ****${selectedAccount.lastFour}`
                        : ''}
                    </StyledText>
                  ) : null}
                </View>
              </View>

              <DesignIcon
                name="chevronDown"
                label="Expand"
                color={colorTokens.raw['707870']}
                size="control"
                decorative
              />
            </Pressable>

            {/* Dropdown Menu Items */}
            {isDropdownOpen ? (
              <View
                style={[
                  styles.dropdownMenu,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border
                  }
                ]}
              >
                {/* Option: None / No default account */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'settings.application.defaultAccount.none'
                  )}
                  accessibilityState={{ selected: !defaultAccountId }}
                  onPress={() => {
                    update({ defaultAccountId: null });
                    setIsDropdownOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.dropdownItem,
                    { flexDirection: isRtl ? 'row-reverse' : 'row' },
                    !defaultAccountId && styles.dropdownItemActive,
                    pressed && { backgroundColor: colorTokens.raw['F0F6F3'] }
                  ]}
                >
                  <StyledText
                    style={[
                      styles.dropdownItemText,
                      !defaultAccountId && styles.dropdownItemTextActive
                    ]}
                  >
                    {t('settings.application.defaultAccount.none')}
                  </StyledText>
                  {!defaultAccountId ? (
                    <DesignIcon
                      name="check"
                      label="Selected"
                      color={colorTokens.raw['103F37']}
                      size="sm"
                      decorative
                    />
                  ) : null}
                </Pressable>

                {/* Options: List of user accounts */}
                {accounts.map((acc) => {
                  const isSelected = acc.id === defaultAccountId;
                  return (
                    <Pressable
                      key={acc.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${acc.name}, ${acc.currencyCode}`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        update({ defaultAccountId: acc.id });
                        setIsDropdownOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.dropdownItem,
                        { flexDirection: isRtl ? 'row-reverse' : 'row' },
                        isSelected && styles.dropdownItemActive,
                        pressed && {
                          backgroundColor: colorTokens.raw['F0F6F3']
                        }
                      ]}
                    >
                      <View
                        style={[
                          styles.dropdownItemTextStack,
                          { alignItems: isRtl ? 'flex-end' : 'flex-start' }
                        ]}
                      >
                        <StyledText
                          style={[
                            styles.dropdownItemText,
                            isSelected && styles.dropdownItemTextActive
                          ]}
                        >
                          {acc.name}
                        </StyledText>
                        <StyledText style={styles.dropdownItemSub}>
                          {acc.currencyCode}
                        </StyledText>
                      </View>
                      {isSelected ? (
                        <DesignIcon
                          name="check"
                          label="Selected"
                          color={colorTokens.raw['103F37']}
                          size="sm"
                          decorative
                        />
                      ) : null}
                    </Pressable>
                  );
                })}

                {accounts.length === 0 ? (
                  <View style={styles.emptyItem}>
                    <StyledText style={styles.subtext}>
                      {t('settings.application.defaultAccount.empty')}
                    </StyledText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <View
            style={[styles.divider, { backgroundColor: theme.colors.border }]}
          />

          {/* 4. Hide Balances Row */}
          <SwitchRow
            label="settings.application.hideBalances"
            subtext="settings.application.hideBalancesSubtitle"
            icon={hideBalances ? 'eyeSlash' : 'eye'}
            iconBg={colorTokens.raw['EBF5EC']}
            iconFg={colorTokens.raw['1F7A5A']}
            value={hideBalances}
            onValueChange={toggleHideBalances}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  sectionWrapper: {
    gap: spacing.xs
  },
  sectionHeading: {
    color: colorTokens.raw['707870'],
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4
  },
  card: {
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
    width: '100%'
  },
  fieldGroup: {
    gap: spacing.xs
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colorTokens.raw['10231F']
  },
  subtext: {
    fontSize: 12,
    color: colorTokens.raw['707870'],
    lineHeight: 16
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2
  },
  dropdownTrigger: {
    ...layoutDirectionStyle('ltr'),
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52
  },
  dropdownTriggerLeft: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1
  },
  dropdownIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colorTokens.raw['EBF5EC'],
    alignItems: 'center',
    justifyContent: 'center'
  },
  dropdownTriggerTexts: {
    flex: 1,
    gap: 2
  },
  dropdownSelectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colorTokens.raw['10231F']
  },
  dropdownMenu: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colorTokens.raw['000'],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1
  },
  dropdownItem: {
    ...layoutDirectionStyle('ltr'),
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colorTokens.raw['F0F4F2'],
    minHeight: 46
  },
  dropdownItemActive: {
    backgroundColor: colorTokens.raw['F3F9F6']
  },
  dropdownItemTextStack: {
    flex: 1,
    gap: 2
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: colorTokens.raw['2A332F']
  },
  dropdownItemTextActive: {
    fontWeight: '700',
    color: colorTokens.raw['103F37']
  },
  dropdownItemSub: {
    fontSize: 12,
    color: colorTokens.raw['707870']
  },
  emptyItem: {
    padding: spacing.md,
    alignItems: 'center'
  },
  hideBalancesRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    gap: spacing.md
  },
  hideBalancesLeft: {
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1
  },
  badgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colorTokens.raw['EBF5EC'],
    alignItems: 'center',
    justifyContent: 'center'
  },
  hideBalancesTexts: {
    flex: 1,
    gap: 2
  },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center'
  },
  switchTrackOn: {
    backgroundColor: colorTokens.raw['103F37']
  },
  switchTrackOff: {
    backgroundColor: colorTokens.raw['DDE5E1']
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colorTokens.raw['FFFFFF'],
    shadowColor: colorTokens.raw['000000'],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2
  },
  switchThumbOn: {
    alignSelf: 'flex-end'
  },
  switchThumbOff: {
    alignSelf: 'flex-start'
  },
  physicalLtr: {
    ...layoutDirectionStyle('ltr'),
    display: 'flex',
    writingDirection: 'ltr'
  },
  navRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 64
  },
  navRowLeft: {
    alignItems: 'center',
    gap: spacing.md,
    flex: 1
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  navRowTexts: {
    flex: 1,
    gap: 2
  },
  navRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colorTokens.raw['10231F']
  },
  navRowRight: {
    alignItems: 'center',
    gap: spacing.xs
  },
  navRowValue: {
    fontSize: 14,
    fontWeight: '600'
  }
});
