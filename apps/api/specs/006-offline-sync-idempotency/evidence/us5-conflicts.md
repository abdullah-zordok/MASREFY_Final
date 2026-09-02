# US5 — Conflict Evidence

- pgTAP `027_sync_conflicts.test.sql`: valid transitions, idempotent same-decision replay, invalid transition rejection, and the absence of financial keep-both passed.
- Live `conflicts.integration.spec.ts`: immutable snapshots were visible only to the owner; concurrent different terminal decisions produced one winner, one rejection, one audit event, and one outbox event.
- Sync unit/contract/e2e suites passed owner-safe list/detail/resolve, cursor validation, allowed strategies, and stable safe errors.
- `sync-conflicts.test.ts` maps server conflicts into existing `finance_sync_conflicts`; `SyncConflictScreen.test.tsx` proves no keep-both action is offered.
- Client/merged strategies delegate through the existing Phase 05 ledger update path with the server version as `expectedVersion`.

Result: PASS for explicit owner-safe conflict review and one terminal decision. No automatic financial keep-both or Last Write Wins path exists.
