# Admin Permission, Bootstrap, and Recovery

Owner: Security on-call. Approver: a different authorized release owner. Severity: high for drift/lockout, critical for unauthorized success.

Keep `MASARIFI_ADMIN_ROUTES_ENABLED=false` until migrations, pgTAP, the 151-key drift test, and a verified Clerk profile all pass. Record only opaque subject/approval references. Two people then run `npm run admin:bootstrap -- --user-id <opaque-subject> --approved-by <different-opaque-approval> --reason <approved-reason>`. The command is advisory-locked, idempotent, audited, and refuses enabled routes.

For permission drift, disable Admin routes, compare the server/client manifest hashes, remove unsafe role mappings with a forward migration or guarded role command, rerun the exact-permission matrix, then re-enable. For invitation exposure, revoke the local invitation first; any delayed provider link then fails closed. For Clerk session-revocation outage, keep the Admin profile suspended and retry the bounded revoke endpoint after provider recovery.

Never alter history or use a role/header/Clerk metadata value as authority. Recovery is closed only when one effective MFA-capable super-admin remains, the exact-permission query passes, audit/outbox evidence exists, no plaintext token was retained, and the route gate is deliberately enabled by the release owner.
