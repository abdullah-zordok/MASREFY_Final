# Security Review

Scope: hostile files/payloads, RLS/grants, exact permissions, parser DSL,
idempotency, storage references, ledger boundary, telemetry, and secrets.

Executed scans:

- `git diff --check`: PASS.
- Changed-file search for `SPEC-BE-009`, `assistant`, `voice`, and `OpenRouter`:
  only scope notes, legacy Admin source enum/filter values, pre-existing Mobile
  mock references, and pre-existing `voice-temp` migration-test coverage were
  found.
- Changed production tracking scan for direct writes to `transactions`,
  `transaction_postings`, and `account_balances`: no production hit found.
  `apps/api/test/performance/tracking.sql` contains ledger fixture setup only.

Findings:

- PASS: hostile content is rejected before parser execution or private raw
  retention.
- PASS: parser definitions are constrained data, not executable code.
- PASS: worker/service-role access remains through narrow functions/grants.
- PASS: events and metrics reject raw/sensitive/high-cardinality fields.
- PASS: Admin exact permission, reason, recent-auth, and purpose controls are
  represented in DTOs, repository methods, and tests.

Dependency gate:

- `npm audit --audit-level=high` passed inside the fresh API verify run.
- The audit output reports one moderate `qs` advisory, below the configured
  release-blocking threshold.
