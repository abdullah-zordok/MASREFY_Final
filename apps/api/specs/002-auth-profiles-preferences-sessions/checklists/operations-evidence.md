# Operations Evidence — SPEC-BE-002

## Bounded metrics

| Metric | Labels | Alert |
|---|---|---|
| `masarifi_identity_auth_total` | `outcome` | provider failure >5% for 10m: High |
| `masarifi_clerk_webhook_receipt_total` | `outcome` | conflict/invalid spike: High; accepted invalid: Critical |
| `masarifi_clerk_webhook_process_total` | `outcome` | failed >5% for 10m: High |
| `masarifi_clerk_reconciliation_count` | `operation,outcome` | drift remains after two pages: High |
| `masarifi_clerk_webhook_redaction_count` | `outcome` | unredacted terminal payload >8d: High |
| `masarifi_device_session_retry_total` | `outcome` | retained link >15m: High |

Allowed identity label values are fixed safe outcomes/operations. User, subject, session, event, device, contact, token, hash, payload, route input, and exception text are forbidden labels and are covered by `platform-events.spec.ts`.

Runbooks: [authentication provider recovery](../../../docs/runbooks/clerk-auth-provider-recovery.md) and [webhook/device recovery](../../../docs/runbooks/clerk-webhook-device-recovery.md).

Dashboard screenshots/links and tabletop execution remain release-gated external evidence.

## Local tabletop — 2026-08-28

Both identity runbooks were reviewed against the implemented metric names, fixed
labels, thresholds, and recovery paths. The local tabletop executed these cases:

- clean database recreation, ordered migrations 001-013, schema lint, and 308 pgTAP assertions;
- migration checksum rejection, concurrent migration lock, backup/restore, and forward migration compatibility;
- Clerk/JWKS invalid-token and provider-outage fail-closed paths;
- webhook duplicate/conflict, provider slowdown, worker crash rollback, reconciliation, and retention recovery;
- local-first device revoke, provider outage, retry, push encryption-key rotation, and exposure checks;
- outbox slowdown, outage, restart replay, lease churn, and backlog recovery under load.

The full integration suite passed 48/48. The completed load run passed 4,791
iterations with zero claim failures (claim P95 18 ms/P99 53 ms). The webhook ingress
run handled 600 signed duplicates with 119 durable accepts and 481 expected rate-limit
responses, zero unexpected statuses, and P95 7.045 ms/P99 15.063 ms. A later stress
rerun was stopped and all remaining k6 gates were explicitly skipped by the user;
they are not represented as passing release evidence.

No production dashboard exists in this repository, so dashboard link/screenshot and
live alert-firing evidence remain external. The bounded-label unit suite is the local
proof that user, subject, session, event, device, contact, token, hash, and payload
values cannot become metric labels.
