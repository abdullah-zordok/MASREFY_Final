# Sync Events, Jobs, Metrics & Alerts

## Sync-visible Events

The existing Phase 04/05 outbox event names stay authoritative. Phase 06 adds
reserved `payload.sync` metadata at insertion time for allowlisted account,
category, and transaction owner events. There is no second sync event bus.

Required metadata fields are `userId`, `domain`, `cursor`, `resourceId`,
`resourceType`, `operation`, and `version`; `snapshot` is required for upserts and
`deletedAt` for tombstones. The stored cursor is the server position used to
derive a signed-v2 client cursor; signed client cursor values are never placed in
events or logs. The payload is immutable after insert.

## Scheduled Jobs

| Job                      | Purpose                                                                                | Safe execution rule                          |
| ------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| `sync-mutation-worker`   | claim and apply pending client mutations                                               | SKIP LOCKED + fenced leases + bounded retry  |
| `sync-lease-recovery`    | release/reclaim expired processing leases                                              | bounded batch; never overwrites a live fence |
| `sync-retention-cleanup` | purge expired terminal idempotency/mutation/conflict rows and safe old sync history    | bounded batches; preserve active checkpoints |
| `sync-reconciliation`    | detect stuck mutations, cursor gaps, broken conflict links, and orphaned sync metadata | read-first; repair only deterministic state  |

The repository's existing worker bootstrap, scheduler, and health patterns are
reused. No queue dependency or generic workflow engine is added.

## Metrics

| Metric                            | Type      | Labels                     |
| --------------------------------- | --------- | -------------------------- |
| `sync_http_duration_ms`           | histogram | route, outcome             |
| `sync_delta_items_total`          | counter   | domain                     |
| `sync_delta_payload_bytes`        | histogram | domain                     |
| `sync_mutations_total`            | counter   | domain, operation, outcome |
| `sync_mutation_lag_seconds`       | histogram | domain                     |
| `sync_conflicts_total`            | counter   | domain, outcome            |
| `sync_idempotency_total`          | counter   | scope, outcome             |
| `sync_worker_claimed_total`       | counter   | worker                     |
| `sync_worker_failures_total`      | counter   | worker, code               |
| `sync_reconciliation_drift_total` | counter   | drift_type                 |

Labels must remain bounded; never label with user, device, operation, mutation,
resource, request, or conflict identifiers.

## Structured Logs

Allowed fields: request ID, hashed actor/device identifiers, domain, operation,
receipt/conflict UUID, state, attempt, cursor distance, item count, payload byte
count, duration, and stable error code. Do not log JWTs, idempotency keys, request
payloads, snapshots, notes, merchant text, amounts, or full cursor values.

## Alerts

- mutation oldest-ready age above the operating threshold;
- expired processing leases persist across two worker cycles;
- `SYNC_RETRY_EXHAUSTED` rate above threshold;
- reconciliation observes a cursor gap or an owner/outbox atomicity mismatch;
- delta or mutation-batch P95 exceeds the Phase 06 SLO;
- cleanup cannot keep retention backlog bounded.

Every alert runbook links to the query/evidence command and rollback or recovery
procedure. Logs and metrics are sufficient to identify a receipt by UUID without
disclosing its financial content.
