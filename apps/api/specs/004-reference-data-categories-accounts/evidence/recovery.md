# Recovery Evidence

Recorded 2026-08-29 against
`apps/api/docs/runbooks/reference-account-recovery.md`.

| Drill | Evidence | Outcome |
| --- | --- | --- |
| Deterministic seed replay | pgTAP 016 repeats all three canonical inserts and asserts zero inserted rows | Pass |
| Audit/outbox failure | live category, account, and Admin integration failure injection | Pass; zero partial resource effect |
| Cache loss/invalidation | reference service unit, observability, and performance runner | Pass; authorized DB fallback and digest invalidation |
| FX provider absent | unit/integration/E2E resolver cases | Pass; identity works, unavailable rates return `FX_UNAVAILABLE` |
| Migration order/checksum | clean reset, migration E2E, checksum command, pgTAP | Pass |
| Release A against Release B | minimum-schema readiness and live identity/preferences suites | Pass; additive N-1 behavior retained |
| Reconciliation | pgTAP 016-018 plus live resource/audit/outbox assertions | Pass |
| Release image | digest-pinned non-root Docker build and 5 container suites/11 tests | Pass |

Rollback is the previous immutable application image plus a reviewed forward SQL
correction. The runbook forbids dropping or rewriting reference keys, categories,
accounts, approved rates, audit rows, or outbox history. No data-destructive drill
was needed or performed.
