# Outbox Performance Remediation

## Failed-main evidence

Workflow `33599760208` on baseline commit `94f766b7` failed only the database job's
Outbox performance step. Steady-state claim latency was P95 23 ms, P99 131.38 ms,
average 12.16 ms, median 9 ms, and maximum 212 ms against unchanged thresholds of
50 ms P95 and 100 ms P99. There were zero claim failures, publication P99 was
126.51 ms against 1,000 ms, and about 139,552 events published over 2,920 claims.

The captured query plan used `outbox_events_claim_order_idx`; the selector returned
100 rows in 0.553 ms with 205 buffer hits. The query/index was not the tail source.
Earlier successful runs using the same SQL had P99 values of 45.70 and 42.94 ms.

## Root cause and fix

The tail outliers occurred on the synchronous WAL commit/fsync of the recoverable
lease-update transaction, not in row selection. Durable enqueue and publication
remain synchronous. `private.claim_outbox_batch` now sets transaction-local
`synchronous_commit=off`: if a process/host loses that recent lease update, the
event simply becomes claimable again, while the outbox's at-least-once contract and
durable payload are preserved.

A new pgTAP assertion first failed with `on` versus expected `off`, then passed
after migration `20260902083036_outbox_claim_async_commit.sql`. Thresholds were not
changed.

## Local verification

- clean database reset applied the new migration;
- database lint: zero findings;
- latest pgTAP: 36 files and 1,304 assertions passed;
- focused unit tests: 3/3 passed;
- checksum and whitespace checks passed;
- one-million-row CI-style k6 run: 4,095 iterations, 201,000/201,000 checks, zero
  claim failures, steady P95 6 ms and P99 16.03 ms, overall claim P99 24 ms,
  publication P95 16 ms and P99 21 ms, maximum claim 100 ms, 198,125 published.
- final clean CI-equivalent rerun: one-million-row indexed plan completed in
  0.572 ms; all six claim/outage/restart/lease-churn/backlog scenarios and
  167,100/167,100 checks passed; steady claim P95/P99 was 8/28 ms, overall claim
  P99 30.84 ms, publication P95/P99 18/21 ms, and claim failures were 0%.

Commit `49f38b72f230a317a6b271dde6612030eeaa7d55` contains only the migration,
pgTAP assertion, checksum, and sanitized first-error performance diagnostic.

The fresh repair workflow `33610290411` passed all database steps through ledger
performance but stopped at an unrelated sync latency threshold before reaching the
Outbox step. Final pushed-main workflow `33744378707` subsequently passed the full
database job, including the Outbox performance and stress steps, without changing
the 50 ms P95 or 100 ms P99 thresholds.
