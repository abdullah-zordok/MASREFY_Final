# Event Contracts: SPEC-BE-003

All payloads use the existing SPEC-BE-001 outbox envelope. They are inserted in
the same transaction as the state change, contain no reason/free text/email/token/
URL/Storage key, and have `schemaVersion: 1`.

| Event                        | Payload                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `admin.role_assigned`        | `{schemaVersion,adminId,roleId,assignmentId,occurredAt,requestId}`      |
| `admin.role_revoked`         | `{schemaVersion,adminId,roleId,assignmentId,occurredAt,requestId}`      |
| `support_access.requested`   | `{schemaVersion,requestId,adminId,userId,scopeKeys,occurredAt}`         |
| `support_access.granted`     | `{schemaVersion,requestId,grantId,adminId,userId,scopeKeys,occurredAt}` |
| `support_access.revoked`     | `{schemaVersion,requestId,grantId,adminId,userId,scopeKeys,occurredAt}` |
| `security.incident_opened`   | `{schemaVersion,incidentId,severity,occurredAt,requestId}`              |
| `privacy.export_ready`       | `{schemaVersion,requestId,userId,expiresAt,occurredAt}`                 |
| `privacy.export_expired`     | `{schemaVersion,requestId,userId,expiresAt,occurredAt}`                 |
| `privacy.deletion_requested` | `{schemaVersion,requestId,userId,occurredAt}`                           |
| `privacy.deletion_completed` | `{schemaVersion,requestId,userId,occurredAt}`                           |

`scopeKeys` is a sorted array of canonical `resource:action` keys, capped at 18.
IDs are opaque UUID/text references with the normal platform bounds. Timestamps
are UTC RFC 3339 values. Consumers deduplicate by outbox envelope ID.

## Alert Input Contract

`security-alert.dispatch` consumes only committed outbox/security evidence for
high/critical events, permission anomalies, audit append failures, suspicious
enumeration, support misuse, privacy failure, or retention backlog. Alert payloads
contain a stable category, severity, opaque evidence ID, occurrence time, safe
runbook key, and correlation ID. They exclude actor/user IDs from metric labels and
exclude all raw evidence from notification text.
