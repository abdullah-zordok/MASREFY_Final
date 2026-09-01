import { safeError } from '../../../src/platform/http/safe-exception.filter';

describe('safeError', () => {
  it('maps internal errors to a stable bounded envelope', () => {
    const result = safeError(500, 'req-123');

    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId: 'req-123',
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|postgresql|private|stack/i);
  });

  it('preserves only approved client status categories', () => {
    expect(safeError(401, 'req-1')).toMatchObject({
      code: 'UNAUTHORIZED',
      requestId: 'req-1',
    });
    expect(safeError(503, 'req-2')).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      requestId: 'req-2',
    });
  });

  it('bounds and sanitizes validation field errors', () => {
    const unsafe = Array.from({ length: 51 }, (_, index) => ({
      field: index === 0 ? 'password=/private/path' : `field${String(index)}`,
      code: 'invalid code',
      message: 'postgresql://user:secret@db/internal stack',
    }));

    const result = safeError(400, 'req-3', unsafe);

    expect(result.fieldErrors).toHaveLength(50);
    expect(result.fieldErrors?.[0]).toEqual({
      field: 'request',
      code: 'INVALID',
      message: 'Invalid value',
    });
    expect(JSON.stringify(result)).not.toMatch(/password|private|postgresql|secret|stack/i);
  });

  it.each([
    ['IDEMPOTENCY_KEY_REUSED', 409, 'Idempotency key was already used'],
    ['IDEMPOTENCY_IN_PROGRESS', 409, 'Idempotent request is in progress'],
    ['VERSION_CONFLICT', 409, 'Resource version conflict'],
    ['ACCOUNT_NOT_POSTABLE', 409, 'Account cannot accept this transaction'],
    ['CURRENCY_MISMATCH', 409, 'Currencies do not match'],
    ['TRANSACTION_NOT_EDITABLE', 409, 'Transaction cannot be changed'],
    ['TRANSACTION_HAS_DEPENDENTS', 409, 'Transaction has dependent records'],
    ['REVERSAL_EXISTS', 409, 'Transaction was already reversed'],
    ['REFUND_EXCEEDS_AVAILABLE', 409, 'Refund exceeds the available amount'],
    ['UNDO_EXPIRED', 409, 'Undo window has expired'],
    ['LEDGER_BUSY', 409, 'Ledger is busy'],
    ['LEDGER_UNAVAILABLE', 503, 'Ledger is unavailable'],
  ])('maps the approved ledger error %s without leaking database text', (code, status, message) => {
    expect(safeError(status, 'ledger-request', [], code)).toEqual({
      code,
      message,
      requestId: 'ledger-request',
    });
  });

  it('preserves only a validated current version on a version conflict', () => {
    expect(safeError(409, 'ledger-request', [], 'VERSION_CONFLICT', 4)).toEqual({
      code: 'VERSION_CONFLICT',
      message: 'Resource version conflict',
      requestId: 'ledger-request',
      currentVersion: 4,
    });
    expect(safeError(409, 'ledger-request', [], 'VERSION_CONFLICT', -1)).not.toHaveProperty(
      'currentVersion',
    );
  });

  it.each([
    ['PLANNING_NOT_FOUND', 404, 'Planning resource was not found'],
    ['PLANNING_VERSION_CONFLICT', 409, 'Planning resource version conflict'],
    ['PLANNING_LIFECYCLE_INVALID', 409, 'Planning lifecycle transition is invalid'],
    ['PLANNING_CURRENCY_MISMATCH', 409, 'Planning currencies do not match'],
    ['PLANNING_LEDGER_STATE_INVALID', 409, 'Planning ledger state is invalid'],
    ['PLANNING_TRANSACTION_DUPLICATE', 409, 'Planning transaction is already linked'],
    ['PLANNING_ALLOCATION_INVALID', 409, 'Planning allocation is invalid'],
    ['PLANNING_PROGRESS_INSUFFICIENT', 409, 'Planning progress is insufficient'],
    ['PLANNING_REVIEW_REQUIRED', 409, 'Planning review is required'],
    ['PLANNING_RATE_LIMITED', 409, 'Planning operation is rate limited'],
  ])('maps the approved planning error %s', (code, status, message) => {
    expect(safeError(status, 'planning-request', [], code)).toEqual({
      code,
      message,
      requestId: 'planning-request',
    });
  });

  it('preserves a validated current version on a planning version conflict', () => {
    expect(safeError(409, 'planning-request', [], 'PLANNING_VERSION_CONFLICT', 7)).toEqual({
      code: 'PLANNING_VERSION_CONFLICT',
      message: 'Planning resource version conflict',
      requestId: 'planning-request',
      currentVersion: 7,
    });
  });
});
