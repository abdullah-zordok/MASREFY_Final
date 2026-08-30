import * as ledgerDto from '../../../src/ledger/ledger.dto';

const {
  normalizeCreateTransaction,
  normalizeDelete,
  normalizeRefund,
  normalizeRestore,
  normalizeReverse,
  normalizeRevision,
  normalizeTransfer,
} = ledgerDto;

const accountId = '10000000-0000-4000-8000-000000000001';
const categoryId = '10000000-0000-4000-8000-000000000002';
const valid = {
  kind: 'expense',
  amountMinor: 1250,
  currency: 'SAR',
  accountId,
  categoryId,
  title: '  Groceries  ',
  merchant: '  Market  ',
  paymentMethod: '  card  ',
  note: null,
  occurredAt: '2026-08-30T08:00:00.000Z',
};

describe('ledger DTO normalization', () => {
  it('returns one fixed-key normalized create command', () => {
    expect(normalizeCreateTransaction(valid, new Date('2026-08-30T08:01:00.000Z'))).toEqual({
      kind: 'expense',
      amountMinor: 1250,
      currency: 'SAR',
      accountId,
      categoryId,
      title: 'Groceries',
      merchant: 'Market',
      paymentMethod: 'card',
      note: null,
      occurredAt: '2026-08-30T08:00:00.000Z',
      source: 'manual',
      externalRef: null,
    });
  });

  it.each([
    [{ ...valid, surprise: true }],
    [{ ...valid, kind: 'transfer' }],
    [{ ...valid, amountMinor: 0 }],
    [{ ...valid, amountMinor: Number.MAX_SAFE_INTEGER + 1 }],
    [{ ...valid, currency: 'sar' }],
    [{ ...valid, accountId: categoryId.slice(0, -1) + 'x' }],
    [{ ...valid, categoryId: 'not-a-uuid' }],
    [{ ...valid, title: '   ' }],
    [{ ...valid, title: 'x'.repeat(161) }],
    [{ ...valid, paymentMethod: 'x'.repeat(81) }],
    [{ ...valid, note: 'x'.repeat(501) }],
    [{ ...valid, occurredAt: 'not-a-date' }],
    [{ ...valid, occurredAt: '1899-12-31T23:59:59.999Z' }],
    [{ ...valid, occurredAt: '2026-08-30T08:06:00.001Z' }],
    [{ ...valid, title: 'bad\u0000text' }],
  ])('rejects an invalid public create payload %#', (body) => {
    expect(() => normalizeCreateTransaction(body, new Date('2026-08-30T08:01:00.000Z'))).toThrow(
      'VALIDATION_FAILED',
    );
  });
});

describe('transfer DTO normalization', () => {
  const destinationAccountId = '10000000-0000-4000-8000-000000000004';
  const transfer = {
    sourceAccountId: accountId,
    destinationAccountId,
    amountMinor: 5000,
    currency: 'SAR',
    feeMinor: 25,
    occurredAt: '2026-08-30T08:00:00Z',
    title: '  Wallet move  ',
    note: null,
  };
  it('returns one fixed transfer command with the source as default fee account', () => {
    expect(normalizeTransfer(transfer, new Date('2026-08-30T08:01:00Z'))).toEqual({
      sourceAccountId: accountId,
      destinationAccountId,
      amountMinor: 5000,
      currency: 'SAR',
      feeMinor: 25,
      feeAccountId: accountId,
      occurredAt: '2026-08-30T08:00:00.000Z',
      title: 'Wallet move',
      note: null,
    });
  });
  it.each([
    { ...transfer, sourceAccountId: destinationAccountId },
    { ...transfer, amountMinor: 0 },
    { ...transfer, feeMinor: -1 },
    { ...transfer, feeMinor: 5001 },
    { ...transfer, feeAccountId: 'bad' },
    { ...transfer, currency: 'sar' },
    { ...transfer, extra: true },
  ])('rejects invalid transfer %#', (value) => {
    expect(() => normalizeTransfer(value, new Date('2026-08-30T08:01:00Z'))).toThrow(
      'VALIDATION_FAILED',
    );
  });
});

