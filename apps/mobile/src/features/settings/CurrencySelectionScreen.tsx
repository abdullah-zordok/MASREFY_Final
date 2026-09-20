import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { layoutDirectionStyle } from '@/design-system/direction';
import { CurrencyFlagIcon } from '@/design-system/components/currency/CurrencyFlagIcon';
import { SelectionScreen } from '@/design-system/components/selection/SelectionScreen';
import type {
  SelectionItem,
  SelectionItemRenderProps
} from '@/design-system/components/selection/selection-types';
import { DesignIcon } from '@/design-system/icons';
import {
  colorTokens,
  elevation,
  radius,
  spacing
} from '@/design-system/tokens';
import {
  type CurrencyItem,
  getCurrencySymbol,
  matchesCurrencySearch,
  supportedCurrencies
} from '@/domain/currencies';
import { currentLocale, translate } from '@/localization/i18n';
import { usePreferenceStore } from '@/state/preferences';

export function CurrencySelectionScreen({
  selectedCurrencyCode,
  onSelectCurrency,
  onBack
}: {
  selectedCurrencyCode?: string;
  onSelectCurrency?: (code: string) => void;
  onBack?: () => void;
}) {
  const locale = currentLocale();
  const globalBaseCurrency = usePreferenceStore(
    (state) => state.baseCurrencyCode
  );
  const setBaseCurrency = usePreferenceStore(
    (state) => state.setBaseCurrencyCode
  );

  const activeCurrency = selectedCurrencyCode ?? globalBaseCurrency;

  const items: SelectionItem<string>[] = useMemo(() => {
    return supportedCurrencies.map((c) => ({
      id: c.code,
      title: locale === 'ar' ? c.nameAr : c.nameEn,
      subtitle: c.code,
      icon: c.flag,
      metadata: { currency: c }
    }));
  }, [locale]);

  const handleSelect = (item: SelectionItem<string>) => {
    if (onSelectCurrency) {
      onSelectCurrency(item.id);
    } else {
      setBaseCurrency(item.id);
      if (onBack) {
        onBack();
      } else {
        router.back();
      }
    }
  };

  const renderCurrencyItem = ({
    item,
    isSelected,
    onPress,
    direction,
    theme
  }: SelectionItemRenderProps<string>) => {
    const isRtl = direction === 'rtl';
    const currency = item.metadata?.currency as CurrencyItem | undefined;
    const flag = currency?.flag ?? item.icon;
    const name = item.title;
    const code = item.subtitle;
    const symbol = currency ? getCurrencySymbol(currency, locale) : code;

    return (
      <Pressable
        key={item.id}
        testID={`currency-selection-row-${item.id}`}
        accessibilityLabel={`${flag} ${name}, ${code}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          layoutDirectionStyle(direction),
          {
            backgroundColor: isSelected
              ? theme.colors.surfaces.brandSubtle
              : pressed
                ? theme.colors.surfaceMuted
                : theme.colors.surfaces.card,
            borderColor: isSelected
              ? colorTokens.teal[300]
              : theme.colors.borders.default,
            borderWidth: 1,
            flexDirection: 'row'
          }
        ]}
      >
        {/* Flag Badge + Name + Code Side */}
        <View
          style={[
            styles.identitySection,
            layoutDirectionStyle(direction),
            {
              flexDirection: 'row',
              alignItems: 'center'
            }
          ]}
        >
          <CurrencyFlagIcon code={item.id} size={36} />

          <View
            style={[
              styles.textContainer,
              { alignItems: isRtl ? 'flex-end' : 'flex-start' }
            ]}
          >
            <Text
              style={[
                styles.nameText,
                {
                  color: isSelected
                    ? colorTokens.teal[900]
                    : theme.colors.content.primary,
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {name}
            </Text>
            <Text
              style={[
                styles.codeText,
                {
                  color: isSelected
                    ? colorTokens.teal[700]
                    : theme.colors.content.muted,
                  textAlign: isRtl ? 'right' : 'left',
                  writingDirection: direction
                }
              ]}
            >
              {code}
            </Text>
          </View>
        </View>

        {/* Opposite Side: Symbol + Checkmark */}
        <View
          style={[
            styles.trailingSection,
            layoutDirectionStyle(direction),
            {
              flexDirection: 'row',
              alignItems: 'center'
            }
          ]}
        >
          <Text
            style={[
              styles.symbolText,
              {
                color: isSelected
                  ? colorTokens.teal[800]
                  : theme.colors.content.secondary,
                textAlign: isRtl ? 'left' : 'right',
                writingDirection: isRtl ? 'rtl' : 'ltr'
              }
            ]}
          >
            {symbol}
          </Text>

          {isSelected ? (
            <View style={styles.checkCircle}>
              <DesignIcon
                name="check"
                label="Selected"
                color={colorTokens.raw['FFFFFF']}
                size="xs"
                decorative
              />
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SelectionScreen<string>
      title={translate('settings.application.currencyScreenTitle')}
      subtitle={translate('settings.application.currencySubtitle')}
      items={items}
      selectedId={activeCurrency}
      onSelect={handleSelect}
      onBack={onBack}
      searchable
      searchPlaceholder={translate(
        'settings.application.currencySearchPlaceholder'
      )}
      searchFilter={(item, query) => {
        const currency = item.metadata?.currency as CurrencyItem | undefined;
        if (!currency) return true;
        return matchesCurrencySearch(currency, query);
      }}
      layoutMode="list"
      renderItem={renderCurrencyItem}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    ...elevation.card,
    alignItems: 'center',
    borderRadius: radius.card,
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  identitySection: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md
  },
  flagBadge: {
    alignItems: 'center',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  flagText: {
    fontSize: 20,
    lineHeight: 24
  },
  textContainer: {
    flex: 1,
    gap: 2
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22
  },
  codeText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18
  },
  trailingSection: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs
  },
  symbolText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22
  },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: colorTokens.teal[600],
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22
  }
});
