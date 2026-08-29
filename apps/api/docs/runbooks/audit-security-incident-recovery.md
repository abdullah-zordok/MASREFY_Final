# Audit, Security Incident, and Alert Recovery

Owner: Security on-call. Alert-delivery owner: Platform on-call. Audit append failure is critical and must roll back the privileged mutation; alert delivery failure is high and must not roll back committed evidence.

Disable the affected mutation route when audit append failures recur. Verify database availability, forced RLS/grants, immutable triggers, request correlation, and outbox health using opaque evidence IDs only. Apply fixes forward; never update/delete audit, security-event, or incident-timeline rows.

Incident transitions require exact permission, recent MFA, current version, bounded redacted text, and an allowed state action. A stale transition is retried from a fresh read, never force-written. Alert retries consume committed evidence and contain only category, severity, safe runbook key, occurrence time, and correlation ID.

Close after the original mutation either rolled back or has exactly one correlated audit event, timeline history remains immutable, alert delivery is acknowledged or explicitly escalated, reconciliation finds no orphan state, and high/critical evidence has an owner and resolution.
