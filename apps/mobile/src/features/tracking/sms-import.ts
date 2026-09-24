import * as Crypto from 'expo-crypto';

import type { KeywordRule } from '@/domain/app-shell';
import {
  normalizeSender,
  type SenderRule,
  type TrackingImportEvent
} from '@/domain/automatic-tracking';
import {
  accountAllowsAutomaticTracking,
  type Account
} from '@/domain/core-finance';
import { getCurrencyMinorUnitScale } from '@/domain/currencies';
import type { RawSmsMessage } from '@/services/platform/sms-inbox-service';
import type { RawBankNotification } from '@/services/platform/bank-notification-service';

export interface PreparedSmsImport {
  events: TrackingImportEvent[];
  skippedFingerprints: string[];
  newestReceivedAt: number | null;
  accountRequiredCount: number;
  consumedSourceKeys: string[];
}

const otpPattern =
  /\botp\b|one[\s-]?time|verification\s*code|رمز\s*(?:التحقق|الأمان)|كود\s*التحقق/iu;
const marketingPattern =
  /\boffer\b|\bpromo\b|\bdiscount\b|عرض|خصم\s+\d+\s*%|اشتر/iu;
const kindPatterns: [NonNullable<TrackingImportEvent['kind']>, RegExp][] = [
  ['refund', /\brefund(?:ed)?\b|استرداد|مسترد/iu],
  [
    'income',
    /\bsalary\b|\bcredited\b|\bdeposit(?:ed)?\b|\breceived\b|راتب|إيداع|ايداع|استلام/iu
  ],
  ['transfer', /\btransfer(?:red)?\b|تحويل/iu],
  ['expense', /\bwithdraw(?:al|n)?\b|سحب/iu],
  ['fee', /\bfees?\b|رسوم/iu],
  [
    'expense',
    /\bpaid\b|\bpurchase\b|\bspent\b|\bdebit(?:ed)?\b|\bcharged\b|شراء|دفع|خصم/iu
  ]
];
const paymentRailPatterns: [string, RegExp][] = [
  ['apple_pay', /\bapple\s+pay\b/iu],
  ['mada', /\bmada\b|مدى/iu],
  ['pos', /\bpos\b/iu],
  ['visa', /\bvisa\b/iu],
  ['mastercard', /\bmastercard\b/iu]
];
const keywordKind: Record<
  KeywordRule['group'],
  NonNullable<TrackingImportEvent['kind']> | null
> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
  withdrawal: 'expense',
  deposit: 'income',
  refund: 'refund',
  subscription: 'expense',
  installment: 'expense',
  fee: 'fee',
  failed_transaction: null,
  reversal: 'refund'
};
const currencies: [string, string][] = [
  ['SAR', 'SAR|ر\s*\.\s*س|ريال(?:\s+سعودي)?'],
  ['AED', 'AED|د\s*\.\s*إ|درهم(?:\s+إماراتي)?'],
  ['USD', 'USD|US\\$|دولار'],
  ['KWD', 'KWD|د\s*\.\s*ك|دينار(?:\s+كويتي)?'],
  ['QAR', 'QAR|ر\s*\.\s*ق|ريال(?:\s+قطري)']
];

export async function prepareSmsImport(
  messages: readonly RawSmsMessage[],
  options: {
    keywordRules: readonly KeywordRule[];
    senderRules: readonly SenderRule[];
    accounts: readonly Account[];
    knownFingerprints: ReadonlySet<string>;
  }
): Promise<PreparedSmsImport> {
  return prepareFinancialMessageImport(messages, options);
}

export async function prepareFinancialMessageImport(
  messages: readonly (RawSmsMessage | RawBankNotification)[],
  options: {
    keywordRules: readonly KeywordRule[];
    senderRules: readonly SenderRule[];
    accounts: readonly Account[];
    knownFingerprints: ReadonlySet<string>;
  }
): Promise<PreparedSmsImport> {
  const events: TrackingImportEvent[] = [];
  const skippedFingerprints: string[] = [];
  const consumedSourceKeys: string[] = [];
  let newestReceivedAt: number | null = null;
  let accountRequiredCount = 0;

  for (const input of messages) {
    const message = normalizeMessage(input);
    newestReceivedAt = Math.max(newestReceivedAt ?? 0, message.receivedAt);
    const normalized = normalize(message.body);
    const fingerprint = await fingerprintMessage(message, normalized);
    if (
      options.knownFingerprints.has(fingerprint) ||
      otpPattern.test(normalized) ||
      marketingPattern.test(normalized)
    ) {
      skippedFingerprints.push(fingerprint);
      if (message.packageName) consumedSourceKeys.push(message.sourceKey);
      continue;
    }
    const parsed = parseAmount(normalized);
    const kind = detectKind(normalized, message.sender, options);
    if (!parsed || kind === null) {
      skippedFingerprints.push(fingerprint);
      if (message.packageName) consumedSourceKeys.push(message.sourceKey);
      continue;
    }
    const selectedAccount = selectAccount(
      normalized,
      parsed.currency,
      options.accounts
    );
    if (!selectedAccount) {
      accountRequiredCount += 1;
      continue;
    }
    const receivedAt = new Date(message.receivedAt);
    if (Number.isNaN(receivedAt.valueOf())) {
      skippedFingerprints.push(fingerprint);
      if (message.packageName) consumedSourceKeys.push(message.sourceKey);
      continue;
    }
    const amountMinor =
      kind === 'income' || kind === 'refund'
        ? parsed.amountMinor
        : -parsed.amountMinor;
    const safeSender = minimizedSender(message.sender);
    const paymentRail = detectPaymentRail(normalized);
    const merchant = kind === 'expense' ? extractMerchant(message.body) : null;
    events.push({
      sourceItemKey: fingerprint,
      ...(safeSender ? { sender: safeSender } : {}),
      amountMinor,
      currency: parsed.currency,
      kind,
      ...(merchant ? { merchant } : {}),
      accountId: selectedAccount.id,
      ...(message.packageName
        ? {
            metadata: {
              sourcePackage: message.packageName,
              ...(paymentRail ? { paymentRail } : {})
            }
          }
        : {}),
      receivedAt: receivedAt.toISOString(),
      occurredAt: receivedAt.toISOString()
    });
    if (message.packageName) consumedSourceKeys.push(message.sourceKey);
  }

  return {
    events,
    skippedFingerprints,
    newestReceivedAt,
    accountRequiredCount,
    consumedSourceKeys
  };
}

