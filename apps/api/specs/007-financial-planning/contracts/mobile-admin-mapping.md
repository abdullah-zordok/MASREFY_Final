# Phase 07 Mobile And Admin Contract Mapping

## Boundary

Phase 07 proves a complete mapping to the current executable Mobile
`FinancialPlanningService` and reporting snapshot. It does not select a live
provider, remove mocks, migrate production data, or change screens. Phase 14 owns
that cutover. Admin receives only a read-only planning summary with
`planning.read`; no planning mutation route or duplicate formula is added.

## Common Mapping

| Mobile field | API/database source |
|---|---|
| `id`, `version`, `createdAt`, `updatedAt` | planning root metadata |
| `syncStatus` | Phase 06 mutation/sync state, not a planning column |
| `operationId` | request operation ID plus Phase 06 receipt |
| `LocalDate` | UTC/database instant formatted in owner timezone at adapter boundary |
| safe integer minor units | API canonical decimal string parsed only after `Number.isSafeInteger` range validation |
| `Calculation.available` | derived view value plus estimated/as-of flags |
| `Calculation.unavailable` | explicit API unavailable reason |
| `PlanningConflict` | Phase 06 conflict contract; no Phase 07 keep-both/LWW |
| `PlanningDraft` | local client draft; not uploaded as financial truth |

## Salary Methods

| Mobile method | API mapping |
|---|---|
| `getSalaryOverview` | `GET /planning/summary?period=` salary section or profile detail cycle |
| `getSalaryReceiptReview` | receipt list filtered by transaction ID |
| `saveSalaryProfile` | POST/PATCH `/salary-profiles` with idempotency/version |
| `confirmSalaryReceipt` | POST `/salary-profiles/:id/receipts` |
| `undoSalaryReceipt` | DELETE `/salary-profiles/:id/receipts/:receiptId` |

`expectedAmountMinor -> amountMinor`, `salaryDay -> expectedDay`, `sourceName ->
name`, `receivingAccountId -> accountId`. `nextExpectedDate`, cycle income,
expenses, reserved obligations, remaining, daily suggestion, comparison, and
data/salary states are derived response fields.

## Budget Methods

| Mobile method | API mapping |
|---|---|
| `getBudget`, `listBudgets`, `getBudgetById` | budget list/detail/summary routes; overlapping results preserved |
| `createBudgetDraftFromPrevious` | client-local preview populated from prior detail; no server write until save |
| `saveBudget` | POST/PATCH budget then atomic PUT categories |
| `previewBudgetMove` | client-local non-authoritative preview of complete allocation set |
| `confirmBudgetMove` | PUT categories with expected version and idempotency |
| `setBudgetStatus`, `deleteBudget` | PATCH/DELETE budget |

`configuredExpenseLimitMinor -> totalMinor`; income/savings/rollover/copy fields
map directly. `CategoryBudget.alertThresholds/status` map to normalized category
rows. Spend, remaining, percentage, forecast, comparison, state, excluded
transactions, and ledger version come from the utilization contract.

## Obligation And Payment Methods

| Mobile method | API mapping |
|---|---|
| overview/list/detail/create/update/status | obligation collection/detail routes |
| `previewObligationPayment` | local preview over detail/schedule/transaction; server revalidates confirm |
| `confirmObligationPayment` | POST obligation payments with explicit allocations/intent |
| `reverseObligationPayment` | payment reversal child route |
| `previewEarlySettlement` | local/GET derived settlement preview; never authoritative |
| `confirmEarlySettlement` | payment endpoint with settlement intent |
| match list/get/resolve | payment-match list/detail/decision routes |

Direction, Mobile type, schedule kind, provider, principal/opening paid,
installment amount/count, due day, dates, account, matching preference, keywords,
reminder, notes, and lifecycle map to the normalized obligation model. Payment
case/intent/source/transaction ownership/replacement and allocation fields map
to payment/allocation rows. Provider/account/transaction display hints are read
from authorized Phase 04/05 resources and are not copied into match rows.

## Savings Methods

| Mobile method | API mapping |
|---|---|
| list/get/create/update/status | savings-goal routes |
| `previewGoalMovement` | client-local preview over current goal/eligible transaction |
| `confirmGoalMovement` | POST goal movements |
| `reverseGoalMovement` | movement reversal child route |

Title, target/opening/current migration value, currency, date, linked account,
icon, emergency flag, and lifecycle map directly. Current, remaining,
percentage, required monthly, and state are derived. New server movements require
an explicit eligible transaction; no account balance changes occur implicitly.

## Overview And Reporting

`getPlanningOverview` maps to `GET /planning/summary?period=YYYY-MM` and returns
salary cycle, an array of independent budget details/progress (the current
single-budget presentation selects by ID without merging), obligations due, and
savings progress with data state/ledger version.

`getReportingSnapshot` consumes the same owned view/repository result for Phase
10 compatibility; Phase 07 does not generate/export/send reports.

Admin's overview/analytics adapter reads
`GET /api/v1/admin/planning/summary?userId=&period=` after the exact
`planning.read` permission check. It may receive aggregate counts/status/period
and safe exact-money values only. It must not query tables directly, infer
another user's details without that permission, or reimplement formulas.

## Offline And Conflict Mapping

Phase 07 roots/dependents register with Phase 06 resource handlers. Offline
mutations carry stable operation ID, resource ID, base version, schema version,
and dependency IDs. Stale financial/planning updates reject or create explicit
review; `keep_local`, `keep_later`, Last Write Wins, and keep-both are never
silently applied to ledger-linked state. Tombstones preserve deletes after
acknowledgement/retention.

## Parity Acceptance

- Every public service method above has one server route or explicit local-only
  preview/draft behavior.
- Every persisted Mobile field maps to a normalized column, Phase 06 metadata,
  or named derived response.
- Representative SQLite rows round-trip stable IDs, versions, lifecycle, links,
  exact safe money, and timezone dates without silent coercion.
- Values outside the current Mobile safe-integer range are rejected by the
  dormant adapter with an explicit compatibility error.
- Active Mobile provider selection and Admin mutation surface remain unchanged.
