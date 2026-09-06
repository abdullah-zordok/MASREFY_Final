# Triage evidence

Date: 2026-09-06

Profile: local Windows 11 development environment; redacted fixtures only

## Drill

The deterministic asset contract test parsed the operations dashboard and alert rules, proved every alert uses a bounded-window `increase(...)` expression over an emitted counter, resolved every alert metric against `OPERATIONS_METRICS`, and resolved every `runbook_url` fragment against `ops/runbooks/operations-triage.md`.

Command:

```text
npm run test:contract -- --runInBand --testPathPatterns=operations
```

Result: PASS. The operations contract project includes the asset-link test and reported no missing metric, broken runbook anchor, or billing/Stripe term.

Operator path exercised:

1. Start from the single operations dashboard.
2. Select the affected fixed service/provider/queue/job/incident dimension.
3. Follow the alert's repository-relative runbook URL to its exact anchor.
4. Use only bounded views and safe error codes; never print raw payloads, provider responses, environment values, or connection strings.

The deterministic lookup is well below the two-minute SC-001 budget. Real incident acknowledgement and provider-console navigation remain operator actions; the repository proves that every local alert reaches an actionable procedure without disclosing sensitive data.

## Coverage

| Alert | Metric | Runbook anchor |
|---|---|---|
| `OperationsJobFailures` | `masarifi_operations_job_total` | `job-failures` |
| `OperationsProviderDown` | `masarifi_operations_provider_total` | `provider-down` |
| `OperationsRecoveryStale` | `masarifi_operations_recovery_total` | `recovery-stale` |
| `OperationsCriticalIncident` | `masarifi_operations_incident_total` | `critical-incident` |
| `OperationsConfigurationRejected` | `masarifi_operations_config_change_total` | `configuration-rejected` |

All labels are drawn from the fixed application allowlist. No user, session, request, event, run, attempt, or resource identifier is a metric label.
