# Support Access Emergency Revoke

Owner: Security on-call. Severity: critical for suspected misuse, high for expiry/reconciliation failure.

Use the canonical revoke operation with recent MFA and a bounded reason. It locks the request, revokes the grant, appends immutable audit evidence, and emits the safe revocation event. Do not copy the purpose, ticket contents, workspace fields, customer data, or raw identifiers into chat, logs, alerts, or evidence.

If the API is unavailable, pause support tooling and use an approved forward SQL operation under the migration role to set the named grant's `revoked_at`; never broaden a policy or disable RLS. Reconcile request/grant state, confirm `private.assert_support_grant` denies the exact customer/resource/action, inspect only safe event IDs, and restart bounded expiry processing.

Close after post-revoke reads fail, concurrent-use evidence shows no successful access after the authoritative revoke time, one immutable audit record exists, expiry backlog is healthy, and the incident owner has recorded a safe conclusion.
