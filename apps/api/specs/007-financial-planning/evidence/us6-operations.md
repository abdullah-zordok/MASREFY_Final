# US6 operations evidence

- Summary unit tests passed 6/6: calendar period normalization, exact money, independent budgets, partial state, owner ledger version, repeated uncached reads, and invalid input.
- Runtime HTTP contracts expose required owner/Admin period queries; Admin is GET-only and guarded by exact `planning.read`. Security tests passed 2/2.
- Worker unit tests passed 7/7 and live tests passed 3/3 across five jobs, retry/exhaustion, shutdown coalescing, crash reclaim, stale fence rejection, reminder idempotency, and reconciliation.
- Queue health includes stale and recent-exhaustion bounds. Metrics accept only five fixed job names, bounded outcomes, and reconciliation counts; observability tests passed.
- Mobile parity passed 4/4 for method/field mapping, SQLite-serializable records, exact safe-money conversion, unsafe-bigint rejection, and unchanged production provider selection.
- No process-local cache was added: no measurement justified invalidation complexity. Existing Phase 06 leases, fences, outbox, cursors, and idempotency were reused.

## Phase 14 Wave 4 correction

- A real PostgreSQL regression proved the prior summary mixed payable, receivable, and closed obligation reserves, selected received salary history as the next pending receipt, exposed closed obligations, and silently reported `ready` after truncating 101 savings children.
- The shared repository query now reserves only active payable `due|partial|overdue` items, selects only `expected` receipts, includes only active obligation summaries, probes budgets/obligations/savings and each budget's categories at 101, returns at most 100 per collection, and marks any truncation `partial`; categories are loaded by one owner-scoped parameterized query rather than per-budget fan-out.
- Focused RED-to-GREEN integration passed 2/2 and the existing summary unit suite passed 6/6. Planning logic passed 21 suites/117 tests; integration passed 9 suites/41 tests; security passed 2 suites/5 tests; recovery passed 1 suite/4 tests. The first combined integration run had one pre-existing worker-selection interference (`matches` 0 instead of 1); the isolated worker suite passed 3/3 and the unchanged full rerun passed 41/41.
