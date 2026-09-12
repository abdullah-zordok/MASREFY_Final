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

export interface PreparedSmsImport {
  events: TrackingImportEvent[];
  skippedFingerprints: string[];
  newestReceivedAt: number | null;
  accountRequiredCount: number;
}

const otpPattern =
  /\botp\b|one[\s-]?time|verification\s*code|رمز\s*(?:التحقق|الأمان)|كود\s*التحقق/iu;
const marketingPattern =
  /\boffer\b|\bpromo\b|\bdiscount\b|عرض|خصم\s+\d+\s*%|اشتر/iu;
const kindPatterns: Array<[
  NonNullable<TrackingImportEvent['kind']>,
  RegExp
]> = [
  ['refund', /\brefund(?:ed)?\b|استرداد|مسترد/iu],
  ['income', /\bsalary\b|\bcredited\b|\bdeposit(?:ed)?\b|\breceived\b|راتب|إيداع|ايداع|استلام/iu],
  ['transfer', /\btransfer(?:red)?\b|تحويل/iu],
  ['fee', /\bfees?\b|رسوم/iu],
  ['expense', /\bpaid\b|\bpurchase\b|\bspent\b|\bdebit(?:ed)?\b|\bcharged\b|شراء|دفع|خصم/iu]
];
const currencies: Array<[string, string]> = [
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
  const events: TrackingImportEvent[] = [];
  const skippedFingerprints: string[] = [];
  let newestReceivedAt: number | null = null;
  let accountRequiredCount = 0;

  for (const message of messages) {
    newestReceivedAt = Math.max(newestReceivedAt ?? 0, message.receivedAt);
    const normalized = normalize(message.body);
    const fingerprint = await fingerprintSms(message, normalized);
    if (
      options.knownFingerprints.has(fingerprint) ||
      otpPattern.test(normalized) ||
      marketingPattern.test(normalized)
    ) {
      skippedFingerprints.push(fingerprint);
      continue;
    }
    const parsed = parseAmount(normalized);
    const kind = detectKind(normalized);
    if (!parsed || !matchesRule(message.sender, normalized, kind, options)) {
      skippedFingerprints.push(fingerprint);
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
      continue;
    }
    const amountMinor =
      kind === 'income' || kind === 'refund'
        ? parsed.amountMinor
        : -parsed.amountMinor;
    const safeSender = minimizedSender(message.sender);
    events.push({
      sourceItemKey: fingerprint,
      ...(safeSender ? { sender: safeSender } : {}),
      amountMinor,
      currency: parsed.currency,
      kind: kind ?? 'expense',
      accountId: selectedAccount.id,
      receivedAt: receivedAt.toISOString(),
      occurredAt: receivedAt.toISOString()
    });
  }

  return {
    events,
    skippedFingerprints,
    newestReceivedAt,
    accountRequiredCount
  };
}

async function fingerprintSms(
  message: RawSmsMessage,
  normalizedBody: string
): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${normalizeSender(message.sender)}\n${message.receivedAt}\n${normalizedBody}`
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
  value: string
): NonNullable<TrackingImportEvent['kind']> | null {
  return kindPatterns.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

function matchesRule(
  senderValue: string,
  body: string,
  kind: TrackingImportEvent['kind'] | null,
  options: {
    keywordRules: readonly KeywordRule[];
    senderRules: readonly SenderRule[];
  }
): boolean {
  const normalizedSender = normalizeSender(senderValue);
  return (
    kind !== null ||
    options.senderRules.some(
      (rule) =>
        rule.enabled && normalizeSender(rule.normalizedSender) === normalizedSender
    ) ||
    options.keywordRules.some(
      (rule) => rule.enabled && body.includes(normalize(rule.value))
    )
  );
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
      account.currencyCode === currency && accountAllowsAutomaticTracking(account)
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
  return /https?:|\+?\d{4,}/iu.test(normalized) ? null : normalized.slice(0, 80);
}
