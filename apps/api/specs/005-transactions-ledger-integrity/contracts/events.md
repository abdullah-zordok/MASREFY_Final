# Audit, Outbox, Metrics, And Alert Contracts

## Atomic event rule

Every successful ledger command writes, in one database transaction:

1. transaction header and immutable posting/revision rows;
2. touched account-balance projections;
3. one immutable audit record;
4. one transactional lifecycle outbox record and one `balance.changed` record
   when a balance projection is touched;
5. the completed idempotency replay response.

Rollback of any item rolls back all items. Replays return the stored response and
must not duplicate audit or outbox records.

## Event types

| Event | Emitted when | Minimum payload |
|---|---|---|
| `transaction.created` | income, expense, or opening commits | transaction ID, kind, affected account IDs, version, ledger version, occurred time, request ID |
| `transfer.created` | same-currency transfer commits | transaction ID, transfer kind, affected account IDs, version, ledger version, occurred time, request ID |
| `transaction.refunded` | linked refund commits | transaction ID, refund kind, affected account IDs, version, ledger version, occurred time, request ID |
| `transaction.reversed` | full reversal commits | transaction ID, reversal kind, affected account IDs, version, ledger version, occurred time, request ID |
| `transaction.revised` | eligible transaction revision commits | transaction ID, old/new version, affected account IDs, ledger version, request ID |
| `transaction.deleted` | soft delete commits | transaction ID, version, undo expiry, ledger version, request ID |
| `transaction.restored` | valid undo commits | transaction ID, version, ledger version, request ID |
| `balance.changed` | a ledger command touches one or more projections | transaction ID, sorted affected account IDs, ledger version, request ID |
| `ledger.reconciliation_failed` | bounded worker finds projection drift | account ID, mismatch kind, ledger version, observed time, request/job ID |

Payloads use only user-safe resource IDs, fixed enum/state/version fields, and
timestamps. They exclude amounts, balances, projected/derived values, notes,
merchant/payment text, reasons, revision snapshots, idempotency keys/hashes,
tokens, provider payloads, and other secrets. Existing outbox retry/dead-letter
behavior from SPEC-BE-001 is reused unchanged.

## Audit details

Audit action names match the command. Audit details record identifiers, version
changes, fixed reason codes, before/after hashes, and request correlation. They
do not reproduce full DTOs, free-text reasons, revision snapshots, or financial
descriptions. Existing immutable append and redaction rules are reused.

## Metrics

- `ledger_command_total{operation,outcome}` counter.
- `ledger_command_duration_ms{operation}` histogram.
- `ledger_read_total{operation,outcome}` counter and
  `ledger_read_duration_ms{operation}` histogram.
- `ledger_read_result_count{operation}` and `ledger_payload_bytes{operation}` histograms.
- `ledger_idempotency_total{scope,outcome}` counter.
- `ledger_idempotency_replay_total{scope}` counter.
- `ledger_conflict_total{operation,reason}` counter.
- `ledger_error_total{reason}` and `ledger_rate_limit_denied_total{operation}` counters.
- `ledger_lock_wait_duration_ms{operation}`, `ledger_posting_count{operation}`, and
  `ledger_touched_account_count{operation}` histograms.
- `ledger_projection_update_total{operation}` and
  `ledger_append_failure_total{dependency}` counters.
- `ledger_reconciliation_checked_total` counter.
- `ledger_reconciliation_mismatch_total{mismatch_kind}` counter.
- `ledger_reconciliation_failure_total` counter.
- `ledger_reconciliation_retry_total{outcome}` counter plus batch-size and oldest
  projection-age histograms.
- `ledger_reconciliation_duration_ms` histogram.

Labels are fixed low-cardinality enums; user/account/transaction/request IDs are
never metric labels.

## Alerts

- Critical: any reconciliation mismatch after one immediate bounded recheck.
- Critical: ledger write rollback/invariant failure rate above 0 in the release
  smoke window.
- Warning: version or in-progress conflicts exceed the documented baseline by
  3x for 15 minutes.
- Warning: reconciliation job fails twice consecutively or cannot finish its
  configured batch within the worker budget.

Alert links point to the Phase 05 reconciliation and recovery runbook. The
worker reports mismatches and never auto-repairs balances.
