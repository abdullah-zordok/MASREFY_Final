# Financial planning operations

This runbook covers Phase 07 outside production. Production actions require the normal change and incident process.

## Health and backlog

- Check API readiness and the queue dependency. Planning is unhealthy when a lease is stale by more than five minutes or more than 100 claims become exhausted within five minutes.
- Inspect `private.planning_job_claims` grouped by `job_name,status`; never expose `resource_id`, user data, amounts, notes, provider keywords, or match evidence in logs or metric labels.
- The five jobs are `planning.salary-cycle.generate`, `planning.obligation-schedule.generate`, `planning.payment-match.propose`, `planning.overdue.mark`, and `planning.reminders.emit`.

## Lease recovery and replay

1. Stop the worker cleanly and wait for its active batch.
2. Confirm the affected claim is still `running` and `locked_until` has expired. Do not clear a live lease.
3. Restart the worker. The existing claim function reclaims the row with a new token; a stale completion must fail with `PLANNING_CLAIM_STALE`.
4. Confirm the natural-key unique indexes prevented duplicate receipts, schedules, matches, or reminders.
5. For API/client retries, replay the same `Idempotency-Key` and identical normalized body. A changed body must return `IDEMPOTENCY_KEY_REUSED`.

## Reconciliation

Run `private.reconcile_planning(NULL,false,100)` first. If every difference is the reconstructable `paid_projection`, run `private.reconcile_planning(NULL,true,100)` in bounded batches. Repeat dry-run until it returns zero rows. Never repair ledger transactions, immutable payments, allocations, or savings movements through this function.

## Migration and recovery

1. Take and verify a backup before applying the three ordered Phase 07 migrations.
2. Apply tables, then functions/views, then access/RLS/grants. Run database lint and all pgTAP tests.
3. On failed forward deployment, keep the failed migration immutable, add a corrected forward migration, and rehearse it on a restored copy.
4. Quarantine imported rows with invalid ownership, currency, precision, version, or immutable-history references. Do not coerce or round money.
5. Roll back application and worker images only when the deployed schema remains compatible. Database rollback is restore-based; never manually delete planning history or ledger rows.

## Escalation

Escalate immediately for repeated exhausted claims, non-zero reconciliation after repair, duplicate ledger-linked effects, cross-owner visibility, permission bypass, unsafe numeric conversion, or unexplained outbox/cursor gaps. Preserve claim state, request IDs, audit IDs, migration versions, and sanitized metric snapshots.
