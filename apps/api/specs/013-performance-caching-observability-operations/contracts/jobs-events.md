# Jobs and Events Contract: SPEC-BE-013

## Scheduling Model

One database-backed scheduler claims due interval jobs. Domain handlers remain code-owned by their original Specs. Null schedules identify event/manual/inbox-driven work that is inventoried and recorded when invoked but is not polled by the central due-job claim.

The initial registry is deterministic, idempotent, and contains no SPEC-BE-012 entry.

## Consumed Job Inventory

| Owner | Job key | Initial schedule | Retry | Cancel | Existing behavior invoked |
|---|---|---:|---|---|---|
| 001 | `platform.outbox.dispatch` | 10s | yes | no | bounded outbox dispatch cycle |
| 002 | `clerk.webhook.process` | 10s | yes | no | inbox processing cycle |
| 002 | `clerk.identity.reconcile` | 24h | yes | no | bounded provider/profile reconciliation |
| 002 | `clerk.session-revoke.retry` | 60s | yes | no | one revoked-session retry cycle |
| 003 | `security.support-expire` | 60s | yes | no | expire support grants |
| 003 | `security.alert-dispatch` | 60s | yes | no | dispatch pending security alerts |
| 003 | `privacy.export-generate` | 60s | yes | yes | claim one export and write safe package |
| 003 | `privacy.export-expire` | 1h | yes | no | expire export objects/metadata |
| 003 | `privacy.account-delete` | 60s | yes | yes | execute one authorized deletion |
| 003 | `retention.apply` | 24h | yes | no | bounded retention cycle |
| 005 | `ledger.reconcile` | 60s | yes | no | bounded account-balance reconciliation |
| 006 | `sync-mutations.retry` | 10s | yes | no | retry due mutation claims |
| 006 | `idempotency.cleanup` | 1h | yes | no | bounded expired-key cleanup |
| 006 | `sync-state.cleanup` | 1h | yes | no | bounded sync-state cleanup |
| 006 | `conflicts.expire` | 1h | yes | no | expire conflict records |
| 007 | `planning.salary-cycle.generate` | 60s | yes | no | existing planning handler |
| 007 | `planning.obligation-schedule.generate` | 60s | yes | no | existing planning handler |
| 007 | `planning.payment-match.propose` | 60s | yes | no | existing planning handler |
| 007 | `planning.overdue.mark` | 60s | yes | no | existing planning handler |
| 007 | `planning.reminders.emit` | 60s | yes | no | existing planning handler |
| 007 | `planning.reconcile` | 1h | yes | no | existing planning reconciliation |
| 008 | `import.parse` | 30s | yes | yes | bounded import claims |
| 008 | `parser.corpus` | null | yes | yes | explicitly queued corpus test |
| 008 | `raw.purge` | 1h | yes | no | raw-evidence retention |
| 008 | `tracking.reconcile` | 1h | yes | no | tracking reconciliation |
| 009 | `ai.evaluate_route` | 10s | yes | yes | queued route evaluation |
| 009 | `voice.transcribe_extract` | 10s | yes | yes | queued voice work |
| 009 | `assistant.respond` | 10s | yes | yes | queued assistant work |
| 009 | `ai.usage_rollup` | 1h | yes | no | usage rollup |
| 009 | `voice-media.purge` | 1h | yes | no | temporary media purge |
| 009 | `ai.reconcile` | 1h | yes | no | AI reconciliation |
| 010 | `report.generate` | 10s | yes | yes | report generation claims |
| 010 | `report.email.deliver` | 10s | yes | yes | delivery claims |
| 010 | `report.output.expire` | 1h | yes | no | report output expiry |
| 010 | `report.schedule.enqueue` | 60s | yes | no | enqueue due reports |
| 011 | `source.consume` | 10s | yes | no | consume allowlisted domain events |
| 011 | `notification.dispatch` | 10s | yes | yes | notification delivery claims |
| 011 | `notification.expire` | 1h | yes | no | notification expiry |
| 011 | `notification.campaign.expand` | 60s | yes | yes | bounded campaign expansion |
| 011 | `support-attachment.scan` | 10s | yes | yes | attachment scan claims |
| 011 | `support-attachment.cleanup` | 1h | yes | no | attachment retention cleanup |

SPEC-BE-004 owns reference data but no recurring worker in the current implementation; its cache and FX freshness are observed, not given a fabricated job.

## Phase 13-owned Jobs

