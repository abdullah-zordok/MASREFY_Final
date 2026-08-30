import {
  assertIdempotencyKey,
  normalizeAccountPatch,
  normalizeCreateAccount,
  normalizeCreateCategory,
} from '../../../src/reference/reference.dto';

describe('reference runtime contracts', () => {
  const dto = {
    assertIdempotencyKey,
    normalizeAccountPatch,
    normalizeCreateAccount,
    normalizeCreateCategory,
  };

  it('requires a bounded printable idempotency key', () => {
    expect(dto.assertIdempotencyKey('request-123')).toBe('request-123');
    expect(() => dto.assertIdempotencyKey('short')).toThrow('IDEMPOTENCY_KEY_REQUIRED');
    expect(() => dto.assertIdempotencyKey('bad key')).toThrow('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('defaults safe account fields and preserves a nonzero opening for the atomic ledger handoff', () => {
    expect(
      dto.normalizeCreateAccount({ name: 'Cash', type: 'cash', currency: 'SAR' }),
    ).toMatchObject({
      name: 'Cash',
      type: 'cash',
      currency: 'SAR',
      isDefault: false,
      includeInTotals: true,
      openingBalanceMinor: 0,
    });
    expect(
      dto.normalizeCreateAccount({
        name: 'Cash',
        type: 'cash',
        currency: 'SAR',
        openingBalanceMinor: 1,
      }),
    ).toMatchObject({ openingBalanceMinor: 1 });
  });

  it('requires bilingual custom labels and defaults category kind to expense', () => {
    expect(dto.normalizeCreateCategory({ labelAr: 'طعام', labelEn: 'Food' })).toMatchObject({
      kind: 'expense',
      labelAr: 'طعام',
      labelEn: 'Food',
    });
    expect(() => dto.normalizeCreateCategory({ labelAr: 'طعام' })).toThrow('VALIDATION_FAILED');
  });

  it('keeps opening balances out of account patches and reports currency locks', () => {
    expect(dto.normalizeAccountPatch({ expectedVersion: 1, creditLimitMinor: 100 })).toEqual({
      expectedVersion: 1,
      creditLimitMinor: 100,
    });
    expect(() => dto.normalizeAccountPatch({ expectedVersion: 1, openingBalanceMinor: 0 })).toThrow(
      'VALIDATION_FAILED',
    );
    expect(() => dto.normalizeAccountPatch({ expectedVersion: 1, currency: 'USD' })).toThrow(
      'ACCOUNT_CURRENCY_LOCKED',
    );
  });
});
