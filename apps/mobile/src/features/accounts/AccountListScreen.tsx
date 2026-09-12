import React, { useMemo, useState } from 'react';
import { SectionList, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { StyledText } from '@/components/StyledText';
import { ActionButton } from '@/design-system/components/ActionButton';
import { StateView } from '@/design-system/components/feedback/StateView';
import { fontFamilyForLocale } from '@/design-system/typography';
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
  const { revealed } = useSensitiveVisibility();
  const hidden = hideBalances && !revealed;
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
  const filtered = useMemo<Account[]>(
    () =>
      ((accounts.data ?? []) as Account[]).filter((item) =>
        item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ),
    [accounts.data, search]
  );
  const sections = useMemo<AccountSection[]>(() => {
    const projected: AccountPresentation[] = filtered.map((item) =>
      projectAccount(item, balanceByAccount.get(item.id), hidden)
    );
    return [
      {
        title: translate('coreFinance.accounts.activeSection'),
        data: projected.filter((item) => item.account.status === 'active')
      },
      {
        title: translate('coreFinance.accounts.archivedSection'),
        data: projected.filter((item) => item.account.status === 'archived')
      },
      {
        title: translate('coreFinance.accounts.closedSection'),
        data: projected.filter((item) => item.account.status === 'closed')
      }
    ].filter((section) => section.data.length);
  }, [balanceByAccount, filtered, hidden]);
  if (accounts.isLoading || balances.isLoading)
    return (
      <View style={styles.content}>
        <StyledText variant="title">
          {translate('appShell.shell.accounts')}
        </StyledText>
        <StateView
          state="loading"
          title={translate('coreFinance.state.loading')}
        />
      </View>
    );
  if (accounts.isError || balances.isError)
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
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.account.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <StyledText variant="title">
            {translate('appShell.shell.accounts')}
          </StyledText>
          <TextInput
            testID="accounts-list-search"
            accessibilityLabel={translate('coreFinance.accounts.search')}
            placeholder={translate('coreFinance.accounts.search')}
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.search,
              {
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary,
                fontFamily: fontFamilyForLocale(locale, 400),
                textAlign: direction === 'rtl' ? 'right' : 'left',
                writingDirection: direction
              }
            ]}
          />
          <ActionButton
            label={translate('coreFinance.accounts.add')}
            onPress={() => router.push('/accounts/new')}
          />
        </View>
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
      renderItem={({ item, index, section }) => (
        <AccountRow
          groupedPosition={
            section.data.length === 1
              ? 'only'
              : index === 0
                ? 'first'
                : index === section.data.length - 1
                  ? 'last'
                  : 'middle'
          }
          presentation={item}
          onPress={() => router.push(`/accounts/${item.account.id}`)}
        />
      )}
      renderSectionHeader={({ section }) => (
        <StyledText style={styles.sectionHeading} variant="subtitle">
          {section.title}
        </StyledText>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 8 },
  sectionHeading: { paddingBottom: 8, paddingTop: 16 },
  search: {
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12
  }
});
