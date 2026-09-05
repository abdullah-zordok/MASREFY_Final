import type { Account, Category, Transaction } from './core-finance';
import type { Locale } from './foundation';

const FIXTURE_NOW = Date.UTC(2026, 7, 8, 12);

const demoCopy = {
  en: {
    bankAccount: 'Masarifi',
    cashAccount: 'Cash Wallet',
    cardAccount: 'Client Card',
    bank: 'Masarifi Bank',
    accountNote: 'Client demo account',
    cardNote: 'Client demo card',
    transactionNote: 'Client demo data',
    fallbackTitle: 'Demo transaction',
    fallbackMerchant: 'Demo merchant',
    titles: [
      'Monthly salary',
      'Rent payment',
      'Grocery run',
      'Coffee meeting',
      'Client dinner supplies',
      'Wallet top-up',
      'Electricity bill',
      'Streaming subscription',
      'Card refund'
    ],
    merchants: {
      building: 'Building Management',
      grocery: 'Tamimi Markets',
      cafe: 'Draft Cafe',
      mall: 'Mall Store',
      utility: 'Utility Provider',
      streaming: 'StreamBox'
    }
  },
  ar: {
    bankAccount: 'مصاريفي',
    cashAccount: 'المحفظة النقدية',
    cardAccount: 'بطاقة العميل',
    bank: 'بنك مصاريفي',
    accountNote: 'حساب بيانات العرض',
    cardNote: 'بطاقة بيانات العرض',
    transactionNote: 'بيانات عرض تجريبية',
    fallbackTitle: 'معاملة تجريبية',
    fallbackMerchant: 'تاجر تجريبي',
    titles: [
      'الراتب الشهري',
      'دفعة الإيجار',
      'مشتريات البقالة',
      'لقاء في المقهى',
      'مستلزمات العشاء',
      'شحن المحفظة',
      'فاتورة الكهرباء',
      'اشتراك البث',
      'استرداد البطاقة'
    ],
    merchants: {
      building: 'إدارة المبنى',
      grocery: 'أسواق التميمي',
      cafe: 'مقهى درافت',
      mall: 'متجر المركز التجاري',
      utility: 'مزود الكهرباء',
      streaming: 'ستريم بوكس'
    }
  }
} as const;

export const defaultCategorySeeds = [
  ['housing', 'السكن', 'Housing', 'expense'],
  ['food', 'الطعام', 'Food', 'expense'],
  ['restaurants', 'المطاعم', 'Restaurants', 'expense'],
  ['transportation', 'المواصلات', 'Transportation', 'expense'],
  ['fuel', 'الوقود', 'Fuel', 'expense'],
  ['shopping', 'التسوق', 'Shopping', 'expense'],
  ['health', 'الصحة', 'Health', 'expense'],
  ['education', 'التعليم', 'Education', 'expense'],
  ['entertainment', 'الترفيه', 'Entertainment', 'expense'],
  ['subscriptions', 'الاشتراكات الرقمية', 'Digital subscriptions', 'expense'],
  ['utilities', 'الخدمات', 'Utilities', 'expense'],
  [
    'communication',
    'الاتصالات والإنترنت',
    'Communication and internet',
    'expense'
  ],
  ['travel', 'السفر', 'Travel', 'expense'],
  ['charity', 'الصدقة', 'Charity', 'expense'],
  ['fees', 'الرسوم', 'Fees', 'expense'],
  ['salary', 'الراتب', 'Salary', 'income'],
  ['other-income', 'دخل آخر', 'Other income', 'income'],
  ['remittance', 'الحوالات المالية', 'Remittances', 'expense'],
  ['obligations', 'الالتزامات', 'Obligations', 'expense']
] as const;

export function createDefaultCategories(): Category[] {
  return defaultCategorySeeds.map(
    ([id, labelAr, labelEn, financialType], index) => ({
      id,
      kind: 'system',
      financialType,
      parentId: null,
      labelAr,
      labelEn,
      iconKey: id === 'remittance' ? 'transfers' : id,
      colorKey: `category-${index % 8}`,
      isFavorite: index < 4,
      status: 'active',
      mergedIntoId: null,
      createdAt: FIXTURE_NOW,
      updatedAt: FIXTURE_NOW
    })
  );
}

