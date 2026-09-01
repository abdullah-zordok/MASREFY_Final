# Phase 07 Client Contract Inventory

## Mobile Runtime Sources

- `apps/mobile/src/services/contracts/financial-planning-service.ts`: salary,
  multiple budgets, obligations, payment preview/confirm/reverse/settlement,
  match review, savings, reporting snapshot, drafts, and conflicts.
- `apps/mobile/src/domain/financial-planning.ts`: record metadata, exact safe
  integer money, lifecycle/state/error types, derived calculations, and
  transaction-link/create choices.
- `apps/mobile/src/storage/financial-planning-repository.ts`: persisted roots,
  links, schedules, payments, goals/movements, drafts/conflicts, stable operation
  IDs, and transaction integrity.
- `apps/mobile/src/storage/database.ts`: current SQLite schema includes migration
  10; planning payload/index/link tables originate in migration 5 and Phase 06
  sync metadata is additive.
- Planning journeys/tests under `apps/mobile/src/features/{salary,budgets,
  obligations,savings,financial-planning}` define current visible states and
  preview/confirmation behavior.

## Mapping Result

Every persisted/runtime field maps to one of:

1. a normalized Phase 07 column in `data-model.md`;
2. Phase 06 sync/operation/conflict metadata;
3. a named ledger-derived response field/view; or
4. explicit client-local draft/preview state that is revalidated on confirm.

The authoritative method-by-method mapping is
`contracts/mobile-admin-mapping.md`. HTTP minor units are canonical decimal
strings and the current Mobile adapter accepts them only inside the existing
safe-integer range; no silent rounding is allowed.

## Admin Runtime Boundary

Current Admin has no financial-planning mutation surface. Phase 07 adds only a
permission-gated read-only aggregate contract at
`GET /api/v1/admin/planning/summary`. It reuses the backend summary derivation and
does not expose direct tables or duplicate calculations.

## Cutover Result

Phase 07 proves contract/data preservation with test-owned fixtures. It does not
switch the active Mobile provider, delete mocks/seeds, create an Admin mutation
UI, or claim Phase 14 production cutover.
