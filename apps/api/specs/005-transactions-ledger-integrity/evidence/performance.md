# Phase 05 Performance Evidence

Date: 2026-08-30 (Asia/Riyadh)
Target: disposable local Supabase PostgreSQL 17, k6 2.2.0 with `x/sql` PostgreSQL driver
Command: `npm run test:performance:ledger`
Result: PASS (exit 0)

The runner performed a clean deterministic seed of exactly 100,000 transaction
headers and 200,000 immutable postings before load. It retained
`test/performance/artifacts/ledger-plans.txt` and
`test/performance/artifacts/ledger-summary.json`. Load then added successful
mutation rows; the post-run totals were 107,705 headers and 213,421 postings.

| Operation | P50 | P95 | P99 | Maximum | Result |
|---|---:|---:|---:|---:|---|
| Owner list | 4 ms | 7 ms | 10 ms | 40 ms | PASS |
| Owner search | 7 ms | 11 ms | 13 ms | 41 ms | PASS |
| Account summary | 4 ms | 6 ms | 9 ms | 45 ms | PASS |
| Create | 11 ms | 135 ms | 157 ms | 174 ms | PASS |
| Transfer | 11 ms | 121 ms | 153 ms | 191 ms | PASS |
| Hot-owner lock wait | 17 ms | 159 ms | 183 ms | 418 ms | PASS |
| Reconciliation | 135 ms | 163.30 ms | 190.26 ms | 304 ms | PASS |

- 56,687 measured operations passed at 1,855.71 operations/second.
- Errors: 0 of 56,687; bounded checks: 56,687 passed, 0 failed.
- Maximum list payload: 57,588 bytes (limit 204,800).
- Maximum mutation payload: 339 bytes (limit 51,200).
- Maximum account-summary payload: 12,824 bytes (limit 153,600).
- Maximum observed lock waiters: 0 (limit 8).
- Successful samples: 16,195 lists, 15,775 searches, 17,027 account summaries,
  1,921 creates, 1,921 ordinary transfers, 3,753 hot-owner transfers, and 95
  reconciliation batches.

Retained `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` evidence contains no
sequential scan of the 100k/200k transaction or posting fact tables. PostgreSQL
selected a bounded sequential scan of the 251-row `account_balances` dimension;
the plan guard deliberately rejects only fact-table sequential scans. The owner
cursor uses `transactions_owner_cursor_idx` (0.060 ms), search uses
`transactions_search_idx` (1.899 ms), the account summary uses the account
primary key plus owner/posting indexes (0.135 ms), detail uses the transaction
primary key plus `transaction_postings_transaction_idx` (0.098 ms), and a
bounded reconciliation function scan completed in 53.826 ms. The clean
migration reset and focused reconciliation/concurrency suites passed before
this final run.
