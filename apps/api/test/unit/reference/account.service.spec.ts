import {
  normalizeAccountPatch,
  normalizeCreateAccount,
} from '../../../src/reference/reference.dto';

describe('account service', () => {
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
});
