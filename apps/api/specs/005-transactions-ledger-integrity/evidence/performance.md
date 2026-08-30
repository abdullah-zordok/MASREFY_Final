# Phase 05 Performance Evidence

Date: 2026-08-30 (Asia/Riyadh)
Target: disposable local Supabase PostgreSQL 17, k6 2.2.0 with `x/sql` PostgreSQL driver
Command: `npm run test:performance:ledger`
Result: PASS (exit 0)

The runner performed a clean deterministic seed of exactly 100,000 transaction
headers and 200,000 immutable postings before load. It retained
`test/performance/artifacts/ledger-plans.txt` and
`test/performance/artifacts/ledger-summary.json`. Load then added successful
mutation rows; the post-run totals were 107,583 headers and 213,201 postings.

| Operation | P50 | P95 | P99 | Maximum | Result |
|---|---:|---:|---:|---:|---|
| Owner list | 4 ms | 7 ms | 10 ms | 40 ms | PASS |
| Owner search | 9 ms | 12 ms | 15 ms | 48 ms | PASS |
| Account summary | 4 ms | 6 ms | 9 ms | 31 ms | PASS |
| Create | 12 ms | 141 ms | 161 ms | 190 ms | PASS |
| Transfer | 11 ms | 18 ms | 156 ms | 191 ms | PASS |
| Hot-owner lock wait | 17 ms | 164.10 ms | 185 ms | 481 ms | PASS |
| Reconciliation | 140 ms | 172.25 ms | 201.69 ms | 357 ms | PASS |

- 55,079 measured operations passed at 1,808.80 operations/second.
- Errors: 0 of 55,079; bounded checks: 55,079 passed, 0 failed.
- Maximum list payload: 57,586 bytes (limit 204,800).
- Maximum mutation payload: 340 bytes (limit 51,200).
- Maximum account-summary payload: 12,822 bytes (limit 153,600).
- Maximum observed lock waiters: 0 (limit 8).
- Successful samples: 16,491 lists, 13,709 searches, 17,312 account summaries,
  1,897 creates, 1,897 ordinary transfers, 3,679 hot-owner transfers, and 94
  reconciliation batches.

Retained `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` evidence contains no
sequential scan of the 100k/200k transaction or posting fact tables. PostgreSQL
selected a bounded sequential scan of the 251-row `account_balances` dimension;
the plan guard deliberately rejects only fact-table sequential scans. The owner
cursor uses `transactions_owner_cursor_idx` (0.069 ms), search uses
`transactions_search_idx` (2.344 ms), the account summary uses the account
primary key plus owner/posting indexes (0.158 ms), detail uses the transaction
primary key plus `transaction_postings_transaction_idx` (0.033 ms), and a
bounded reconciliation function scan completed in 46.406 ms. The clean
migration reset and focused reconciliation/concurrency suites passed before
this final run.
