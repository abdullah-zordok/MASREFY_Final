# Ledger Reconciliation And Recovery

Backend on-call owns investigation and closure. Platform owns write-disable,
worker rollout, and alert routing. Security joins if unauthorized access or data
exposure is suspected. Never update/delete postings, revisions, transaction
history, projections, or completed idempotency keys directly.

## Detect And Contain

1. Page on any `masarifi_ledger_reconciliation_mismatch_total` increase after one
   immediate bounded recheck. Record release, worker cursor, database timeline,
   request ID, account ID, mismatch kind, and ledger version; do not record money
   values or customer text in alerts/logs.
2. Disable financial POST/PATCH/DELETE traffic at the gateway. If that control is
   unavailable, ship an approved forward migration that temporarily revokes
   `masarifi_api` execution on only the Phase 05 financial command functions.
   Keep authenticated owner reads available. Do not use an ad-hoc SQL-console
   edit or a destructive down migration.
3. Stop new worker cycles and let the active bounded batch drain. Preserve the
   last successful account cursor and all outbox/idempotency rows.

## Investigate

1. On a disposable restored copy, reproduce with
   `private.reconcile_account_balance(cursor,500)` as `masarifi_worker`.
2. For each safe mismatch identifier, compare the projection with grouped
   immutable postings split by `confirmed` and `pending`. Verify transaction,
   posting, revision, audit, outbox, and completed-key counts around the first
   divergence. Check release/migration checksums, lock waits, retries, and the
   stable error trail.
3. Classify the cause before changing anything: application command defect,
   migration defect, unauthorized path, or incomplete external recovery. If the
   restored copy does not reproduce, preserve both timelines and continue from
   the primary read replica; never guess an amount.

## Forward Correct And Resume

1. Fix the root cause with reviewed code or an additive forward migration. When
   a financial correction is required, append an approved adjustment through a
   guarded ledger command with audit, outbox, expected-version, recent-auth, and
   idempotency guarantees. The reconciliation worker has no repair method.
2. Apply the fix to a restored copy, run all migrations/checksums, replay retained
   queues, and reconcile from a null cursor in batches no larger than 500 until a
   complete pass returns no mismatch. Repeated discrepancy evidence for the same
   account/version/kind must remain one outbox incident.
3. Re-enable the worker, then financial writes. Observe command/error/lock and
   reconciliation panels for at least two complete passes. Revoke any temporary
   emergency grant change through another reviewed forward migration.

Close the incident only when projections equal immutable posting sums for both
clearing states, no partial/duplicate effect exists, outbox delivery is complete,
the full verification and security gates pass, and the incident record links the
forward fix and retained recovery evidence. An unexplained mismatch is never
closed as accepted drift.
