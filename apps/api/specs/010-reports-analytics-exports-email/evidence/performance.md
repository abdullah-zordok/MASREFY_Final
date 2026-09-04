# Performance Evidence

Date: 2026-09-04
Scope: SPEC-BE-010

- A 100,000-row CSV report rendered below the 20,000,000-byte cap and 10-second
  budget; the focused performance project completed in 4.418 seconds.
- Summary p95 and category query-bound checks pass when the live database is
  available; Admin date/platform/page caps pass without a materialized view.
- Worker batch size is configuration-bounded to 1-100; generation, email,
  schedule, expiry, duration, byte, and backlog metrics use fixed-cardinality
  labels.
- SMTP outage, expiry deletion failure, scheduler lag, and cache/query budgets
  are covered by focused worker/recovery/cache tests and actionable alerts.

The final live Admin query p95 rerun awaits the local Supabase recovery recorded
in `database-verification.md`.
