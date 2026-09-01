import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { StateView } from '@/design-system/components/feedback/StateView';
import { FormField } from '@/design-system/components/forms/FormField';
import { AppSheet } from '@/design-system/components/overlays/AppSheet';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import { CategoryIcon } from '@/design-system/components/financial/FinancialPrimitives';
import { DesignIcon, type DesignIconName } from '@/design-system/icons';
import {
  elevation,
  minTouchTarget,
  radius,
  spacing,
  typography
} from '@/design-system/tokens';
import {
  isConfirmedTransaction,
  parseAmountToMinor,
  type Account,
  type Category,
  type Transaction,
  type TransactionType
} from '@/domain/core-finance';
import { minorToMajorAmountText } from '@/domain/currencies';
import {
  invalidateCoreFinanceScopes,
  useAccounts,
  useCategories,
  useRemainingRefundableMinor,
  useTransaction
} from '@/features/core-finance/core-finance-queries';
import { categoryIconName } from '@/features/categories/category-presentation';
import { openCategorySelection } from '@/features/categories/category-selection-session';
import {
  currentLocale,
  translate,
  translateDynamic
} from '@/localization/i18n';
import { CoreFinanceError } from '@/services/contracts/core-finance-service';
import { coreFinanceService } from '@/services/mocks/core-finance-service';
import { usePreferenceStore } from '@/state/preferences';
import { useTheme } from '@/state/theme-context';
import { formatMinorAmount } from '@/utils/format-financial-value';
import { useTransactionDraftGuard } from './useTransactionDraftGuard';
import { AccountPicker } from './AccountPicker';
import { TransactionDateField } from './TransactionDateField';
import { TransactionActions } from './TransactionActions';
import { MANUAL_TRANSACTION_DRAFT_ID } from './manual-transaction-draft';

const editSupportedTypes: TransactionType[] = ['expense', 'income', 'transfer'];
const EMPTY_AMOUNT_PLACEHOLDER = '0';

type TransactionFormProps = {
  initialType?: TransactionType;
  initialAccountId?: string;
  originalTransactionId?: string;
  transaction?: Transaction;
};

type TransactionFormContentProps = TransactionFormProps & {
  refundOriginal?: Transaction | null;
  refundOriginalError?: boolean;
  refundOriginalLoading?: boolean;
  onRefundOriginalRetry?: () => void;
};

export function TransactionForm(props: TransactionFormProps) {
  const refundOriginalId =
    props.transaction?.type === 'refund'
      ? (props.transaction.originalTransactionId ?? '')
      : props.initialType === 'refund'
        ? (props.originalTransactionId ?? '')
        : '';

  if (refundOriginalId) {
    return (
      <RefundTransactionForm {...props} refundOriginalId={refundOriginalId} />
    );
  }

  return <TransactionFormContent {...props} />;
}

function RefundTransactionForm({
  refundOriginalId,
  ...props
}: TransactionFormProps & { refundOriginalId: string }) {
  const refundOriginal = useTransaction(refundOriginalId);
  return (
    <TransactionFormContent
      {...props}
      refundOriginal={refundOriginal.data ?? null}
      refundOriginalError={refundOriginal.isError}
      refundOriginalLoading={refundOriginal.isLoading}
      onRefundOriginalRetry={() => {
        void refundOriginal.refetch();
      }}
    />
  );
}

