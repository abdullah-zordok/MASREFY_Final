# Phase 05 Concurrency Evidence

## Opposite transfers

On 2026-08-30 the live integration test submitted eight simultaneous pairs of
opposite same-owner transfers (16 commands) after a three-posting fee transfer.
All 16 promises fulfilled, no application retry was required, the local
`pg_stat_database` counters reported `deadlocks=0` and `conflicts=0`, and the
three affected projections summed to exactly `-5`, the single committed fee.
The per-owner transaction-scoped advisory lock bounded waiting and left no
unresolved waiter; account rows were still locked in ascending UUID order.

## Idempotent contention

Sequential exact retries returned the stored byte-equivalent JSON body and one
effect. Hash-mismatch and failed-account cases created no additional header,
posting, revision, balance, audit, outbox, or retained claimed-key effect.

Revision, refund/reversal, and stale-writer race results are appended by their
own acceptance cycles below.

## Expected-version revision race

Two simultaneous revisions used expected version 3. Exactly one committed and
one returned `VERSION_CONFLICT`; the header ended at version 4 with exactly four
immutable revision rows (create, metadata correction, financial correction, and
the one winning race). The losing request added no posting, revision, balance,
audit, outbox, or completed idempotency effect. Metadata correction added zero
postings; the amount correction added only the `-200` delta.

## Refund/reversal races

Six fresh expenses each received a simultaneous partial-refund and full-reversal
command at expected version 1. Every race produced exactly one success, one
`VERSION_CONFLICT`, and one linked compensating header. The final account
projection equalled the sum of all immutable confirmed postings. Separate exact-
limit coverage committed refunds of 400 and 600 against 1000, rejected the next
minor unit, and the full transfer reversal inverted source, destination, and fee
postings with all three projections returning to zero.