| Job key | Default schedule | Purpose | Result summary keys |
|---|---:|---|---|
| `operations.provider-health` | 60s | run fixed configured provider probes | checked, up, degraded, down, unknown |
| `operations.capacity-evaluate` | 5m | evaluate bounded queue/run/storage/connection budgets | budgetsChecked, breached |
| `operations.cache-invalidate` | null | consume internal invalidation requests | cacheKind, invalidated |
| `operations.backup-verify` | 24h | record safe hosted/local backup verification metadata | scope, status, observedAt, evidenceRef |
| `operations.restore-drill` | null | record an explicitly initiated isolated restore drill | scope, status, rpoSeconds, rtoSeconds, evidenceRef |
| `operations.dr-rehearse` | null | record full documented DR rehearsal metadata | status, rpoSeconds, rtoSeconds, evidenceRef |
| `operations.maintenance-activate` | 10s | activate due windows idempotently | activated |
| `operations.maintenance-complete` | 10s | complete elapsed active windows idempotently | completed |
| `operations.job-history-retain` | 24h | delete expired run/attempt/check history in batches | runsDeleted, attemptsDeleted, checksDeleted |

Backup, restore, and DR jobs do not accept or execute backup commands from Admin. A trusted deployment/operator process performs external work and supplies only a prevalidated redacted evidence record through an internal interface. Local automated tests invoke deterministic isolated drill adapters.

## Retry Contract

- Automatic retries use bounded exponential delays: `min(300 seconds, 2^(attempt-1) * 5 seconds)`.
- A retry is created only when the handler returns a safe retryable failure and attempts remain.
- Admin retry creates a new run linked to the terminal source run, only for `retry_safe=true`.
- Dead-lettered work stays visible; replay requires an explicit safe retry, never an arbitrary payload.
- Cancellation is accepted only before dispatch (`queued` or `retrying`) for `cancel_safe=true`; running handlers are never marked canceled without a cooperative abort protocol.

## Event Envelope

Operational events reuse the platform outbox envelope and contain:

```json
{
  "type": "operations.job-dead-lettered",
  "aggregateType": "job_run",
  "aggregateId": "uuid",
  "occurredAt": "RFC3339 UTC",
  "data": {
    "jobKey": "operations.provider-health",
    "ownerSpec": 13,
    "status": "dead_lettered",
    "safeCode": "PROVIDER_CHECK_FAILED",
    "version": 3
  }
}
```

No event contains configuration, result payload, provider output, setting value, rule audience, incident note, backup content, personal data, financial data, token, URL, SQL, or stack trace.

## Event Types

| Type | Required safe data |
|---|---|
| `operations.job-succeeded` | jobKey, ownerSpec, version, durationBucket |
| `operations.job-failed` | jobKey, ownerSpec, version, safeCode |
| `operations.job-dead-lettered` | jobKey, ownerSpec, version, safeCode |
| `operations.job-canceled` | jobKey, ownerSpec, version, actorType |
| `operations.provider-state-changed` | provider, previousStatus, status |
| `operations.incident-changed` | incidentId, status, severity, version |
| `operations.setting-changed` | settingKey, sensitivity, version |
| `operations.feature-flag-changed` | flagKey, status, version |
| `operations.maintenance-changed` | maintenanceId, status, version |
| `operations.backup-verified` | scope, status, observedAt, evidenceRef |
| `operations.restore-drill-recorded` | scope, status, rpoBucket, rtoBucket, evidenceRef |

`durationBucket`, `rpoBucket`, and `rtoBucket` are fixed categorical ranges in events/metrics; exact measurements remain in authorized recovery metadata.

## Metrics

| Metric | Type | Allowed labels |
|---|---|---|
| `masarifi_operations_job_total` | counter | job, owner_spec, outcome |
| `masarifi_operations_job_duration_ms` | histogram | job, owner_spec, outcome |
| `masarifi_operations_job_backlog` | histogram | job, owner_spec, status |
| `masarifi_operations_provider_total` | counter | provider, status |
| `masarifi_operations_provider_latency_ms` | histogram | provider, status |
| `masarifi_operations_cache_total` | counter | cache, outcome |
| `masarifi_operations_recovery_total` | counter | operation, scope, outcome |
| `masarifi_operations_recovery_duration_ms` | histogram | operation, scope, outcome |
| `masarifi_operations_incident_total` | counter | severity, status |
| `masarifi_operations_config_change_total` | counter | operation, scope, outcome |
| `masarifi_operations_maintenance_total` | counter | status, outcome |

All label values come from code-owned finite sets. IDs and free text are forbidden.

## Free-only Negative Inventory

Registration, dispatch, provider probes, events, metrics, alerts, dashboards, and seed tests must prove absence of every key containing: Stripe, billing, payment, subscription, paid, entitlement, checkout, upgrade, downgrade, promotion, invoice, or billing reconciliation.