interface NormalizedFinancialMessage {
  sourceKey: string;
  sender: string;
  packageName: string | null;
  body: string;
  receivedAt: number;
}

function normalizeMessage(
  message: RawSmsMessage | RawBankNotification
): NormalizedFinancialMessage {
  if ('body' in message) {
    return {
      sourceKey: message.id,
      sender: message.sender,
      packageName: null,
      body: message.body,
      receivedAt: message.receivedAt
    };
  }
  return {
    sourceKey: message.key,
    sender: message.packageName,
    packageName: message.packageName,
    body: message.text || message.title,
    receivedAt: message.postedAt
  };
}

async function fingerprintMessage(
  message: NormalizedFinancialMessage,
  normalizedBody: string
): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${Math.floor(message.receivedAt / 300_000)}\n${normalizedBody}`
  );
  return `sha256:${digest}`;
}

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en');
}

function detectKind(
  value: string,
  sender: string,
  options: {
    keywordRules: readonly KeywordRule[];
    senderRules: readonly SenderRule[];
  }
): NonNullable<TrackingImportEvent['kind']> | null {
  const structuredKind = kindPatterns.find(([, pattern]) =>
    pattern.test(value)
  )?.[0];
  if (structuredKind) return structuredKind;
  const normalizedSender = normalizeSender(sender);
  const trustedSender = options.senderRules.some(
    (rule) =>
      rule.enabled &&
      rule.trusted &&
      normalizeSender(rule.normalizedSender) === normalizedSender
  );
  if (!trustedSender) return null;
  const keyword = options.keywordRules.find(
    (rule) => rule.enabled && value.includes(normalize(rule.value))
  );
  return keyword ? keywordKind[keyword.group] : null;
}

function detectPaymentRail(value: string): string | null {
  return (
    paymentRailPatterns.find(([, pattern]) => pattern.test(value))?.[0] ?? null
  );
}

function extractMerchant(value: string): string | null {
  const match = value.match(
    /(?:\bat\b|\bfrom\b|لدى|من)\s+(.+?)(?=\s+(?:using|with|via|card|account|ending|بواسطة|عن\s+طريق)\b|$)/iu
  )?.[1];
  return match?.trim().slice(0, 160) || null;
}

function parseAmount(
  value: string
): { amountMinor: number; currency: string } | null {
  for (const [currency, token] of currencies) {
    const after = value.match(
      new RegExp(`([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(?:${token})`, 'iu')
    );
    const before = value.match(
      new RegExp(`(?:${token})\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`, 'iu')
    );
    const raw = after?.[1] ?? before?.[1];
    if (!raw) continue;
    const amount = Number(raw.replace(/,/g, ''));
    const amountMinor = Math.round(
      amount * 10 ** getCurrencyMinorUnitScale(currency)
    );
    if (Number.isSafeInteger(amountMinor) && amountMinor > 0)
      return { amountMinor, currency };
  }
  return null;
}

function selectAccount(
  body: string,
  currency: string,
  accounts: readonly Account[]
): Account | null {
  const eligible = accounts.filter(
    (account) =>
      account.currencyCode === currency &&
      accountAllowsAutomaticTracking(account)
  );
  const hinted = body.match(
    /(?:card|account|acct|ending|بطاقة|حساب)[^0-9]{0,20}([0-9]{4})(?![0-9])/iu
  )?.[1];
  if (hinted) {
    const exact = eligible.filter((account) => account.lastFour === hinted);
    if (exact.length === 1) return exact[0] ?? null;
    if (exact.length > 1) return null;
  }
  if (eligible.length === 1) return eligible[0] ?? null;
  const defaults = eligible.filter((account) => account.isDefault);
  return defaults.length === 1 ? (defaults[0] ?? null) : null;
}

function minimizedSender(value: string): string | null {
  const normalized = value.normalize('NFKC').trim();
  return /https?:|\+?\d{4,}/iu.test(normalized)
    ? null
    : normalized.slice(0, 80);
}