function TransactionFormContent({
  initialType = 'expense',
  initialAccountId = '',
  originalTransactionId = '',
  transaction,
  refundOriginal = null,
  refundOriginalError = false,
  refundOriginalLoading = false,
  onRefundOriginalRetry
}: TransactionFormContentProps) {
  const accounts = useAccounts();
  const categories = useCategories();
  const client = useQueryClient();
  const theme = useTheme();
  const direction = usePreferenceStore((state) => state.direction);
  const locale = currentLocale();
  const [type, setType] = useState<TransactionType>(
    transaction?.type ?? initialType
  );
  const [amount, setAmount] = useState(
    transaction
      ? minorToMajorAmountText(
          transaction.amountMinor,
          transaction.currencyCode
        )
      : ''
  );
  const [title, setTitle] = useState(transaction?.title ?? '');
  const [accountId, setAccountId] = useState(
    transaction?.accountId ?? initialAccountId
  );
  const [destinationAccountId, setDestination] = useState(
    transaction?.destinationAccountId ?? ''
  );
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [notes, setNotes] = useState(transaction?.notes ?? '');
  const [occurredAt, setOccurredAt] = useState(
    transaction?.occurredAt ?? Date.now()
  );
  const refundOriginalId =
    transaction?.type === 'refund'
      ? (transaction.originalTransactionId ?? '')
      : initialType === 'refund'
        ? originalTransactionId
        : '';
  const refundLocked = type === 'refund' && Boolean(refundOriginalId);
  const refundDraft = !transaction && refundLocked;
  const refundable = useRemainingRefundableMinor(
    refundOriginalId,
    refundLocked,
    transaction?.type === 'refund' ? transaction.id : undefined
  );
  const lockedOriginal = refundLocked ? refundOriginal : null;
  const lockedAccountId = lockedOriginal?.accountId ?? '';
  const lockedCategoryId = lockedOriginal?.categoryId ?? '';
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [deleted, setDeleted] = useState(transaction?.status === 'deleted');
  const [draftReady, setDraftReady] = useState(
    Boolean(transaction || refundDraft)
  );
  const skipNextDraftReload = useRef(false);
  const [picker, setPicker] = useState<'account' | 'destination' | null>(null);
  const meaningful = Boolean(
    amount || title || accountId || destinationAccountId || categoryId || notes
  );
  const persistManualDraft = useCallback(() => {
    if (refundDraft) return Promise.resolve(undefined);
    return coreFinanceService.saveDraft({
      id: MANUAL_TRANSACTION_DRAFT_ID,
      transactionType: type,
      amountText: amount,
      accountId: accountId || null,
      destinationAccountId: destinationAccountId || null,
      categoryId: categoryId || null,
      merchant: title || null,
      notes: notes || null,
      occurredAt,
      status: 'editing',
      updatedAt: Date.now()
    });
  }, [
    accountId,
    amount,
    categoryId,
    destinationAccountId,
    notes,
    occurredAt,
    refundDraft,
    title,
    type
  ]);
  const saveManualDraft = useCallback(
    () => persistManualDraft(),
    [persistManualDraft]
  );
  const discard = useCallback(() => {
    if (refundDraft) return Promise.resolve(undefined);
    return coreFinanceService.discardDraft(MANUAL_TRANSACTION_DRAFT_ID);
  }, [refundDraft]);
  const { requestClose, leaveAfterSave } = useTransactionDraftGuard({
    meaningful: !transaction && meaningful,
    discard
  });
  const sourceAccountId =
    lockedAccountId || accountId || accounts.data?.[0]?.id;
  const resolvedCategoryId =
    type === 'transfer' ? '' : lockedCategoryId || categoryId;
  const selectedAccount = accounts.data?.find(
    (item: Account) => item.id === sourceAccountId
  );
  const selectedDestination = accounts.data?.find(
    (item: Account) => item.id === destinationAccountId
  );
  const selectedCategory = categories.data?.find(
    (item: Category) => item.id === resolvedCategoryId
  );
  const selectedCurrencyCode = transaction
    ? (selectedAccount?.currencyCode ?? transaction.currencyCode)
    : (lockedOriginal?.currencyCode ?? selectedAccount?.currencyCode ?? 'SAR');
  const editDirty = Boolean(
    transaction &&
    (type !== transaction.type ||
      parseAmountToMinor(amount, selectedCurrencyCode) !==
        transaction.amountMinor ||
      title !== transaction.title ||
      sourceAccountId !== transaction.accountId ||
      (destinationAccountId || null) !== transaction.destinationAccountId ||
      (type === 'transfer' ? null : resolvedCategoryId || null) !==
        transaction.categoryId ||
      notes !== (transaction.notes ?? '') ||
      occurredAt !== transaction.occurredAt)
  );
  const closeEdit = () => {
    if (!editDirty) {
      router.back();
      return;
    }
    Alert.alert(
      translate('coreFinance.transaction.leaveEditTitle'),
      translate('coreFinance.transaction.leaveEditMessage'),
      [
        { text: translate('coreFinance.cancel'), style: 'cancel' },
        {
          text: translate('coreFinance.transaction.discardChanges'),
          style: 'destructive',
          onPress: () => router.back()
        }
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      if (transaction || refundDraft) return;
      if (skipNextDraftReload.current) {
        skipNextDraftReload.current = false;
        return;
      }
      void coreFinanceService
        .loadDraft(MANUAL_TRANSACTION_DRAFT_ID)
        .then((draft) => {
          if (draft) {
            setType(draft.transactionType ?? initialType);
            setAmount(draft.amountText);
            setTitle(draft.merchant ?? '');
            setAccountId(draft.accountId ?? '');
            setDestination(draft.destinationAccountId ?? '');
            setCategoryId(draft.categoryId ?? '');
            setNotes(draft.notes ?? '');
            setOccurredAt(draft.occurredAt ?? Date.now());
          }
        })
        .catch(() => setError(translate('coreFinance.state.error')))
        .finally(() => setDraftReady(true));
    }, [initialType, refundDraft, transaction])
  );

  useEffect(() => {
    if (!draftReady || transaction || refundDraft || !meaningful || saving)
      return;
    const timeout = setTimeout(() => {
      void saveManualDraft().catch(() =>
        setError(translate('coreFinance.state.error'))
      );
    }, 250);
    return () => clearTimeout(timeout);
  }, [
    draftReady,
    meaningful,
    refundDraft,
    saveManualDraft,
    saving,
    transaction
  ]);
  const save = async () => {
    if (saving || deleted) return;
    const resolvedAccount = sourceAccountId;
    const currencyCode = selectedCurrencyCode;
    const amountMinor = parseAmountToMinor(amount, currencyCode);
    const resolvedOriginalTransactionId =
      refundLocked && lockedOriginal
        ? lockedOriginal.id
        : (transaction?.originalTransactionId ?? null);
    const categoryRequired =
      type !== 'transfer' && type !== 'refund' && !resolvedCategoryId;
    if (
      !amountMinor ||
      !resolvedAccount ||
      !title.trim() ||
      categoryRequired ||
      (type === 'refund' && !resolvedOriginalTransactionId)
    ) {
      setError(translate('coreFinance.validation.required'));
      return;
    }
    if (
      refundLocked &&
      (!lockedOriginal ||
        lockedOriginal.type !== 'expense' ||
        !isConfirmedTransaction(lockedOriginal) ||
        amountMinor > (refundable.data ?? 0))
    ) {
      setError(translate('coreFinance.validation.refund'));
      return;
    }
    setSaving(true);
    try {
      const input = {
        type,
        amountMinor,
        currencyCode,
        accountId: resolvedAccount,
        destinationAccountId:
          type === 'transfer' ? destinationAccountId || null : null,
        feeMinor: transaction?.feeMinor ?? 0,
        categoryId: type === 'transfer' ? null : resolvedCategoryId || null,
        title,
        merchant: transaction?.merchant ?? null,
        occurredAt,
        notes: notes.trim() || null,
        originalTransactionId: resolvedOriginalTransactionId,
        obligationId: transaction?.obligationId ?? null
      };
      const mutation = transaction
        ? await coreFinanceService.updateTransaction(transaction.id, input)
        : await coreFinanceService.createTransaction(
            input,
            `manual-${Date.now()}`
          );
      await invalidateCoreFinanceScopes(client, mutation.affectedScopes);
      if (!transaction) {
        await discard();
        setType(initialType);
        setAmount('');
        setTitle('');
        setAccountId(refundDraft ? lockedAccountId : '');
        setDestination('');
        setCategoryId(refundDraft ? lockedCategoryId : '');
        setNotes('');
        setOccurredAt(Date.now());
      }
      if (transaction && router.canGoBack()) router.back();
      else if (transaction) router.replace('/(tabs)/transactions');
      else leaveAfterSave(() => router.replace('/(tabs)/transactions'));
    } catch (caught) {
      setError(
        caught instanceof CoreFinanceError
          ? translate('coreFinance.validation.invalid')
          : translate('coreFinance.state.error')
      );
    } finally {
      setSaving(false);
    }
  };
  if (
    accounts.isLoading ||
    categories.isLoading ||
    !draftReady ||
    (refundLocked && refundOriginalLoading) ||
    (refundLocked && refundable.isLoading)
  )
    return (
      <StateView
        state="loading"
        title={translate('coreFinance.state.loading')}
      />
    );
  if (
    accounts.isError ||
    categories.isError ||
    (refundLocked && (refundOriginalError || !refundOriginal)) ||
    (refundLocked && refundable.isError)
  )
    return (
      <StateView
        state="error"
        title={translate('coreFinance.state.error')}
        actionLabel={translate('coreFinance.action.retry')}
        onAction={() => {
          void accounts.refetch();
          void categories.refetch();
          if (refundLocked) {
            onRefundOriginalRetry?.();
            void refundable.refetch();
          }
        }}
      />
    );
  const pickerSheets = (
    <>
      {picker === 'account' || picker === 'destination' ? (
        <AppSheet
          title={translate(
            picker === 'account'
              ? 'coreFinance.transaction.account'
              : 'coreFinance.form.destination'
          )}
          visible
          onDismiss={() => setPicker(null)}
        >
          <AccountPicker
            currencyCode={
              picker === 'destination' ? selectedCurrencyCode : undefined
            }
            excludedIds={
              picker === 'destination' && sourceAccountId
                ? [sourceAccountId]
                : []
            }
            selectedId={
              picker === 'account' ? sourceAccountId : destinationAccountId
            }
            onSelect={(account) => {
              if (picker === 'account') {
                setAccountId(account.id);
                if (
                  destinationAccountId &&
                  (destinationAccountId === account.id ||
                    selectedDestination?.currencyCode !== account.currencyCode)
                )
                  setDestination('');
              } else if (account.id !== sourceAccountId) {
                setDestination(account.id);
              }
              setPicker(null);
            }}
          />
        </AppSheet>
      ) : null}
    </>
  );

  const categoryLabel = selectedCategory
    ? locale === 'ar'
      ? selectedCategory.labelAr
      : selectedCategory.labelEn
    : translate('coreFinance.transaction.chooseCategory');
  const openPicker = async (target: 'account' | 'destination' | 'category') => {
    if (target === 'category') {
      if (!transaction) await saveManualDraft();
      openCategorySelection({
        selectedId: categoryId,
        onSelect: (nextCategoryId) => {
          if (!nextCategoryId) return;
          if (!transaction) skipNextDraftReload.current = true;
          setCategoryId(nextCategoryId);
        }
      });
      return;
    }
    if (transaction) {
      setPicker(target);
      return;
    }
    await saveManualDraft();
    router.push(
      `/modals/account-picker?draft=manual&field=${
        target === 'account' ? 'accountId' : 'destinationAccountId'
      }${
        target === 'destination'
          ? `&currencyCode=${encodeURIComponent(selectedCurrencyCode)}`
          : ''
      }`
    );
  };

  return (
    <View
      style={[styles.editRoot, { backgroundColor: theme.colors.background }]}
    >
      <View
        style={[
          styles.editHeader,
          {
            backgroundColor: theme.colors.background,
            borderBottomColor: theme.colors.borders.subtle
          }
        ]}
      >
        <Pressable
          accessibilityLabel={translate('appShell.navigation.close')}
          accessibilityRole="button"
          onPress={transaction ? closeEdit : requestClose}
          style={styles.headerAction}
        >
          <DesignIcon
            name="close"
            label={translate('appShell.navigation.close')}
            color={theme.colors.content.link}
            decorative
          />
        </Pressable>
        <Text
          numberOfLines={2}
          style={[styles.editTitle, { color: theme.colors.content.primary }]}
        >
          {transaction
            ? translateDynamic('coreFinance.transaction.editNamed', {
                type: translate(`coreFinance.type.${type}` as never)
              })
            : translate(
                refundDraft ? 'coreFinance.type.refund' : 'appShell.tabs.add'
              )}
        </Text>
        <Pressable
          accessibilityLabel={translate('coreFinance.form.save')}
          accessibilityRole="button"
          accessibilityState={{
            busy: saving,
            disabled: saving || Boolean(transaction && deleted)
          }}
          disabled={saving || Boolean(transaction && deleted)}
          onPress={() => void save()}
          style={styles.headerAction}
        >
          <DesignIcon
            name="check"
            label={translate('coreFinance.form.save')}
            color={theme.colors.content.link}
            decorative
          />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.editStack}
        keyboardShouldPersistTaps="handled"
      >
        <View testID="transaction-edit-hero" style={styles.editHero}>
          {refundLocked ? null : (
            <View
              testID="transaction-edit-type-selector"
              style={[
                styles.typeSelector,
                {
                  direction: 'ltr',
                  flexDirection: direction === 'rtl' ? 'row-reverse' : 'row'
                }
              ]}
            >
              {editSupportedTypes.map((item) => {
                const label = translate(`coreFinance.type.${item}` as never);
                const selected = item === type;
                return (
                  <Pressable
                    key={item}
                    testID={`transaction-edit-type-${item}`}
                    accessibilityLabel={`${label} ${translate(
                      selected
                        ? 'designSystem.state.selected'
                        : deleted
                          ? 'designSystem.state.disabled'
                          : 'designSystem.state.available'
                    )}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: deleted }}
                    disabled={Boolean(transaction && deleted)}
                    onPress={() => {
                      setType(item);
                      if (item === 'transfer') setCategoryId('');
                      else setDestination('');
                    }}
                    style={({ pressed }) => [
                      styles.typeOption,
                      {
                        backgroundColor: selected
                          ? theme.colors.interactions.primary
                          : pressed
                            ? theme.colors.interactions.quietPressed
                            : theme.colors.surfaces.grouped,
                        opacity: transaction && deleted ? 0.56 : 1
                      }
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.typeOptionText,
                        {
                          color: selected
                            ? theme.colors.content.inverse
                            : theme.colors.content.primary
                        }
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={styles.amountBlock}>
            <View
              testID="transaction-edit-amount-unit"
              style={styles.amountEditor}
            >
              <TextInput
                accessibilityLabel={translate('coreFinance.form.amount')}
                keyboardType="decimal-pad"
                editable={!transaction || !deleted}
                onChangeText={setAmount}
                placeholder={EMPTY_AMOUNT_PLACEHOLDER}
                placeholderTextColor={theme.colors.content.muted}
                selectTextOnFocus
                style={[
                  styles.amountInput,
                  {
                    color: theme.colors.content.primary,
                    width: Math.min(300, Math.max(40, amount.length * 27))
                  }
                ]}
                value={amount}
              />
              <Text
                style={[
                  styles.currency,
                  { color: theme.colors.content.primary }
                ]}
              >
                {selectedCurrencyCode}
              </Text>
            </View>
          </View>
        </View>
        {type === 'transfer' ? null : (
          <TransactionPickerCard
            direction={direction}
            icon={categoryIconName(selectedCategory?.iconKey ?? null)}
            categoryVisualKey={selectedCategory?.iconKey ?? null}
            label={translate('coreFinance.transaction.category')}
            title={categoryLabel}
            disabled={refundLocked || Boolean(transaction && deleted)}
            onPress={() => void openPicker('category')}
          />
        )}
        <TransactionPickerCard
          direction={direction}
          icon="accounts"
          label={translate('coreFinance.transaction.account')}
          title={
            selectedAccount?.name ??
            translate('coreFinance.transaction.account')
          }
          subtitle={selectedAccount?.currencyCode}
          disabled={refundLocked || Boolean(transaction && deleted)}
          onPress={() => void openPicker('account')}
        />
        {type === 'transfer' ? (
          <TransactionPickerCard
            direction={direction}
            icon="transactions"
            label={translate('coreFinance.form.destination')}
            title={
              selectedDestination?.name ??
              translate('coreFinance.form.destination')
            }
            subtitle={selectedDestination?.currencyCode}
            disabled={Boolean(transaction && deleted)}
            onPress={() => void openPicker('destination')}
          />
        ) : null}
        <FormField
          label={translate('coreFinance.form.title')}
          editable={!transaction || !deleted}
          value={title}
          onChangeText={setTitle}
        />
        <FormField
          label={translate('coreFinance.form.note')}
          editable={!transaction || !deleted}
          maxLength={500}
          multiline
          numberOfLines={3}
          placeholder={translate('coreFinance.form.notePlaceholder')}
          style={styles.noteInput}
          value={notes}
          onChangeText={setNotes}
        />
        <TransactionDateField
          value={occurredAt}
          disabled={Boolean(transaction && deleted)}
          onChange={setOccurredAt}
        />
        {refundDraft && lockedOriginal ? (
          <>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.content.primary }
              ]}
            >
              {translate('coreFinance.transaction.information')}
            </Text>
            <GroupedList
              label={translate('coreFinance.transaction.information')}
            >
              <NavigationRow
                label={translate('coreFinance.transaction.original')}
                value={lockedOriginal.title}
                onPress={() =>
                  router.push(`/transactions/${lockedOriginal.id}`)
                }
              />
              <NavigationRow
                label={translate('coreFinance.form.amount')}
                value={formatMinorAmount(
                  lockedOriginal.amountMinor,
                  lockedOriginal.currencyCode,
                  locale
                )}
              />
            </GroupedList>
          </>
        ) : null}
        {error ? (
          <Text
            accessibilityRole="alert"
            style={{ color: theme.colors.status.danger }}
          >
            {error}
          </Text>
        ) : null}
        {transaction ? (
          <>
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.content.primary }
              ]}
            >
              {translate('coreFinance.transaction.information')}
            </Text>
            <GroupedList
              label={translate('coreFinance.transaction.information')}
            >
              <NavigationRow
                label={translate('coreFinance.transaction.source')}
                value={translate(
                  `coreFinance.source.${transaction.source}` as never
                )}
              />
              <NavigationRow
                label={translate('coreFinance.transaction.recordStatus')}
                value={translate(
                  `coreFinance.status.${transaction.status}` as never
                )}
              />
              <NavigationRow
                label={translate('coreFinance.transaction.reviewStatus')}
                value={translate(
                  `coreFinance.transaction.review.${transaction.reviewStatus}` as never
                )}
              />
              <NavigationRow
                label={translate('coreFinance.transaction.status')}
                value={translate(
                  `coreFinance.sync.${transaction.syncStatus}` as never
                )}
              />
              {transaction.originalTransactionId ? (
                <NavigationRow
                  label={translate('coreFinance.transaction.original')}
                  value={transaction.originalTransactionId}
                  onPress={() =>
                    router.push(
                      `/transactions/${transaction.originalTransactionId}`
                    )
                  }
                />
              ) : null}
              {transaction.obligationId ? (
                <NavigationRow
                  label={translate('coreFinance.transaction.obligation')}
                  value={transaction.obligationId}
                  onPress={() =>
                    router.push(`/obligations/${transaction.obligationId}`)
                  }
                />
              ) : null}
            </GroupedList>
            <TransactionActions
              transaction={transaction}
              onDeletedChange={setDeleted}
            />
          </>
        ) : null}
      </ScrollView>
      {transaction ? pickerSheets : null}
    </View>
  );
}

function TransactionPickerCard({
  direction,
  icon,
  categoryVisualKey,
  label,
  title,
  subtitle,
  disabled = false,
  onPress
}: {
  direction: 'ltr' | 'rtl';
  icon: DesignIconName;
  categoryVisualKey?: string | null;
  label: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.fieldStack}>
      <Text
        style={[
          styles.fieldLabel,
          {
            color: theme.colors.content.primary,
            textAlign: direction === 'rtl' ? 'right' : 'left'
          }
        ]}
      >
        {label}
      </Text>
      <Pressable
        accessibilityLabel={`${label}, ${title}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerCard,
          {
            backgroundColor: pressed
              ? theme.colors.interactions.quietPressed
              : theme.colors.surfaces.card,
            borderColor: theme.colors.borders.subtle,
            direction: 'ltr',
            flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
            opacity: disabled ? 0.56 : 1
          }
        ]}
      >
        {categoryVisualKey !== undefined ? (
          <CategoryIcon
            label={title}
            icon={icon}
            size="sm"
            visualKey={categoryVisualKey}
          />
        ) : (
          <View
            style={[
              styles.pickerIcon,
              { backgroundColor: theme.colors.surfaces.brandSubtle }
            ]}
          >
            <DesignIcon
              name={icon}
              label={label}
              color={theme.colors.content.link}
              decorative
            />
          </View>
        )}
        <View style={styles.pickerText}>
          <Text
            numberOfLines={2}
            style={[
              styles.pickerTitle,
              {
                color: theme.colors.content.primary,
                textAlign: direction === 'rtl' ? 'right' : 'left'
              }
            ]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[
                styles.pickerSubtitle,
                {
                  color: theme.colors.content.secondary,
                  textAlign: direction === 'rtl' ? 'right' : 'left'
                }
              ]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <DesignIcon
          name="chevronEnd"
          label={label}
          color={theme.colors.content.muted}
          direction={direction}
          decorative
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  editRoot: { flex: 1 },
  editHeader: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    writingDirection: 'ltr',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.md
  },
  headerAction: {
    alignItems: 'center',
    height: minTouchTarget,
    justifyContent: 'center',
    width: minTouchTarget
  },
  editTitle: {
    ...typography.title,
    flex: 1,
    textAlign: 'center'
  },
  editStack: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  editHero: {
    gap: spacing.xl,
    paddingBottom: spacing.sm
  },
  typeSelector: {
    flexWrap: 'nowrap',
    gap: spacing.sm,
    writingDirection: 'ltr'
  },
  typeOption: {
    alignItems: 'center',
    borderRadius: radius.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: minTouchTarget,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center'
  },
  amountBlock: {
    alignItems: 'center',
    minHeight: 104,
    justifyContent: 'center'
  },
  amountEditor: {
    alignItems: 'baseline',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '100%',
    justifyContent: 'center'
  },
  amountInput: {
    ...typography.headline,
    fontSize: 46,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    lineHeight: 58,
    maxWidth: 300,
    minWidth: 40,
    outlineWidth: 0,
    padding: 0,
    textAlign: 'right',
    writingDirection: 'ltr'
  },
  currency: {
    ...typography.title,
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr'
  },
  fieldStack: { gap: spacing.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  pickerCard: {
    ...elevation.raised,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    writingDirection: 'ltr',
    gap: spacing.sm,
    minHeight: 60,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm
  },
  pickerIcon: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  pickerText: { flex: 1, gap: spacing.xs },
  pickerTitle: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  pickerSubtitle: { fontSize: 13, lineHeight: 18 },
  noteInput: {
    minHeight: 64,
    paddingTop: spacing.md,
    textAlignVertical: 'top'
  },
  sectionTitle: { ...typography.subtitle }
});
