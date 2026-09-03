# Events and Jobs

All outbox events use the existing envelope. Payloads contain IDs, versions,
bounded status/reason codes, counters, thresholds, and timestamps only. Forbidden
fields include audio/storage refs, transcript/message/prompt/completion content,
proposal/action payloads, evidence source data, provider bodies/headers/endpoints,
secrets, merchant/note text, amounts, account/category IDs, and user text.

## Outbox events

| Event                           | Trigger                             | Safe payload fields                                                                      |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `voice.proposal_ready.v1`       | validated proposal committed        | `sessionId`, `proposalId`, `schemaVersion`, `version`, `expiresAt`, `occurredAt`         |
| `voice.proposal_confirmed.v1`   | owner confirmation accepted         | `sessionId`, `proposalId`, `transactionId`, `version`, `occurredAt`                      |
| `voice.proposal_failed.v1`      | terminal processing failure         | `sessionId`, `reasonCode`, `attempt`, `occurredAt`                                       |
| `assistant.response_ready.v1`   | valid response persisted            | `conversationId`, `messageId`, `hasPreview`, `schemaVersion`, `occurredAt`               |
| `assistant.action_confirmed.v1` | command success                     | `previewId`, `actionType`, `resourceId`, `version`, `occurredAt`                         |
| `assistant.action_rejected.v1`  | owner rejects/expiry worker expires | `previewId`, `reasonCode`, `version`, `occurredAt`                                       |
| `ai.fallback_used.v1`           | approved fallback completes         | `workload`, `primaryModel`, `fallbackModel`, `reasonCode`, `occurredAt`                  |
| `ai.budget_threshold.v1`        | period first crosses 70/85/95/100   | `workload`, `period`, `threshold`, `spentBand`, `occurredAt`                             |
| `ai.provider_failed.v1`         | terminal/retryable provider attempt | `workload`, `model`, `provider`, `failureCode`, `schemaFailure`, `attempt`, `occurredAt` |

## Worker jobs

| Job                        | Claim order / batch         | Success                                              | Retry / terminal behavior                                                         |
| -------------------------- | --------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `voice.transcribe_extract` | received time/ID, <=25      | redacted transcript + validated proposal             | max 2 provider attempts; schema retry once; unavailable/unsafe terminal safe code |
| `assistant.respond`        | message time/ID, <=25       | response/snapshot/optional preview                   | cancel discards partial; max 2 attempts; consent revoked cancels before provider  |
| `ai.evaluate_route`        | request time/ID, <=10       | immutable case summary and pass/fail                 | never executes actions; failed corpus keeps prompt unpublished                    |
| `ai.usage_rollup`          | period/workload, <=100 rows | derived totals/threshold events reconciled           | retry transient DB; discrepancy alerts, never assumes zero                        |
| `ai.proposals.expire`      | expiry/ID, <=100            | proposal/preview terminal expiry                     | idempotent; never expires executed resource                                       |
| `voice-media.purge`        | expiry/ID, <=100            | object absent and storage ref cleared/trace retained | missing object success; transient Storage retry; orphan alert                     |

Claims use the established worker loop and lease contract: short transaction,
`FOR UPDATE SKIP LOCKED`, UUID fence, worker ID, expiry, bounded heartbeat, and
compare-and-set completion. Provider/Storage/domain calls occur outside row locks.
Expired claims are reclaimable. A wrong, expired, or superseded fence cannot
complete work. Shutdown stops claims and aborts provider HTTP before lease expiry.

## Attempt classification

- **retryable**: connect/overall timeout, 429, 5xx, incomplete transport, worker
  interruption, transient database/Storage, and first strict-schema failure;
- **fallback eligible**: retryable primary failure with remaining deadline/budget
  and an explicitly approved equivalent fallback;
- **terminal input/safety**: injection/control abuse, oversize/invalid content,
  unsupported schema/action/audio, invalid media metadata, or unauthorized scope;
- **terminal policy**: no compliant route/key, consent revoked, quota/budget stop,
  route disabled, or price/privacy/capability mismatch;
- **terminal invariant**: ownership/version/expiry/domain-command conflict;
  preserve review/audit evidence and never retry an ambiguous mutation.

## Metrics and alerts

Metric labels are limited to operation, workload, outcome, safe reason, model
slug, provider slug, fallback boolean, threshold, and circuit state. User/session/
conversation/message/proposal/preview/request IDs and any content are forbidden
labels.

Measures cover API/job/queue/provider first-byte/full latency, errors, tokens,
cost/reservations, quota rejections, budget percent, fallback, schema/evaluation/
safety failures, consent blocks, proposal/preview confirmation/expiry, circuit
state, media bytes/purge lag, cancellation, reconciliation drift, and connection/
heap bounds.

Alerts cover provider/route outage, circuit open duration, error/fallback/schema/
injection spikes, budget 70/85/95/100, quota anomalies, queue age/depth, prompt
corpus regression, confirmation failure, stale previews, media purge lag/orphans,
cost accounting discrepancy, and reconciliation drift. Runbooks name disable,
drain, retry, route/prompt rollback, purge, restore, reconcile, and evidence steps.
