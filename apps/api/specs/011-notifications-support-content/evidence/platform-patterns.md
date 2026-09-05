# Reused Platform Patterns

- Database: `src/platform/database/pool.service.ts`, migration runner/checksum and
  schema-compatibility utilities; root `supabase/migrations` is canonical.
- Async: `src/platform/outbox/*`, versioned event envelopes, bounded retry policy,
  queue publisher, lease recovery and separate `worker.module.ts` process.
- HTTP: strict global validation, safe exception envelope, request ID/timeout,
  security headers and runtime OpenAPI in `src/platform/http/*`.
- Storage: existing signed/private object patterns in
  `src/tracking/tracking.storage.ts` and `src/reports/reports.storage.ts`.
- Config: fail-closed schema/types/service in `src/platform/config/*`.
- Observability: structured redacting logger, fixed-cardinality metrics, telemetry,
  health/readiness and graceful shutdown under `src/platform/observability` and
  `src/platform/health`.
- Provider email: TLS-only Nodemailer behavior in `src/reports/reports.smtp.ts`.

Phase 11 reuses these paths and adds only the engagement-specific trust-boundary
code. No Redis, ORM, microservice, second queue, or new package is justified.