export function createDefaultAccount(now = Date.now()): Account {
  return {
    id: 'account-default',
    name: 'Masarifi',
    type: 'bank',
    currencyCode: 'SAR',
    openingBalanceMinor: 0,
    institution: null,
    lastFour: null,
    creditLimitMinor: null,
    automaticTrackingEnabled: true,
    isDefault: true,
    iconKey: 'bank',
    colorKey: 'account-teal',
    notes: null,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
}

export function createDemoAccounts(
  now = Date.now(),
  locale: Locale = 'en'
): Account[] {
  const copy = demoCopy[locale];
  return [
    {
      ...createDefaultAccount(now),
      name: copy.bankAccount,
      openingBalanceMinor: 0
    },
    {
      id: 'demo-account-cash',
      name: copy.cashAccount,
      type: 'cash',
      currencyCode: 'SAR',
      openingBalanceMinor: 42_500,
      institution: null,
      lastFour: null,
      creditLimitMinor: null,
      automaticTrackingEnabled: true,
      isDefault: false,
      iconKey: 'wallet',
      colorKey: 'account-bronze',
      notes: copy.accountNote,
      status: 'active',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'demo-account-card',
      name: copy.cardAccount,
      type: 'credit_card',
      currencyCode: 'SAR',
      openingBalanceMinor: 0,
      institution: copy.bank,
      lastFour: '4821',
      creditLimitMinor: 500_000,
      automaticTrackingEnabled: true,
      isDefault: false,
      iconKey: 'card',
      colorKey: 'account-neutral',
      notes: copy.cardNote,
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  ];
}

export function createDemoTransactions(
  now = Date.now(),
  locale: Locale = 'en'
): Transaction[] {
  const copy = demoCopy[locale];
  const date = new Date(now);
  const at = (day: number, hour: number) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day, hour);
  return [
    demoTransaction(1, now, copy, {
      type: 'income',
      amountMinor: 12_500_00,
      categoryId: 'salary',
      title: copy.titles[0],
      merchant: null,
      occurredAt: at(1, 9)
    }),
    demoTransaction(2, now, copy, {
      amountMinor: 1_850_00,
      categoryId: 'housing',
      title: copy.titles[1],
      merchant: copy.merchants.building,
      occurredAt: at(2, 10)
    }),
    demoTransaction(3, now, copy, {
      amountMinor: 243_75,
      categoryId: 'food',
      title: copy.titles[2],
      merchant: copy.merchants.grocery,
      occurredAt: at(4, 18)
    }),
    demoTransaction(4, now, copy, {
      amountMinor: 78_50,
      accountId: 'demo-account-cash',
      categoryId: 'restaurants',
      title: copy.titles[3],
      merchant: copy.merchants.cafe,
      paymentMethod: 'cash',
      occurredAt: at(6, 14)
    }),
    demoTransaction(5, now, copy, {
      amountMinor: 320_00,
      accountId: 'demo-account-card',
      categoryId: 'shopping',
      title: copy.titles[4],
      merchant: copy.merchants.mall,
      paymentMethod: 'card',
      occurredAt: at(10, 20)
    }),
    demoTransaction(6, now, copy, {
      type: 'transfer',
      amountMinor: 500_00,
      accountId: 'account-default',
      destinationAccountId: 'demo-account-cash',
      categoryId: null,
      title: copy.titles[5],
      merchant: null,
      occurredAt: at(12, 11)
    }),
    demoTransaction(7, now, copy, {
      amountMinor: 159_00,
      categoryId: 'utilities',
      title: copy.titles[6],
      merchant: copy.merchants.utility,
      occurredAt: at(15, 8)
    }),
    demoTransaction(8, now, copy, {
      amountMinor: 49_99,
      categoryId: 'subscriptions',
      title: copy.titles[7],
      merchant: copy.merchants.streaming,
      occurredAt: at(18, 7)
    }),
    demoTransaction(9, now, copy, {
      type: 'refund',
      amountMinor: 25_00,
      categoryId: 'shopping',
      title: copy.titles[8],
      merchant: copy.merchants.mall,
      originalTransactionId: 'demo-transaction-5',
      occurredAt: at(19, 13)
    })
  ];
}

function demoTransaction(
  index: number,
  now: number,
  copy: (typeof demoCopy)[Locale],
  overrides: Partial<Transaction>
): Transaction {
  return {
    id: `demo-transaction-${index}`,
    type: 'expense',
    amountMinor: 100_00,
    currencyCode: 'SAR',
    accountId: 'account-default',
    destinationAccountId: null,
    feeMinor: 0,
    categoryId: 'shopping',
    title: `${copy.fallbackTitle} ${index}`,
    merchant: copy.fallbackMerchant,
    paymentMethod: 'card',
    occurredAt: now - index * 86_400_000,
    source: 'manual',
    status: 'posted',
    reviewStatus: 'none',
    syncStatus: 'synced',
    originalTransactionId: null,
    obligationId: null,
    notes: copy.transactionNote,
    version: 1,
    adjustmentSign: 1,
    deletedAt: null,
    undoExpiresAt: null,
    createdAt: now - index * 86_400_000,
    updatedAt: now - index * 86_400_000,
    ...overrides
  };
}

// Legacy values are retained only to identify unchanged pre-remediation records.
export const legacyFixtureAccounts: Account[] = [
  {
    id: 'account-bank',
    name: 'Daily account',
    type: 'bank',
    currencyCode: 'SAR',
    openingBalanceMinor: 850_000,
    institution: 'Masarifi Bank',
    lastFour: '2048',
    creditLimitMinor: null,
    automaticTrackingEnabled: true,
    isDefault: true,
    iconKey: 'bank',
    colorKey: 'account-teal',
    notes: null,
    status: 'active',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW
  },
  {
    id: 'account-wallet',
    name: 'Wallet',
    type: 'wallet',
    currencyCode: 'SAR',
    openingBalanceMinor: 25_000,
    institution: null,
    lastFour: null,
    creditLimitMinor: null,
    automaticTrackingEnabled: true,
    isDefault: false,
    iconKey: 'wallet',
    colorKey: 'account-bronze',
    notes: null,
    status: 'active',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW
  },
  {
    id: 'account-usd',
    name: 'Travel',
    type: 'savings',
    currencyCode: 'USD',
    openingBalanceMinor: 50_000,
    institution: null,
    lastFour: '8812',
    creditLimitMinor: null,
    automaticTrackingEnabled: true,
    isDefault: false,
    iconKey: 'savings',
    colorKey: 'account-neutral',
    notes: null,
    status: 'active',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW
  },
  {
    id: 'account-archived',
    name: 'Old card',
    type: 'credit_card',
    currencyCode: 'SAR',
    openingBalanceMinor: 0,
    institution: 'Old Bank',
    lastFour: '0019',
    creditLimitMinor: 300_000,
    automaticTrackingEnabled: true,
    isDefault: false,
    iconKey: 'card',
    colorKey: 'account-neutral',
    notes: null,
    status: 'archived',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW
  }
];

export function makeLegacyFixtureTransaction(
  index: number,
  overrides: Partial<Transaction> = {}
): Transaction {
  const isIncome = index % 11 === 0;
  const type = isIncome ? 'income' : index % 17 === 0 ? 'refund' : 'expense';
  return {
    id: `transaction-${index}`,
    type,
    amountMinor: 500 + index * 37,
    currencyCode: 'SAR',
    accountId: 'account-bank',
    destinationAccountId: null,
    feeMinor: 0,
    categoryId: isIncome ? 'salary' : defaultCategorySeeds[index % 15][0],
    title: isIncome ? 'Salary' : `Merchant ${index}`,
    merchant: isIncome ? null : `Merchant ${index}`,
    paymentMethod: 'card',
    occurredAt: FIXTURE_NOW - index * 3_600_000,
    source: index % 7 === 0 ? 'automatic' : 'manual',
    status: 'posted',
    reviewStatus: index % 31 === 0 ? 'required' : 'none',
    syncStatus: index % 23 === 0 ? 'pending' : 'synced',
    originalTransactionId:
      type === 'refund' ? `transaction-${Math.max(0, index - 1)}` : null,
    obligationId: null,
    notes: null,
    version: 1,
    adjustmentSign: 1,
    deletedAt: null,
    undoExpiresAt: null,
    createdAt: FIXTURE_NOW - index * 3_600_000,
    updatedAt: FIXTURE_NOW - index * 3_600_000,
    ...overrides
  };
}

export const legacyFixtureTransactions = Array.from(
  { length: 500 },
  (_, index) => makeLegacyFixtureTransaction(index)
);

const legacyAccountFingerprints = new Set(
  legacyFixtureAccounts.map(fingerprint)
);
const legacyTransactionFingerprints = new Set(
  legacyFixtureTransactions.map(fingerprint)
);

export function isLegacyFixtureAccount(account: Account): boolean {
  return legacyAccountFingerprints.has(fingerprint(account));
}

export function isLegacyFixtureTransaction(transaction: Transaction): boolean {
  return legacyTransactionFingerprints.has(fingerprint(transaction));
}

function fingerprint(value: object): string {
  return JSON.stringify(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
}
