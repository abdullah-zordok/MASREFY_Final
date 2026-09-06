# Operational configuration

Only these runtime settings are mutable in the Free-only release:

- `operations.ai.allowance`: exactly `5`.
- `operations.history.retention_days`: integer `30..365`.
- `operations.provider.timeout_ms`: integer `100..10000`.
- `operations.performance.series_limit`: integer `24..720`.

## Change and rollback

1. Read the current redacted value and version.
2. Record the prior value outside any secret-bearing channel.
3. Patch the allowlisted key with the expected version, bounded value, reason, and fresh idempotency key.
4. Verify the audit event and safe-meta cache invalidation.
5. To roll back, repeat the versioned patch with the recorded prior value. Never add a new setting key during an incident.

## Feature flags

Flags cannot alter authentication, authorization, audit, finance invariants, release controls, or paid capabilities. Valid lifecycle transitions are `draft -> active|retired` and `active -> retired`; retired flags are immutable. Disable an active flag by retiring it or setting its bounded default/rules to false before retirement. Preview accepts only platform, locale, numeric app version, and safe cohort context.
