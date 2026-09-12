import React, { useMemo, useState } from 'react';
import {
  PixelRatio,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import { StateView } from '@/design-system/components/feedback/StateView';
import { BrandedScreenHeader } from '@/design-system/components/navigation/AppNavigation';
import { layoutDirectionStyle } from '@/design-system/direction';
import { DesignIcon } from '@/design-system/icons';
import { colorTokens } from '@/design-system/tokens';
import {
  editorialFontFamilyForLocale,
  fontFamilyForLocale
} from '@/design-system/typography';
import type { Account } from '@/domain/core-finance';
import {
  useAccounts,
  useAccountBalances
} from '@/features/core-finance/core-finance-queries';
import { translate } from '@/localization/i18n';
import type { AccountBalanceProjection } from '@/services/contracts/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { useSensitiveVisibility } from '@/state/SensitiveVisibilityProvider';
import { useTheme } from '@/state/theme-context';
import { AccountRow } from './AccountRow';
import { formatMinorAmount } from '@/utils/format-financial-value';
import {
  projectAccount,
  type AccountPresentation
} from './account-presentation';

interface AccountSection {
  title: string;
  data: AccountPresentation[];
}

export function AccountListScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const accounts = useAccounts(true);
  const balances = useAccountBalances(true);
  const hideBalances = usePreferenceStore((state) => state.hideBalances);
  const direction = usePreferenceStore((state) => state.direction);
  const locale = usePreferenceStore((state) => state.locale);
  const baseCurrencyCode = usePreferenceStore(
    (state) => state.baseCurrencyCode
  );
  const { revealed } = useSensitiveVisibility();
  const hidden = hideBalances && !revealed;
  const isRtl = direction === 'rtl';
  const largeText = PixelRatio.getFontScale() >= 1.5;
  const balanceByAccount = useMemo(
    () =>
      new Map<string, AccountBalanceProjection>(
        ((balances.data ?? []) as AccountBalanceProjection[]).map((item) => [
          item.accountId,
          item
        ])
      ),
    [balances.data]
  );
  const projected = useMemo<AccountPresentation[]>(() => {
    const query = search.trim().toLocaleLowerCase();
    return ((accounts.data ?? []) as Account[])
      .filter((item) =>
        query ? item.name.toLocaleLowerCase().includes(query) : true
      )
      .map((item) =>
        projectAccount(item, balanceByAccount.get(item.id), hidden)
      );
  }, [accounts.data, balanceByAccount, hidden, search]);
  const activeAccounts = projected.filter(
    ({ account }) =>
      account.status !== 'archived' && account.status !== 'closed'
  );
  const sections = useMemo<AccountSection[]>(
    () =>
      [
        {
          title: translate('coreFinance.accounts.activeSection', locale),
          data: projected.filter(
            ({ account }) =>
              account.status !== 'archived' && account.status !== 'closed'
          )
        },
        {
          title: translate('coreFinance.accounts.archivedSection', locale),
          data: projected.filter(({ account }) => account.status === 'archived')
        },
        {
          title: translate('coreFinance.accounts.closedSection', locale),
          data: projected.filter(({ account }) => account.status === 'closed')
        }
      ].filter((section) => section.data.length),
    [locale, projected]
  );
  const hasOtherCurrencies = activeAccounts.some(
    ({ account }) => account.currencyCode !== baseCurrencyCode
  );
  const totalBalanceMinor = activeAccounts.reduce(
    (total, { account, balanceMinor }) =>
      account.currencyCode === baseCurrencyCode
        ? total + (balanceMinor ?? 0)
        : total,
    0
  );
  const totalBalance = hidden
    ? `•••• ${baseCurrencyCode}`
    : formatMinorAmount(totalBalanceMinor, baseCurrencyCode, locale);

  if (accounts.isLoading || balances.isLoading) {
    return (
      <StateView
        state="loading"
        title={translate('coreFinance.state.loading')}
      />
    );
  }
  if (accounts.isError || balances.isError) {
    return (
      <StateView
        state="error"
        title={translate('coreFinance.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => {
          void accounts.refetch();
          void balances.refetch();
        }}
      />
    );
  }

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.account.id}
        contentContainerStyle={[
          styles.content,
          { backgroundColor: colorTokens.raw.F3F5F3 }
        ]}
        ListHeaderComponent={
          <>
            <View style={styles.fullBleed}>
              <BrandedScreenHeader
                compact
                direction={direction}
                testID="accounts-screen-masthead"
                title={translate('appShell.shell.accounts')}
                titleAlignEnd={direction === 'rtl'}
              />
            </View>
            <View
              testID="accounts-total-card"
              style={[
                styles.totalCard,
                styles.physicalLtr,
                {
                  backgroundColor: theme.colors.surfaces.financialHero,
                  flexDirection: largeText
                    ? 'column'
                    : isRtl
                      ? 'row-reverse'
                      : 'row'
                }
              ]}
            >
              <View
                style={[
                  styles.totalCopy,
                  { alignItems: isRtl ? 'flex-end' : 'flex-start' }
                ]}
              >
                <Text
                  style={[
                    styles.totalLabel,
                    {
                      color: theme.colors.content.onFinancialHero,
                      writingDirection: direction
                    }
                  ]}
                >
                  {translate('coreFinance.accounts.totalBalance')}
                </Text>
                <Text
                  style={[
                    styles.totalAmount,
                    { color: theme.colors.content.onFinancialHero }
                  ]}
                >
                  {totalBalance}
                </Text>
                {hasOtherCurrencies ? (
                  <Text
                    style={[
                      styles.totalNote,
                      {
                        color: theme.colors.content.onFinancialHero,
                        writingDirection: direction
                      }
                    ]}
                  >
                    {translate('coreFinance.accounts.otherCurrenciesExcluded')}
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.totalCount,
                  {
                    color: theme.colors.content.onFinancialHero,
                    textAlign: largeText
                      ? isRtl
                        ? 'right'
                        : 'left'
                      : isRtl
                        ? 'left'
                        : 'right',
                    writingDirection: direction
                  }
                ]}
              >{`${activeAccounts.length} ${translate('coreFinance.home.accountCount').replace('{{count}} ', '')}`}</Text>
            </View>
            <View
              style={[
                styles.searchShell,
                {
                  backgroundColor: theme.colors.surfaces.card,
                  borderColor: theme.colors.borders.subtle,
                  flexDirection: isRtl ? 'row-reverse' : 'row'
                }
              ]}
            >
              <DesignIcon
                name="search"
                label={translate('coreFinance.accounts.search')}
                color={theme.colors.content.muted}
                decorative
              />
              <TextInput
                testID="accounts-list-search"
                accessibilityLabel={translate('coreFinance.accounts.search')}
                placeholder={translate('coreFinance.accounts.search')}
                placeholderTextColor={theme.colors.content.muted}
                value={search}
                onChangeText={setSearch}
                style={[
                  styles.search,
                  {
                    color: theme.colors.content.primary,
                    fontFamily: fontFamilyForLocale(locale, 400),
                    textAlign: isRtl ? 'right' : 'left',
                    writingDirection: direction
                  }
                ]}
              />
              {search ? (
                <Pressable
                  accessibilityLabel={translate('common.clearSearch')}
                  accessibilityRole="button"
                  onPress={() => setSearch('')}
                  style={styles.clearSearch}
                >
                  <DesignIcon
                    name="close"
                    label={translate('common.clearSearch')}
                    color={theme.colors.content.secondary}
                    decorative
                  />
                </Pressable>
              ) : null}
            </View>
          </>
        }
        ListEmptyComponent={
          <StateView
            state="empty"
            title={
              (accounts.data ?? []).length
                ? translate('coreFinance.accounts.noSearchResults')
                : translate('coreFinance.accounts.empty')
            }
          />
        }
        renderItem={({ item }) => (
          <AccountRow
            presentation={item}
            variant="account-list"
            onPress={() => router.push(`/accounts/${item.account.id}`)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <StyledText
            style={[
              styles.sectionTitle,
              {
                fontFamily: editorialFontFamilyForLocale(locale, 700),
                textAlign: isRtl ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          >
            {section.title}
          </StyledText>
        )}
        stickySectionHeadersEnabled={false}
      />
      <Pressable
        accessibilityLabel={translate('coreFinance.accounts.add')}
        accessibilityRole="button"
        onPress={() => router.push('/accounts/new')}
        style={[
          styles.addButton,
          { backgroundColor: theme.colors.interactions.primary }
        ]}
      >
        <DesignIcon
          name="add"
          label={translate('coreFinance.accounts.add')}
          color={theme.colors.content.inverse}
          size="sm"
          decorative
        />
        <StyledText
          accessible={false}
          style={[
            styles.addButtonText,
            {
              color: theme.colors.content.inverse,
              fontFamily: editorialFontFamilyForLocale(locale, 700)
            }
          ]}
        >
          {translate('coreFinance.accounts.add')}
        </StyledText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  physicalLtr: { ...layoutDirectionStyle('ltr'), writingDirection: 'ltr' },
  content: {
    flexGrow: 1,
    paddingBottom: 98,
    paddingHorizontal: 18
  },
  fullBleed: { marginHorizontal: -18 },
  totalCard: {
    alignItems: 'center',
    borderRadius: 20,
    gap: 12,
    marginTop: 8,
    minHeight: 129,
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  totalCopy: { flex: 1 },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22
  },
  totalAmount: {
    fontSize: 27,
    fontWeight: '700',
    lineHeight: 36,
    writingDirection: 'ltr'
  },
  totalCount: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 96
  },
  totalNote: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  searchShell: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 14
  },
  search: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 12
  },
  clearSearch: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 9,
    marginHorizontal: 2,
    marginTop: 20
  },
  addButton: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    bottom: 20,
    minHeight: 58,
    marginHorizontal: 18,
    marginTop: 20,
    shadowColor: colorTokens.raw['102723'],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 9
  },
  addButtonText: { fontSize: 14, fontWeight: '700', lineHeight: 20 }
});
