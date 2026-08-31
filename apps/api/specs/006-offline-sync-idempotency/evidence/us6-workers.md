# US6 — Worker and Recovery Evidence

- `sync.worker.spec.ts`: claim/dispatch/fenced completion, stale financial conflict creation, deterministic capped retry, terminal poison rejection, and all three maintenance jobs passed. `sync-state.cleanup` also runs the bounded reconciliation check, preserving the fixed four-job contract.
- Live `sync-workers.integration.spec.ts`: an expired lease was reclaimed; its stale token returned `SYNC_MUTATION_LEASE_LOST`; the current token completed; all bounded maintenance functions executed.
- `sync-worker.container-spec.ts`: the worker module exposed all four jobs and container shutdown awaited `SyncWorker.stop()`.
- Mobile `sync-queue.test.ts`: sending rows recover to pending, retry is clamped to five minutes, and the original operation ID is retained.
- Queue readiness now bounds inspection to one stale-lease probe and at most 101 recent terminal failures; sync worker failure/retry/conflict and cursor-lag metrics use bounded labels only.
- `private.check_sync_reconciliation()` detects ahead checkpoints, retained-outbox cursor gaps, and conflict/receipt drift and raises `SYNC_RECONCILIATION_DRIFT` rather than hiding it.
- `docs/runbooks/offline-sync-recovery.md` contains non-production-by-default lease, reconciliation, retention, restore, and performance procedures with success criteria.

Result: PASS for fenced recovery, bounded retry/cleanup, graceful shutdown, health inputs, and Mobile restart persistence.
