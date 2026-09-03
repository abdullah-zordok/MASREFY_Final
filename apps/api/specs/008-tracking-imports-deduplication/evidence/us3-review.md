# US3 Evidence — Review And Edited Acceptance

Status: implemented with ledger-boundary tests.

Evidence:

- Review items preserve original, proposed, and accepted safe values with status,
  version, decision metadata, and history/audit/outbox linkage.
- Edited acceptance allowlists only approved fields and reruns validation before
  financial creation.
- `TrackingService` and `TrackingWorker` call `LedgerService.createTransaction`
  or the existing ledger revision path; Phase 08 production code has no direct
  insert/update/delete of `transactions`, `transaction_postings`, or
  `account_balances`.
- Rejection and stale/leased decisions do not call ledger mutation methods.
- Structural security test `tracking-ledger-boundary.spec.ts` is part of the API
  security workflow.

Acceptance mapping: FR-017 through FR-021, FR-024, FR-026, FR-030, FR-032,
AC-008, AC-009, AC-010, AC-011, AC-015.
