# Phase 07 Events And Jobs

## Event Envelope

All events reuse the existing versioned outbox envelope. Required safe fields:

```json
{
  "eventId": "uuid",
  "eventType": "planning.budget_updated",
  "aggregateType": "budget",
  "aggregateId": "uuid",
  "aggregateVersion": 2,
  "userId": "opaque-owner-id",
  "occurredAt": "2026-08-31T12:00:00.000Z",
  "requestId": "opaque-request-id",
  "schemaVersion": 1,
  "payload": {
    "status": "active",
    "currencyCode": "SAR",
    "ledgerVersion": 42
  }
}
```

Allowed payloads contain IDs, versions, lifecycle/status, currency, ledger
version, safe counts, and due/period dates only. Forbidden payloads include
salary/debt/savings amounts, names, notes, providers, keywords, transaction
descriptions, account labels/last-four, match evidence, request bodies, and
database/worker errors.

## Event Types

| Event | Producer | Minimum payload | Consumers |
|---|---|---|---|
| `planning.salary_profile_created` / `_updated` / `_archived` | profile command | profile ID/version/status/currency | sync, summary invalidation |
| `planning.salary_receipt_expected` / `_received` / `_corrected` / `_undone` | generator/link command | profile/receipt IDs, status, cycle date, ledger version | sync, summary, later reminders |
| `planning.budget_created` / `_updated` / `_allocations_replaced` / `_closed` / `_deleted` | budget command | budget ID/version/status/period/currency | sync, summary, later reports |
| `planning.obligation_created` / `_updated` / `_schedule_generated` / `_overdue` / `_completed` / `_archived` | obligation command/job | obligation ID/version/status, generated count/due date | sync, summary, later reminders |
| `planning.obligation_payment_recorded` / `_reversed` | allocation/reconciliation | obligation/payment IDs, status, ledger version | sync, summary, later reports |
| `planning.payment_match_proposed` / `_accepted` / `_rejected` | matcher/decision | match/transaction/obligation IDs, status | sync, review UI |
| `planning.savings_goal_created` / `_updated` / `_completed` / `_deleted` | goal command | goal ID/version/status/currency | sync, summary, later reports |
| `planning.savings_movement_recorded` / `_reversed` | movement/reconciliation | goal/movement IDs, kind/status, ledger version | sync, summary |
| `planning.reminder_intent` | reminder job | resource type/ID, due date, reason code | Phase 11 only |
| `planning.reconciliation_difference` / `_repaired` | reconciler | resource type/ID, safe difference code | operations/security |

No consumer may treat an event as authority to bypass the owning command.

## Shared Worker Contract

Each job uses the existing worker runtime and repository claim/lease/fence
pattern:

- batch size 1..500, configured default 100;
- stable natural key and unique domain constraint;
- `FOR UPDATE SKIP LOCKED` bounded claim;
- lease/fence required to complete;
- deterministic capped exponential backoff with jitter from existing helper;
- maximum attempts from existing worker policy, then visible terminal failure;
- abort signal and graceful shutdown return uncompleted leases for expiry/reclaim;
- safe metrics/logs only; no user-selected or financial payload labels.

## `planning.salary-cycle.generate`

**Selection**: active profiles whose expected horizon is missing or due.
**Natural key**: `(salary_profile_id, expected_at)`.
**Action**: call deterministic receipt generation through a bounded 90-day
horizon.
**Retry result**: existing row counted, no duplicate event.
**Metrics**: claimed, generated, existing, failed, duration, oldest due age.

## `planning.obligation-schedule.generate`

**Selection**: active scheduled obligations whose generated horizon is below
the configured bounded target.
**Natural key**: `(obligation_id, sequence_no)`.
**Action**: generate through at most 18 months.
**Retry result**: missing-only insert.
**Metrics**: obligations, items generated/existing, horizon lag, failures.

## `planning.payment-match.propose`

**Selection**: new/revised confirmed expense transactions with no terminal
planning match/payment handling.
**Natural key**: `(transaction_id, obligation_id)`.
**Action**: score bounded eligible obligations and insert proposals only.
**Authority**: none; never posts/allocates/accepts automatically.
**Metrics**: transactions considered, proposals, zero/one/multiple candidate
counts, terminal errors, duration; no confidence value as a label.

## `planning.overdue.mark`

**Selection**: due/partial schedule items before controlled `as_of`, maximum
500 per claim.
**Natural key**: item ID and transition version.
**Action**: mark remaining eligible items overdue and emit one event per changed
root batch.
**Retry result**: already-overdue items unchanged.
**Metrics**: marked count, remaining backlog, oldest overdue age, failures.

## `planning.reminders.emit`

**Selection**: upcoming obligation schedule dates covered by the obligation's
explicit `reminderTiming`, excluding terminal/hidden/invalid records.
**Natural key**: `(resource_type,resource_id,due_at,reason_code)`.
**Action**: emit `planning.reminder_intent`; do not deliver a notification.
**Retry result**: one intent only.
**Metrics**: intents, duplicates, skipped lifecycle, backlog age.

## Reconciliation And Cleanup

Planning reconciliation runs through the existing operations worker surface or
explicit runbook, not an unowned sixth periodic job. It is bounded to 500 roots
per invocation and has dry-run/repair modes. Existing platform/outbox retention
owns event cleanup; Phase 07 adds no deletion job for financial history.

## Health And Alerts

Readiness remains independent of a transient planning backlog. Health exposes
safe per-job queue/lease/error counts. Alerts fire for:

- oldest due/lease age above twice the schedule interval;
- repeated terminal allocation/movement failures;
- overdue/reminder backlog above documented thresholds;
- nonzero reconciliation differences after a repair pass;
- summary P95/P99 or cache-staleness thresholds;
- migration/checksum/worker registration mismatch.

Runbook ownership: `docs/runbooks/financial-planning-operations.md`.
