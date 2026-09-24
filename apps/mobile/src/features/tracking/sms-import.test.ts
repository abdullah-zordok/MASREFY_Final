import type { Account } from '@/domain/core-finance';
import type { KeywordRule } from '@/domain/app-shell';
import type { SenderRule } from '@/domain/automatic-tracking';
import type { RawSmsMessage } from '@/services/platform/sms-inbox-service';
import type { RawBankNotification } from '@/services/platform/bank-notification-service';
import { prepareFinancialMessageImport, prepareSmsImport } from './sms-import';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) =>
    Array.from(value)
      .reduce(
        (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
        0
      )
      .toString(16)
}));

const account = (patch: Partial<Account> = {}): Account => ({
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Primary',
  type: 'bank',
  currencyCode: 'SAR',
  openingBalanceMinor: 0,
  institution: 'Example Bank',
  lastFour: '4242',
  creditLimitMinor: null,
  statementDay: null,
  paymentDueDay: null,
  monthlyInterestRateBasisPoints: null,
  minimumPaymentMinor: null,
  automaticTrackingEnabled: true,
  isDefault: false,
  iconKey: null,
  colorKey: null,
  notes: null,
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  ...patch
});

const message = (patch: Partial<RawSmsMessage> = {}): RawSmsMessage => ({
  id: '1',
  sender: 'EXAMPLEBANK',
  body: 'Paid 12.50 SAR with card 4242',
  receivedAt: 1_757_678_401_000,
  ...patch
});

const keyword = (value: string, enabled = true): KeywordRule => ({
  id: `keyword-${value}`,
  group: 'expense',
  language: 'en',
  value,
  normalizedValue: value.toLowerCase(),
  origin: 'custom',
  enabled
});

const sender = (enabled = true): SenderRule => ({
  id: 'sender-1',
  normalizedSender: 'examplebank',
  displayLabel: 'Example Bank',
  institutionKey: null,
  origin: 'custom',
  enabled,
  trusted: true,
  recentUseCount: 0,
  lastUsedAt: null,
  createdAt: 1,
  updatedAt: 1
});

