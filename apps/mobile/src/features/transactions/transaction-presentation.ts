import type { FinancialMeaning } from '@/design-system/components/financial/FinancialPrimitives';
import type { Account, Category, Transaction } from '@/domain/core-finance';
import { localizedDemoTransactionTitle } from '@/domain/core-finance-seeds';
import type { Locale } from '@/domain/foundation';
import { translate } from '@/localization/i18n';
import { formatDate } from '@/utils/format-financial-value';

const localeTags: Record<Locale, string> = {
  ar: 'ar-u-nu-latn',
  en: 'en-US-u-nu-latn'
};

export interface TransactionPresentation {
  transaction: Transaction;
  title: string;
  accountName: string | null;
  categoryName: string | null;
  dateLabel: string;
  meaning: FinancialMeaning;
  sourceLabelKey: string;
  syncLabelKey: string | null;
}

export function projectTransaction(
  transaction: Transaction,
  locale: Locale,
  account?: Account,
  category?: Category
): TransactionPresentation {
  return {
    transaction,
    title:
      localizedDemoTransactionTitle(transaction.id, locale) ?? transaction.title,
    accountName: account?.name ?? null,
    categoryName: category
      ? locale === 'ar'
        ? category.labelAr
        : category.labelEn
      : null,
    dateLabel: formatDate(transaction.occurredAt, locale),
    meaning: financialMeaning(transaction),
    sourceLabelKey: `coreFinance.source.${transaction.source}`,
    syncLabelKey:
      transaction.syncStatus === 'synced'
        ? null
        : `coreFinance.sync.${transaction.syncStatus}`
  };
}

export function formatTransactionMonth(
  timestamp: number,
  locale: Locale,
  timeZone: string
): string {
  return new Intl.DateTimeFormat(localeTags[locale], {
    month: 'long',
    year: 'numeric',
    timeZone
  }).format(new Date(timestamp));
}

export function formatTransactionTimestamp(
  timestamp: number,
  now: number,
  locale: Locale,
  timeZone: string
): string {
  const key = calendarKey(timestamp, timeZone);
  const today = calendarKey(now, timeZone);
  const yesterday = previousCalendarKey(today);

  if (key !== today && key !== yesterday) {
    return new Intl.DateTimeFormat(localeTags[locale], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone
    }).format(new Date(timestamp));
  }

  const label = translate(
    key === today
      ? 'coreFinance.ledger.period.today'
      : 'coreFinance.ledger.period.yesterday',
    locale
  );
  const time = new Intl.DateTimeFormat(localeTags[locale], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  }).format(new Date(timestamp));
  return `${label}${locale === 'ar' ? '،' : ','} ${time}`;
}

function calendarKey(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US-u-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function previousCalendarKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return [
    previous.getUTCFullYear(),
    String(previous.getUTCMonth() + 1).padStart(2, '0'),
    String(previous.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function financialMeaning(transaction: Transaction): FinancialMeaning {
  if (transaction.type === 'income') return 'income';
  if (transaction.type === 'transfer') return 'transfer';
  if (transaction.type === 'refund') return 'refund';
  if (transaction.type === 'obligation_payment') return 'debt';
  if (transaction.type === 'recurring_payment') return 'expense';
  return transaction.amountMinor < 0 ? 'income' : 'expense';
}