describe('revision DTO normalization', () => {
  it('separates concurrency/reason fields from an allowlisted patch', () => {
    expect(
      normalizeRevision(
        {
          expectedVersion: 3,
          reason: '  receipt correction ',
          amountMinor: 1500,
          merchant: null,
          title: ' Corrected ',
        },
        new Date('2026-08-30T08:01:00Z'),
      ),
    ).toEqual({
      expectedVersion: 3,
      reason: 'receipt correction',
      patch: { amountMinor: 1500, merchant: null, title: 'Corrected' },
    });
  });
  it.each([
    { expectedVersion: 1, reason: 'reason' },
    { expectedVersion: 0, reason: 'reason', title: 'x' },
    { expectedVersion: 1, reason: '', title: 'x' },
    { expectedVersion: 1, reason: 'x', kind: 'income' },
    { expectedVersion: 1, reason: 'x', occurredAt: 'bad' },
    { expectedVersion: 1, reason: 'x', merchant: '' },
  ])('rejects invalid revision %#', (value) => {
    expect(() => normalizeRevision(value, new Date('2026-08-30T08:01:00Z'))).toThrow(
      'VALIDATION_FAILED',
    );
  });
});

describe('refund and reversal DTO normalization', () => {
  it('normalizes linked compensation requests', () => {
    expect(
      normalizeRefund(
        {
          expectedVersion: 2,
          amountMinor: 500,
          accountId,
          occurredAt: '2026-08-30T08:00:00Z',
          reason: ' Refund ',
        },
        new Date('2026-08-30T08:01:00Z'),
      ),
    ).toEqual({
      expectedVersion: 2,
      amountMinor: 500,
      accountId,
      occurredAt: '2026-08-30T08:00:00.000Z',
      reason: 'Refund',
    });
    expect(
      normalizeReverse(
        { expectedVersion: 2, reason: ' Duplicate ' },
        new Date('2026-08-30T08:01:00Z'),
      ),
    ).toEqual({ expectedVersion: 2, occurredAt: '2026-08-30T08:01:00.000Z', reason: 'Duplicate' });
  });
  it.each([
    { expectedVersion: 0, amountMinor: 1, occurredAt: '2026-08-30T08:00:00Z', reason: 'x' },
    { expectedVersion: 1, amountMinor: 0, occurredAt: '2026-08-30T08:00:00Z', reason: 'x' },
    { expectedVersion: 1, amountMinor: 1, occurredAt: 'bad', reason: 'x' },
    {
      expectedVersion: 1,
      amountMinor: 1,
      occurredAt: '2026-08-30T08:00:00Z',
      reason: '',
      extra: true,
    },
  ])('rejects invalid refund %#', (value) => {
    expect(() => normalizeRefund(value, new Date('2026-08-30T08:01:00Z'))).toThrow(
      'VALIDATION_FAILED',
    );
  });
  it.each([
    { expectedVersion: 0, reason: 'x' },
    { expectedVersion: 1, reason: '' },
    { expectedVersion: 1, reason: 'x', accountId },
  ])('rejects invalid reversal %#', (value) => {
    expect(() => normalizeReverse(value, new Date('2026-08-30T08:01:00Z'))).toThrow(
      'VALIDATION_FAILED',
    );
  });
});

describe('delete and restore DTO normalization', () => {
  it('keeps delete reason and restore version exact', () => {
    expect(normalizeDelete({ expectedVersion: 4, reason: ' Duplicate ' })).toEqual({
      expectedVersion: 4,
      reason: 'Duplicate',
    });
    expect(normalizeRestore({ expectedVersion: 5 })).toEqual({ expectedVersion: 5 });
  });
  it.each([
    { expectedVersion: 0, reason: 'x' },
    { expectedVersion: 1, reason: '' },
    { expectedVersion: 1, reason: 'x', extra: true },
  ])('rejects invalid delete %#', (value) => {
    expect(() => normalizeDelete(value)).toThrow('VALIDATION_FAILED');
  });
  it.each([{}, { expectedVersion: 0 }, { expectedVersion: 1, reason: 'x' }])(
    'rejects invalid restore %#',
    (value) => {
      expect(() => normalizeRestore(value)).toThrow('VALIDATION_FAILED');
    },
  );
});

