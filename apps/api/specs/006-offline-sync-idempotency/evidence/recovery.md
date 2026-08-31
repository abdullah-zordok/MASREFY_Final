# Recovery Rehearsal Evidence

Date: 2026-08-31
Environment: disposable local Supabase only.

## Proven locally

- Live mutation integration proved concurrent duplicate receipt replay, partial
  receipt durability, expired-lease reclaim, and stale-fence rejection.
- Live worker integration reclaimed an expired lease, rejected its stale token
  with `SYNC_MUTATION_LEASE_LOST`, and completed the current fence once.
- pgTAP proved bounded retention preserves active checkpoints, locked work,
  conflict-linked mutations, and unpublished/locked outbox events.
- `private.check_sync_reconciliation()` detects ahead checkpoints, retained
  cursor gaps, and conflict/receipt drift; `sync-state.cleanup` invokes it.
- Migration reset and 746 pgTAP assertions passed from the Phase 05 baseline;
  checksums are current and the migration is additive.
- The Mobile native SQLite rehearsal upgraded populated v9 data to v10 without a
  wipe and preserved ambiguous legacy money for explicit review.
- Query plans retained `outbox_events_sync_delta_idx` and
  `client_mutations_claim_idx` under the 100,000-resource workload.

## Final rehearsal

- `npm run test:sync:recovery`: 1 suite/3 tests passed, proving additive ordering,
  backup/restore of queues/checkpoints/cursor history, and the previous account
  query shape.
- `npm run test:migration`: 4 suites/4 tests passed, covering idempotent apply,
  exhaustive inventory, checksums, concurrent startup, and backup/restore.
- `npm run test:release-image`: the pinned image built and the full 8-suite,
  20-test container gate passed against it.
- Reconciliation and retention were re-proved by the clean reset, 746 pgTAP
  assertions, and 11 live sync integration tests with zero unexplained drift.

No destructive rollback is defined. A deployed schema defect is corrected by a
new forward migration; existing idempotency receipts, sync state, conflicts,
outbox metadata, and Mobile data are retained.
