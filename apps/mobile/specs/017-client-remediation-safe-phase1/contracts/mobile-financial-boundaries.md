# Contract: Mobile Financial and Tracking Boundaries

## Category

Create/update accepts explicit bilingual labels, current visual fields, and
`financialType: income | expense`. Transfer is rejected because it is a transaction type.

## Transaction

Create/update rejects any transfer with a category. Refund creation rejects a missing or
ineligible original, account/currency mismatch, or amount above remaining refundable value.
Rejection is atomic.

## Card payoff

`createCardPayoff(input, operationId)` returns the existing `MutationResult<Transaction>`. It
creates one category-free transfer with `transferPurpose: card_payoff`, reusing operation
persistence and current account/transaction/Home/report/assistant invalidation scopes.

## Projection

- eligible refund: positive account delta, negative expense, zero income
- internal transfer/card payoff: source debit and destination credit, zero income/expense
- invalid request: no stored transaction; legacy invalid projection stays informational until
  repaired

## Net worth

Net worth is the converted sum of signed active account balances. Negative card balances reduce
it; positive card balances remain positive. Obligations are separately labeled and not inferred
from funding accounts or subtracted again.

## Tracking

Outside explicit demo mode, capability metadata is unavailable and event processing throws
`TrackingError('permission_required')` before persistence or finance mutation. Demo mode stays
explicitly mock and user-visible as demonstration behavior.

## Compatibility

No API, Supabase, backend schema/specification, sync behavior, route, dependency, design token,
or Admin implementation is added. The additive local transaction shape must remain parseable
after one-time SPEC-BE-006 integration.
