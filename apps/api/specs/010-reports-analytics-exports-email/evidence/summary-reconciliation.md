# Summary Reconciliation Evidence

Date: 2026-09-04  
Scope: SPEC-BE-010 US1

## Literal fixture

For `report-view-owner-a`, August 2026 SAR ledger truth contains income `100`,
expense `40`, refund `10` reversing that expense, and a transfer `500`.

| Measure | SQL view | API expectation |
|---|---:|---:|
| income | 100 | 100 |
| expense after refund | 30 | 30 |
| net cash flow | 70 | 70 |
| report transaction count | 3 | 3 |
| ledger version | 4 | 4 |

The transfer is excluded from cash flow. The refund remains attributed to the
original expense category. A second owner's SAR expense of `999` is absent.
The integration fixture separately proves SAR and USD groups and a valid empty
period response.

## Executed verification

- Targeted pgTAP after a clean database reset: PASS, 16 assertions.
- Summary integration: PASS, 3 tests.
- Report performance project: PASS, 2 tests; twenty uncached snapshot reads
  remained below the 800 ms p95 budget and the category plan stayed capped at
  100 rows.
- Summary HTTP contract: PASS, 4 tests, including runtime route/OpenAPI
  registration and conditional ETag behavior.
- Combined focused US1 run: PASS, 6 suites and 35 tests.

Dashboard summary, balances, planning aggregates, and recent activity are read
inside one repeatable-read transaction. Cache keys include owner, namespace,
type/period, currency, and current ledger version; cache values are detached
copies and never become financial truth.
