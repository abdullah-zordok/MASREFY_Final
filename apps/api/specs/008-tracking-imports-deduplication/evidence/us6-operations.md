# US6 Evidence — Operations And Recovery

Status: implemented and locally verified.

Evidence:

- Admin operational projections/actions enforce exact permissions, purpose/reason
  fields, recent-auth where required, expected version, replay, audit, and safe
  events.
- Owner history/feedback, privacy export/deletion hooks, support import-summary,
  raw purge, stale lease reclaim, retry/cancel, parser corpus, duplicate detect,
  and compaction paths are implemented.
- Observability artifacts exist under `ops/observability/` and the tracking
  metrics are registered with bounded enum labels.
- Runbook exists at `docs/runbooks/tracking-imports.md`.
- Focused live recovery gate passed:
  `MASARIFI_LIVE_DATABASE_TESTS=1 npm run test:tracking:recovery` with 1 suite
  and 3 tests passing.
- Fresh Supabase reset/lint/pgTAP and full live integration/E2E passed; raw
  purge token fencing, orphan cleanup reclaim, rollback/forward, migration
  concurrency, and backup/restore are covered.

Acceptance mapping: FR-024, FR-025, FR-027 through FR-039, AC-011 through
AC-018.
