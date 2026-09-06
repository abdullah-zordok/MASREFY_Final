import {
  normalizeAccountPatch,
  normalizeCreditCardPayoff,
  normalizeCreateAccount,
} from '../../../src/reference/reference.dto';

describe('account service', () => {
  it('defaults account automatic tracking on and accepts explicit create/update controls', () => {
    expect(normalizeCreateAccount({ name: 'A', type: 'bank', currency: 'SAR' })).toMatchObject({
      automaticTrackingEnabled: true,
    });
    expect(
      normalizeCreateAccount({
        name: 'A',
        type: 'bank',
        currency: 'SAR',
        automaticTrackingEnabled: false,
      }),
    ).toMatchObject({ automaticTrackingEnabled: false });
    expect(normalizeAccountPatch({ expectedVersion: 1, automaticTrackingEnabled: false })).toEqual({
      expectedVersion: 1,
      automaticTrackingEnabled: false,
    });
  });

  it.each(['bank', 'debit_card', 'credit_card', 'wallet', 'cash', 'savings', 'other'])(
    'accepts the %s account type',
    (type) => {
      expect(normalizeCreateAccount({ name: 'A', type, currency: 'SAR' })).toMatchObject({ type });
    },
  );

  it('enforces credit-card, last-four, safe-money, date, and currency-lock boundaries', () => {
    expect(() =>
      normalizeCreateAccount({ name: 'A', type: 'cash', currency: 'SAR', creditLimitMinor: 1 }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeCreateAccount({ name: 'A', type: 'credit_card', currency: 'SAR', lastFour: '12x4' }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeCreateAccount({
        name: 'A',
        type: 'cash',
        currency: 'SAR',
        sortOrder: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeCreateAccount({ name: 'A', type: 'cash', currency: 'SAR', openedAt: 'bad' }),
    ).toThrow('VALIDATION_FAILED');
    expect(() =>
      normalizeCreateAccount({ name: 'A', type: 'cash', currency: 'SAR', openedAt: '2026-02-31' }),
    ).toThrow('VALIDATION_FAILED');
    expect(() => normalizeAccountPatch({ expectedVersion: 1, currency: 'USD' })).toThrow(
      'ACCOUNT_CURRENCY_LOCKED',
    );
  });

  it.each([0, 1, -1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER])(
    'accepts safe opening amount %s for atomic ledger handoff',
    (openingBalanceMinor) => {
      expect(
        normalizeCreateAccount({ name: 'A', type: 'cash', currency: 'SAR', openingBalanceMinor }),
      ).toMatchObject({ openingBalanceMinor });
    },
  );
  it('rejects unsafe opening amounts', () => {
    expect(() =>
      normalizeCreateAccount({
        name: 'A',
        type: 'cash',
        currency: 'SAR',
        openingBalanceMinor: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow('VALIDATION_FAILED');
  });

  it('normalizes nullable credit-card terms and explicit payoff inputs', () => {
    expect(
      normalizeCreateAccount({
        name: 'Card',
        type: 'credit_card',
        currency: 'SAR',
        statementDay: 7,
        paymentDueDay: 21,
        monthlyInterestRateBasisPoints: 125,
        minimumPaymentMinor: 5_000,
      }),
    ).toMatchObject({
      statementDay: 7,
      paymentDueDay: 21,
      monthlyInterestRateBasisPoints: 125,
      minimumPaymentMinor: 5_000,
    });
    expect(
      normalizeCreateAccount({ name: 'Old card', type: 'credit_card', currency: 'SAR' }),
    ).toMatchObject({
      statementDay: null,
      paymentDueDay: null,
      monthlyInterestRateBasisPoints: null,
      minimumPaymentMinor: null,
    });
    expect(
      normalizeCreditCardPayoff({
        balanceMinor: 10_000,
        monthlyInterestRateBasisPoints: 100,
        paymentMinor: 3_000,
      }),
    ).toEqual({
      balanceMinor: 10_000,
      monthlyInterestRateBasisPoints: 100,
      paymentMinor: 3_000,
    });
  });

  it.each([
    { statementDay: 0 },
    { statementDay: 29 },
    { paymentDueDay: 0 },
    { paymentDueDay: 29 },
    { monthlyInterestRateBasisPoints: -1 },
    { monthlyInterestRateBasisPoints: 10_001 },
    { minimumPaymentMinor: 0 },
  ])('rejects invalid credit-card terms %#', (term) => {
    expect(() =>
      normalizeCreateAccount({
        name: 'Card',
        type: 'credit_card',
        currency: 'SAR',
        ...term,
      }),
    ).toThrow('VALIDATION_FAILED');
  });

  it('rejects card terms on non-card accounts while allowing a type transition patch', () => {
    expect(() =>
      normalizeCreateAccount({
        name: 'Cash',
        type: 'cash',
        currency: 'SAR',
        statementDay: 1,
      }),
    ).toThrow('VALIDATION_FAILED');
    expect(normalizeAccountPatch({ expectedVersion: 1, type: 'bank' })).toEqual({
      expectedVersion: 1,
      type: 'bank',
      creditLimitMinor: null,
      statementDay: null,
      paymentDueDay: null,
      monthlyInterestRateBasisPoints: null,
      minimumPaymentMinor: null,
    });
  });

  it.each([
    { balanceMinor: -1, monthlyInterestRateBasisPoints: 100, paymentMinor: 100 },
    { balanceMinor: 1, monthlyInterestRateBasisPoints: 10_001, paymentMinor: 100 },
    { balanceMinor: 1, monthlyInterestRateBasisPoints: 100, paymentMinor: 0 },
    { balanceMinor: 1, monthlyInterestRateBasisPoints: 1.5, paymentMinor: 100 },
  ])('rejects invalid payoff inputs %#', (input) => {
    expect(() => normalizeCreditCardPayoff(input)).toThrow('VALIDATION_FAILED');
  });
});