type LedgerReadDto = {
  cursor: string | null;
  limit: number;
  accountId: string | null;
  categoryId: string | null;
  kind: string | null;
  status: string | null;
  source: string | null;
  from: string | null;
  to: string | null;
  query: string | null;
};

type LedgerReadDtoApi = typeof ledgerDto & {
  normalizeLedgerRead(value: unknown): LedgerReadDto;
  decodeLedgerCursor(cursor: string): { occurredAt: string; id: string };
  encodeLedgerCursor(cursor: { occurredAt: string; id: string }): string;
  assertTransactionDetail(value: unknown): void;
  assertAccountSummary(value: unknown): void;
};

const reads = ledgerDto as LedgerReadDtoApi;
const transactionId = '10000000-0000-4000-8000-000000000010';

describe('ledger read DTO normalization', () => {
  it('normalizes every bounded filter and the default page size', () => {
    expect(
      reads.normalizeLedgerRead({
        accountId,
        categoryId,
        kind: 'expense',
        status: 'confirmed',
        source: 'manual',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.999Z',
        query: '  grocery  ',
      }),
    ).toEqual({
      cursor: null,
      limit: 25,
      accountId,
      categoryId,
      kind: 'expense',
      status: 'confirmed',
      source: 'manual',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      query: 'grocery',
    });
  });

  it('accepts an opaque keyset cursor only when its timestamp and UUID decode exactly', () => {
    const cursor = reads.encodeLedgerCursor({
      occurredAt: '2026-08-30T08:00:00.000Z',
      id: transactionId,
    });
    expect(reads.normalizeLedgerRead({ cursor, limit: '100' })).toMatchObject({
      cursor,
      limit: 100,
    });
    expect(reads.decodeLedgerCursor(cursor)).toEqual({
      occurredAt: '2026-08-30T08:00:00.000Z',
      id: transactionId,
    });
  });

  it.each([
    { cursor: 'not-an-opaque-cursor' },
    { limit: '0' },
    { limit: '101' },
    { limit: '1.5' },
    { accountId: 'not-a-uuid' },
    { kind: 'split' },
    { status: 'hidden' },
    { source: ' ' },
    { from: 'not-a-date' },
    { to: 'not-a-date' },
    { from: '2026-08-31T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    { query: 'x'.repeat(101) },
    { surprise: 'field' },
  ])('rejects malformed or unbounded ledger read query %#', (value) => {
    expect(() => reads.normalizeLedgerRead(value)).toThrow('VALIDATION_FAILED');
  });

  it('accepts only bounded detail and account-summary response envelopes', () => {
    expect(() => {
      reads.assertTransactionDetail({
        transaction: { id: transactionId },
        postings: [
          {
            id: '10000000-0000-4000-8000-000000000011',
            accountId,
            amountMinor: -1250,
            clearingState: 'confirmed',
            postingRole: 'source',
            occurredAt: '2026-08-30T08:00:00.000Z',
          },
        ],
        revisions: [{ revisionNo: 1, reason: 'Created', createdAt: '2026-08-30T08:00:00.000Z' }],
        ledgerVersion: 3,
        requestId: 'request-read',
      });
    }).not.toThrow();
    expect(() => {
      reads.assertAccountSummary({
        accountId,
        currency: 'SAR',
        balance: {
          accountId,
          currency: 'SAR',
          confirmedMinor: -1250,
          pendingMinor: 0,
          ledgerVersion: 3,
          reconciledAt: null,
        },
        recentTransactions: [{ id: transactionId }],
        ledgerVersion: 3,
        requestId: 'request-read',
      });
    }).not.toThrow();
  });
});
