import { readFileSync } from 'node:fs';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

const document = load(
  readFileSync('specs/005-transactions-ledger-integrity/contracts/openapi.yaml', 'utf8'),
) as { components: { schemas: Record<string, unknown> } };
const ajv = new Ajv({ strict: false });
addFormats(ajv);

function validator(name: string): ValidateFunction {
  return ajv.compile({
    $ref: `#/components/schemas/${name}`,
    components: document.components,
  });
}

const originalId = '10000000-0000-4000-8000-000000000001';
const linkedId = '20000000-0000-4000-8000-000000000001';
const accountId = '30000000-0000-4000-8000-000000000001';
const occurredAt = '2026-09-08T12:00:00.000Z';

function summary(id: string, kind: 'income' | 'expense' | 'refund' | 'reversal') {
  return {
    id,
    kind,
    status: kind === 'expense' ? 'reversed' : 'confirmed',
    amountMinor: 1250,
    currency: 'SAR',
    accountIds: [accountId],
    sourceAccountId: accountId,
    destinationAccountId: null,
    feeMinor: 0,
    categoryId: null,
    title: kind,
    merchant: null,
    paymentMethod: null,
    note: null,
    occurredAt,
    source: 'manual',
    originalTransactionId: kind === 'expense' ? null : originalId,
    version: 1,
    deletedAt: null,
    undoExpiresAt: null,
  };
}

function linkedResponse(kind: 'refund' | 'reversal') {
  return {
    transaction: {
      transaction: summary(linkedId, kind),
      postings: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          accountId,
          amountMinor: 1250,
          clearingState: 'confirmed',
          postingRole: kind,
          occurredAt,
        },
      ],
      revisions: [],
      ledgerVersion: 12,
      requestId: `request-${kind}`,
    },
    balances: [
      {
        accountId,
        currency: 'SAR',
        confirmedMinor: 0,
        pendingMinor: 0,
        ledgerVersion: 12,
        reconciledAt: occurredAt,
      },
    ],
    ledgerVersion: 12,
    requestId: `request-${kind}`,
    original: summary(originalId, 'expense'),
  };
}

it.each(['refund', 'reversal'] as const)(
  'accepts the actual linked %s mutation response',
  (kind) => {
    const validate = validator('LinkedMutationResponse');
    const instance = linkedResponse(kind);

    expect({ valid: validate(instance), errors: validate.errors }).toEqual({
      valid: true,
      errors: null,
    });
  },
);

it('keeps linked mutation responses closed', () => {
  expect(validator('LinkedMutationResponse')({ ...linkedResponse('refund'), extra: true })).toBe(
    false,
  );
});

it('publishes explicit source and destination roles on every summary', () => {
  const schema = document.components.schemas.TransactionSummary as {
    required?: string[];
    properties?: Record<string, unknown>;
  };

  expect(schema.required).toEqual(
    expect.arrayContaining(['sourceAccountId', 'destinationAccountId']),
  );
  expect(schema.properties).toHaveProperty('sourceAccountId');
  expect(schema.properties).toHaveProperty('destinationAccountId');
});

it('accepts income with its sole account as source and no destination', () => {
  const validate = validator('TransactionSummary');
  const instance = summary(linkedId, 'income');

  expect({ valid: validate(instance), errors: validate.errors }).toEqual({
    valid: true,
    errors: null,
  });
});
