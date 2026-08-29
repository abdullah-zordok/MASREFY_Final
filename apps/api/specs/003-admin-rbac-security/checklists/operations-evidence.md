# Operations evidence

All labels are from the fixed low-cardinality set in `platform-metrics.ts`; user IDs, request IDs, IPs, emails, tokens, URLs, object keys, and free text are forbidden as labels.

| Signal | Owner | Threshold | Runbook / closure |
| --- | --- | --- | --- |
| Permission denial/error and evaluation duration | Security on-call | error outcome or P95 >25 ms for 10 min | Audit/security incident runbook; close after permission/RLS recovery and denial-evidence reconciliation |
| Audit append failure | Security on-call | any failure | Audit/security incident runbook; close only after mutation rollback and evidence continuity are proved |
| Support grant request/use/revoke/expiry | Support security owner | failed expiry run or denied-use spike | Support emergency-revoke runbook; close after grants are revoked/reconciled |
| Security incident/alert dispatch | Security on-call | high/critical input or failed dispatch run | Audit/security incident runbook; close after durable evidence and notification retry |
| Privacy export generation/expiry | Privacy operations | failed run, stale processing >15 min, or ready object past expiry | Privacy/retention runbook; close after state/object reconciliation |
| Account deletion | Privacy operations | failed run or stale processing >15 min | Privacy/retention runbook; close after every registered owner reconciles |
| Retention apply | Data governance owner | failed run, unknown handler, or backlog over one policy batch | Privacy/retention runbook; close after hold/policy/candidate reconciliation |

The five jobs emit `jobRun` and `jobDuration` with fixed `job`/`outcome`; permission, audit, support, incident, privacy, and retention metrics have explicit names. Security outbox payloads are built by `security.events.ts`; platform lifecycle events remain owned by `platform-events.ts` and were not broadened.