describe('SMS import preparation', () => {
  it('rejects OTP and marketing-only messages before financial rules', async () => {
    const result = await prepareSmsImport(
      [
        message({ id: 'otp', body: 'رمز التحقق OTP هو 123456 ولا تشاركه' }),
        message({
          id: 'promo',
          body: 'عرض خصم 20% استخدم الرابط https://example.test'
        })
      ],
      {
        keywordRules: [keyword('otp'), keyword('خصم')],
        senderRules: [sender()],
        accounts: [account()],
        knownFingerprints: new Set()
      }
    );

    expect(result.events).toEqual([]);
    expect(result.skippedFingerprints).toHaveLength(2);
  });

  it('admits enabled sender, keyword, and conservative transaction patterns only', async () => {
    const result = await prepareSmsImport(
      [
        message({ id: 'sender', body: '12 SAR', receivedAt: 10 }),
        message({
          id: 'keyword',
          body: 'special activity 13 SAR',
          receivedAt: 11
        }),
        message({
          id: 'pattern',
          sender: 'OTHER',
          body: 'Purchase 14 SAR',
          receivedAt: 12
        }),
        message({
          id: 'disabled',
          sender: 'OTHER',
          body: 'disabled 15 SAR',
          receivedAt: 13
        }),
        message({
          id: 'noise',
          sender: 'OTHER',
          body: 'Reference 16 SAR',
          receivedAt: 14
        })
      ],
      {
        keywordRules: [keyword('special activity'), keyword('disabled', false)],
        senderRules: [sender()],
        accounts: [account()],
        knownFingerprints: new Set()
      }
    );

    expect(result.events.map((event) => event.amountMinor)).toEqual([
      -1300, -1400
    ]);
    expect(result.newestReceivedAt).toBe(14);
  });

  it.each([
    ['Purchase 12 SAR at Store using mada', 'expense', 'mada'],
    ['Paid 13 SAR at Cafe using Apple Pay', 'expense', 'apple_pay'],
    ['POS purchase 14 SAR at Market', 'expense', 'pos'],
    ['Transferred 15 SAR to beneficiary', 'transfer', null],
    ['ATM withdrawal 16 SAR', 'expense', null],
    ['Salary credited 17 SAR', 'income', null],
    ['Refunded 18 SAR from Store', 'refund', null]
  ])('parses bank notification %s', async (text, kind, paymentRail) => {
    const record: RawBankNotification = {
      key: `notification-${kind}-${paymentRail}`,
      packageName: 'com.example.bank',
      title: 'Example Bank',
      text,
      postedAt: 1_757_678_401_000
    };

    const result = await prepareFinancialMessageImport([record], {
      keywordRules: [],
      senderRules: [],
      accounts: [account()],
      knownFingerprints: new Set()
    });

    expect(result.events[0]).toMatchObject({
      kind,
      metadata: expect.objectContaining({
        sourcePackage: 'com.example.bank',
        ...(paymentRail ? { paymentRail } : {})
      })
    });
    expect(result.consumedSourceKeys).toEqual([record.key]);
  });

  it('extracts merchant and last-four account hints without retaining raw notification text', async () => {
    const result = await prepareFinancialMessageImport(
      [
        {
          key: 'notification-merchant',
          packageName: 'com.example.bank',
          title: 'Purchase alert',
          text: 'Purchase 125.50 SAR at Example Store using Apple Pay card 4242',
          postedAt: 1_757_678_401_000
        }
      ],
      {
        keywordRules: [],
        senderRules: [],
        accounts: [account()],
        knownFingerprints: new Set()
      }
    );

    expect(result.events[0]).toMatchObject({
      amountMinor: -12550,
      merchant: 'Example Store',
      accountId: account().id,
      metadata: {
        paymentRail: 'apple_pay',
        sourcePackage: 'com.example.bank'
      }
    });
    expect(JSON.stringify(result.events)).not.toContain('Purchase alert');
    expect(JSON.stringify(result.events)).not.toContain('125.50 SAR');
  });

  it('keeps an account-required notification unconsumed for retry', async () => {
    const result = await prepareFinancialMessageImport(
      [
        {
          key: 'notification-account-required',
          packageName: 'com.example.bank',
          title: 'Bank',
          text: 'Purchase 12 SAR',
          postedAt: 1_757_678_401_000
        }
      ],
      {
        keywordRules: [],
        senderRules: [],
        accounts: [],
        knownFingerprints: new Set()
      }
    );

    expect(result).toMatchObject({
      events: [],
      accountRequiredCount: 1,
      consumedSourceKeys: []
    });
  });

  it.each([
    'OTP 123456 for purchase 10 SAR',
    'Discount 50% on your next purchase',
    'Your balance is available in the app',
    'Reference 10 SAR'
  ])('rejects unsafe or incomplete bank notification: %s', async (text) => {
    const result = await prepareFinancialMessageImport(
      [
        {
          key: text,
          packageName: 'com.example.bank',
          title: 'Bank',
          text,
          postedAt: 1_757_678_401_000
        }
      ],
      {
        keywordRules: [keyword('reference')],
        senderRules: [],
        accounts: [account()],
        knownFingerprints: new Set()
      }
    );

    expect(result.events).toEqual([]);
  });

  it('normalizes Arabic-Indic digits and SAR aliases into minor units', async () => {
    const result = await prepareSmsImport(
      [message({ body: 'تم شراء بمبلغ ١٢٣٫٤٥ ر.س من البطاقة ٤٢٤٢' })],
      {
        keywordRules: [],
        senderRules: [],
        accounts: [account()],
        knownFingerprints: new Set()
      }
    );

    expect(result.events).toEqual([
      expect.objectContaining({
        amountMinor: -12345,
        currency: 'SAR',
        kind: 'expense',
        accountId: '10000000-0000-4000-8000-000000000001'
      })
    ]);
  });

  it('creates stable distinct fingerprints and omits known messages', async () => {
    const options = {
      keywordRules: [] as KeywordRule[],
      senderRules: [] as SenderRule[],
      accounts: [account()],
      knownFingerprints: new Set<string>()
    };
    const original = await prepareSmsImport([message()], options);
    const repeated = await prepareSmsImport([message()], options);
    const changed = await prepareSmsImport(
      [message({ body: 'Paid 13.50 SAR with card 4242' })],
      options
    );
    const fingerprint = original.events[0]?.sourceItemKey;

    expect(fingerprint).toBe(repeated.events[0]?.sourceItemKey);
    expect(changed.events[0]?.sourceItemKey).not.toBe(fingerprint);
    await expect(
      prepareSmsImport([message()], {
        ...options,
        knownFingerprints: new Set([fingerprint!])
      })
    ).resolves.toMatchObject({
      events: [],
      skippedFingerprints: [fingerprint]
    });
  });

  it('omits a transaction notification already imported from the matching SMS', async () => {
    const options = {
      keywordRules: [] as KeywordRule[],
      senderRules: [] as SenderRule[],
      accounts: [account()],
      knownFingerprints: new Set<string>()
    };
    const sms = await prepareSmsImport([message()], options);
    const notification = await prepareFinancialMessageImport(
      [
        {
          key: 'notification-for-message-1',
          packageName: 'com.android.messaging',
          title: 'Example Bank app',
          text: 'Paid 12.50 SAR with card 4242',
          postedAt: message().receivedAt + 10_000
        }
      ],
      {
        ...options,
        knownFingerprints: new Set([sms.events[0]!.sourceItemKey])
      }
    );

    expect(notification.events).toEqual([]);
  });

  it('emits minimized structured data without sensitive source text', async () => {
    const raw =
      'Paid 12.50 SAR card 4242 OTP 987654 phone +966501234567 https://secret.test';
    const result = await prepareSmsImport(
      [message({ body: raw.replace('OTP', 'reference') })],
      {
        keywordRules: [],
        senderRules: [sender()],
        accounts: [account()],
        knownFingerprints: new Set()
      }
    );
    const serialized = JSON.stringify(result.events);

    expect(serialized).not.toContain(raw);
    expect(serialized).not.toContain('987654');
    expect(serialized).not.toContain('+966501234567');
    expect(serialized).not.toContain('https://secret.test');
    expect(result.events[0]).not.toHaveProperty('body');
  });

  it('chooses exact last four, then sole currency account, then default, otherwise requires an account', async () => {
    const exact = account({ id: 'exact', lastFour: '4242' });
    const other = account({ id: 'other', lastFour: '1111' });
    const exactResult = await prepareSmsImport([message()], {
      keywordRules: [],
      senderRules: [],
      accounts: [other, exact],
      knownFingerprints: new Set()
    });
    const soleResult = await prepareSmsImport(
      [message({ body: 'Paid 12 SAR' })],
      {
        keywordRules: [],
        senderRules: [],
        accounts: [
          account({ id: 'sar' }),
          account({ id: 'usd', currencyCode: 'USD' })
        ],
        knownFingerprints: new Set()
      }
    );
    const defaultResult = await prepareSmsImport(
      [message({ body: 'Paid 12 SAR' })],
      {
        keywordRules: [],
        senderRules: [],
        accounts: [
          account({ id: 'first' }),
          account({ id: 'default', isDefault: true })
        ],
        knownFingerprints: new Set()
      }
    );
    const ambiguous = await prepareSmsImport(
      [message({ body: 'Paid 12 SAR' })],
      {
        keywordRules: [],
        senderRules: [],
        accounts: [account({ id: 'first' }), account({ id: 'second' })],
        knownFingerprints: new Set()
      }
    );

    expect(exactResult.events[0]?.accountId).toBe('exact');
    expect(soleResult.events[0]?.accountId).toBe('sar');
    expect(defaultResult.events[0]?.accountId).toBe('default');
    expect(ambiguous).toMatchObject({ events: [], accountRequiredCount: 1 });
  });
});
