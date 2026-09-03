# Database Review

Scope: Phase 08 migrations, RLS/grants, functions, queue grants, and performance
fixtures.

Findings:

- PASS: all Phase 08 mutable owner tables are designed with ownership columns,
  version metadata, lifecycle checks, forced RLS, and narrow policies/grants.
- PASS: private raw payload and attempt tables remain outside client-readable
  grants.
- PASS: security-definer functions use fixed search paths and mediate customer,
  Admin, worker, and service-role behavior through bounded commands.
- PASS: Outbox worker queue access now grants the specific `pgmq` queue table and
  sequence rights required by `pgmq.send` instead of broad schema ownership.
- PASS: performance paths use deterministic fixtures and indexed lookups; Outbox
  one-million-row plan uses `outbox_events_claim_order_idx` with 0.572 ms
  execution time.
- REVIEW: `apps/api/test/performance/tracking.sql` inserts/deletes ledger rows
  only as fixture setup. Production tracking source code does not directly write
  ledger source tables.

Fresh database verification is complete: reset passed, lint returned zero
findings, pgTAP passed 36 files/1,304 assertions, and live integration/E2E passed
56 suites/154 tests and 35 suites/61 tests respectively.
