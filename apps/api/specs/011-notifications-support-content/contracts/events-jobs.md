# Phase 11 Events and Jobs

## Event Envelope

Every owned event uses:

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "notification.read",
  "aggregateType": "notification",
  "aggregateId": "uuid",
  "occurredAt": "RFC3339 UTC",
  "correlationId": "bounded opaque id",
  "data": {}
}
```

`data` is an allowlisted object <=2 KiB. It contains only IDs, lifecycle states,
safe reason codes, locale/channel enums, and versions required by a consumer.
It never contains rendered bodies, template text/variables, amounts, accounts,
messages, notes, filenames, object keys, tokens, provider payloads/references,
audience definitions/user IDs, reporter identity, or draft content.

## Owned Events

| Event | Aggregate | Safe data |
|---|---|---|
| `notification.delivered` | notification delivery | delivery/event ID, channel, version |
| `notification.failed` | notification delivery | delivery/event ID, channel, safe failure class |
| `notification.read` | notification | notification ID, read boolean, version |
| `notification.acted` | notification | notification ID, action key, version |
| `support.ticket_opened` | support ticket | ticket/category ID, status, version |
| `support.message_added` | support ticket | ticket/message ID, sender class, version |
| `support.status_changed` | support ticket | ticket ID, from/to status, version |
| `content.published` | content | content ID/key, type, locales, version |
| `content.retired` | content | content ID/key, type, version |
| `feedback.received` | feedback | feedback ID, type, version |

Delivery is at least once; consumers dedupe by `eventId`. Event insertion is in
the same transaction as the owned state/audit change.

## `notification.dispatch`

- Input: queue/outbox reference or scheduled claim tick; no raw token/payload.
- Claim: due `queued` delivery batch <=100 via `FOR UPDATE SKIP LOCKED`, lease and
  fence token; re-check event expiry, preferences, quiet hours, and token state.
- Work: render already selected safe channel version, decrypt one token only in
  adapter scope, call provider outside database/domain transactions.
- Completion: conditional fence update to delivered/failed/suppressed, bounded
  provider reference, safe error code, audit/metric/event.
- Retry: only explicit retryable class; capped exponential backoff with jitter;
  provider `Retry-After` is clamped. Ambiguous acceptance is not blindly retried.

## `notification.delivery.retry`

- Claims expired leases and due retryable failures in batches <=100.
- Rejects terminal, expired, disabled, revoked-token, and exhausted rows.
- Preserves logical unique source/user/channel and attempt history fields.
- Raises backlog/dead-letter alerts without dropping or exposing the row.

## `notification.campaign.expand`

- Claims one approved/scheduled/running campaign and a keyset audience batch <=500.
- Verifies current preview/audience/template versions and schedule; checks
  pause/cancel before and after selection.
- Inserts unique deliveries with `ON CONFLICT DO NOTHING`; never loads all users.
- Applies configured per-campaign/provider rates and bounded concurrent claims.
- Resumes after crash by last keyset boundary derived from existing deliveries;
  no separate audience/progress table is introduced.
- Marks completed only after a reconciliation query finds no eligible missing row.

## `notification.expire`

- Processes <=500 due events/deliveries per claim.
- Makes expired events non-actionable, suppresses pending delivery, and minimizes/
  removes data by retention policy without deleting required audit evidence.
- Replays idempotently and alerts on backlog.

## `support-attachment.scan`

- Claims pending/eligible failed attachments in batches <=25.
- Reauthorizes metadata/key shape, streams with byte/time/decompression limits to
  the injected scanner, verifies actual size/hash/magic/type, and never logs bytes.
- Clean: set clean/scanned time. Malware/mismatch: set rejected and delete object
  idempotently. Unavailable: failed with bounded retry; file remains inaccessible.
- Reconcile orphan quarantine objects separately in bounded age batches; never
  release an object because metadata is missing.

## Scheduling Exclusion

`content.publish.schedule` is not registered. The executable Admin content
contract supports immediate approved publish only. Campaign one-time scheduling
is handled by `notification.campaign.expand`.

## Provider Failure Matrix

| Condition | State | Retry | Side effect |
|---|---|---|---|
| accepted | delivered | no | safe delivered event |
| 429/temporary 5xx/network before send | failed/due | bounded | retry event/metric only |
| invalid/revoked token or recipient | suppressed/failed | no | revoke token when proven |
| malformed provider response | failed | bounded once by class | alert on repetition |
| timeout after body/data acceptance may have occurred | failed ambiguous | no blind retry | manual/status lookup if supported |
| missing enabled-provider config | failed closed | no until config change | readiness/alert; source domain unaffected |

## Metrics and Alerts

Metrics use fixed channel/provider/status/error-class/template-version labels only.
Queue age, claim duration, provider latency, attempts, success/failure/suppression,
campaign expanded/remaining, expired count, scan duration/result/delete failure,
and reconciliation differences are recorded. No IDs or content are metric labels.

Alert on provider circuit open, delivery/campaign/scan backlog age, retry exhaustion,
ambiguous acceptance, invalid-token spike, campaign stall, scan/delete failure,
or reconciliation difference. Every alert links to a Phase 11 runbook.
