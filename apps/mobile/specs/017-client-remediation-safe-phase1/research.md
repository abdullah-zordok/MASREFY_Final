# Phase 0 Research: Remaining Safe Phase 1 Client Remediation

## One canonical transaction-effects function

- **Decision**: Keep `projectTransactionEffects` and `deriveAccountBalance` as the only effects
  calculation. Prove Home, reports, assistant evidence, ledger, and source versions with one
  shared fixture.
- **Why**: Home and reports already consume it; per-screen corrections would duplicate logic.

## Category provenance versus financial meaning

- **Decision**: Keep `Category.kind` as `system | custom` because the UI uses it as origin. Add
  `financialType: income | expense`; never add transfer as a category value.
- **Why**: This expresses the missing concept without a broad provenance migration or guesses
  from labels, icons, parents, or history.

## Transfer repair and remittance reference data

- **Decision**: After SPEC-BE-006 integration, use the next idempotent Mobile SQLite migration
  to clear both indexed and JSON transfer category values. Add one stable `remittance` expense
  system category through existing default-category initialization; archive only the known
  obsolete `transfers` system record and preserve modified/custom data.
- **Why**: SQLite owns persisted relationship repair; reference seeding owns non-demo categories.
  No production migration inserts a transaction or account fixture.

## Linked refund validation

- **Decision**: Zod validates shape; `CoreFinanceRepository` validates a posted expense in the
  same account/currency and cumulative active refunds before writing. Deleted, reversed,
  refunded, review-required, transfer, income, and other originals are rejected.
- **Why**: Eligibility requires the full ledger; UI-only checks are bypassable.

## Explicit card payoff

- **Decision**: Add `createCardPayoff` to the existing contract. Validate a positive amount,
  distinct active accounts, funding availability, credit-card destination with negative balance,
  currency equality, and amount not above debt. Write one category-free transfer with
  `transferPurpose: card_payoff` and the supplied operation identity.
- **Why**: Current transfer effects already balance both accounts with zero income/expense, and
  the operation ledger already gives retry replay. No second ledger/table is needed.

## Signed card net worth and obligation separation

- **Decision**: Net worth remains the converted sum of signed active account balances. Negative
  card balances reduce it; positive card balances remain assets. Obligations stay in separately
  labeled payable/receivable planning totals and are not inferred from `fundingAccountId`.
- **Why**: Funding account is a payment source, not proof of duplicate card liability. Inference
  would reverse valid positive card values or double-count debt.

## Obligation presentation

- **Decision**: Reuse `deriveObligationStatus` and the existing overview totals. Show remaining
  beside contracted and paid values in overview/detail, with separate payable/receivable labels.
- **Why**: The service already sums remaining balances; the confirmed defect is presentation.

## Production tracking

- **Decision**: Keep the mock provider only behind explicit demo/test creation. Outside demo,
  export an unavailable provider whose event/mutation methods fail with `permission_required`
  before persistence or finance changes. Preserve paused/account opt-out decisions.
- **Why**: An unavailable status alone is insufficient while `processMockEvent` still succeeds.

## Obligation test failure

- **Decision**: Trace and remove unnecessary initialization latency or stale async work at the
  shared form/query boundary. Keep the accessibility assertion and default timeout.
- **Why**: The eventual tree proves the label is correct; longer waits only hide lifecycle debt.

## Ownership boundaries

- **Decision**: Do not touch API, Supabase, backend plans/specs, Admin without a proved copy
  defect, external archives, or active SPEC-BE-006 files before its commit. Record dependencies.
- **Why**: Repository inspection cannot complete external/device/provider work, and parallel
  edits risk duplicated sync behavior.
