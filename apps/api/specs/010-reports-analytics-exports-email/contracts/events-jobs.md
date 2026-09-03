# Event and Job Contracts: SPEC-BE-010

## Common event envelope

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "report.requested",
  "aggregateType": "report_attempt",
  "aggregateId": "uuid",
  "occurredAt": "ISO-8601 UTC",
  "correlationId": "bounded opaque request id",
  "data": {}
}
```

Every event is inserted through the existing outbox in the same transaction as
its state change. Consumers are idempotent. Forbidden event fields: snapshot,
financial amounts/content, user email, recipient, subject/body, signed URL,
Storage key, SMTP response, provider payload/reference, credential, token, SQL,
or unrestricted metadata.

## Events

| Event | Safe `data` | Producer | Consumer/effect |
|---|---|---|---|
| `report.requested` | `attemptId`, `reportType`, `format`, `delivery`, `ledgerVersion` | snapshot transaction | report generation claim |
| `report.ready` | `attemptId`, `format`, `bytes`, `expiresAt` | generation completion | status; email claim when requested |
| `report.delivery_succeeded` | `attemptId`, `acceptedByServerAt` | SMTP fenced completion | status/metrics only; not inbox proof |
| `report.delivery_failed` | `attemptId`, `errorCode`, `retryable`, `attemptCount` | SMTP failure completion | retry/dead-letter/alert |
| `report.expired` | `attemptId`, `expiredAt` | confirmed object deletion/absence | cache/status invalidation |
| `export.ready` | `attemptId`, `format`, `bytes`, `expiresAt`, `adminAggregate` | output completion | authorized status availability |

All identifiers are UUIDs except bounded enum/time/count fields. Event schema
validation rejects additional properties.

## Job: `report.generate`

Trigger: `report.requested` or recovery scan of queued/expired generation lease.

Input identity: `attemptId` only. The worker reloads the immutable snapshot from
the private table after a fenced claim; event payload is not trusted as content.

Algorithm:

1. claim up to configured batch size with `SKIP LOCKED`, lease and claim token;
2. parse snapshot V1 and recheck row/byte/period/format limits;
3. render a stream and upload once to the private bucket with no upsert;
4. verify object bytes/hash and atomically transition to ready;
5. emit `report.ready` or `export.ready`; enqueue email state only when requested;
6. on retryable failure, remove partial object and release with bounded delay;
7. on terminal/max-attempt failure, record safe code, emit failure metric/alert.

No report query or snapshot regeneration occurs in this job.

## Job: `report.email.deliver`

Trigger: ready email output or explicit safe retry.

Preconditions: ready immutable snapshot/output, verified normalized recipient,
unexpired object, recent-auth/verification evidence, configured SMTP, no accepted
terminal state, and a successful fenced claim.

Algorithm:

1. create a fresh short-lived signed URL after authorization checks;
2. derive stable Message-ID from attempt and configured sender domain;
3. call the only TLS SMTP transport with generic subject/minimal body;
4. require exact recipient acceptance and zero rejection;
5. atomically record delivered and emit `report.delivery_succeeded`;
6. map pre-DATA retryable transport failures to bounded retry;
7. mark permanent reject/auth/config/max attempts failed;
8. mark post-DATA/ambiguous timeout `DELIVERY_ACCEPTANCE_UNKNOWN`, alert, and do
   not automatically resend.

The job never changes snapshots, regenerates output, or tries another transport.

## Job: `report.schedule.enqueue`

Trigger: worker poll/recovery; no separate schedule table/job registry.

Algorithm:

1. atomically claim a bounded ordered set of enabled due schedules using the due
   index and `SKIP LOCKED`;
2. calculate due local period and next run from the persisted IANA timezone;
3. insert one snapshot attempt under schedule-period unique fence and append
   audit/outbox; duplicate conflict is a no-op success;
4. advance `last_run_at`, `next_run_at`, and version in the same transaction;
5. process at most the configured catch-up count, oldest first; excess lag alerts
   and continues next poll rather than creating a storm;
6. paused/deleted/version-changed schedules fail the claim fence.

## Job: `report.output.expire`

Trigger: worker poll/recovery of `expires_at <= now()` rows not terminal expired.

Algorithm:

1. claim a bounded ordered batch with lease/fence;
2. delete the validated private object; 404 is idempotent success;
3. only after confirmed deletion/absence, atomically mark expired and emit event;
4. retry transient Storage failure; alert/dead-letter after maximum attempts;
5. reconciliation detects missing ready objects, orphan report objects, expired
   rows not deleted, and object metadata mismatch without exposing keys.

## `analytics.refresh`

Not registered or implemented. It may be added only after retained ordinary-view
measurements fail a required budget and an approved plan revision defines the
materialized view, staleness, ledger version, refresh, failure, security,
reconciliation and rollback behavior.

## Retry, lease and shutdown

- Batch, lease, poll, maximum attempts, base/max backoff, jitter, catch-up,
  concurrency, row and byte limits are validated environment values.
- Lease claim tokens/fences reject stale completion after takeover.
- Retryable errors are a closed allowlist; unknown errors are terminal-safe.
- API shutdown stops new requests. Worker shutdown stops claims, aborts external
  work, and waits up to the existing 30-second ceiling before leaving leases to
  expire. No completion writes after abort without a valid fence.
- Every state transition has fixed-cardinality metrics and safe structured logs.

## Recovery invariants

- replayed event/request/schedule claim does not duplicate attempt/output/email;
- process crash before Storage upload leaves a reclaimable queued/generating row;
- crash after upload before completion detects the same object/hash and completes
  idempotently rather than overwriting;
- crash around SMTP cannot turn ambiguous acceptance into automatic resend;
- expired lease completion cannot overwrite a newer worker result;
- migration/application rollback leaves snapshots readable/expirable and workers
  disabled until compatible code resumes.
