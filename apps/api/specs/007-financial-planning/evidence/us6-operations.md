# US6 operations evidence

- Summary unit tests passed 6/6: calendar period normalization, exact money, independent budgets, partial state, owner ledger version, repeated uncached reads, and invalid input.
- Runtime HTTP contracts expose required owner/Admin period queries; Admin is GET-only and guarded by exact `planning.read`. Security tests passed 2/2.
- Worker unit tests passed 7/7 and live tests passed 3/3 across five jobs, retry/exhaustion, shutdown coalescing, crash reclaim, stale fence rejection, reminder idempotency, and reconciliation.
- Queue health includes stale and recent-exhaustion bounds. Metrics accept only five fixed job names, bounded outcomes, and reconciliation counts; observability tests passed.
- Mobile parity passed 4/4 for method/field mapping, SQLite-serializable records, exact safe-money conversion, unsafe-bigint rejection, and unchanged production provider selection.
- No process-local cache was added: no measurement justified invalidation complexity. Existing Phase 06 leases, fences, outbox, cursors, and idempotency were reused.
