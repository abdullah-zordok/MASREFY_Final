# Database Verification

Date: 2026-09-04
Scope: SPEC-BE-010

- `npm run migration:checksums`: PASS for all four Phase 10 migrations.
- `npm run db:reset`: PASS from a clean local Supabase database through
  `20260904040000_phase10_report_delivery_webhooks.sql`.
- `npm run db:lint`: PASS with zero findings.
- `npm run test:db`: PASS, 43 files and 1,556 pgTAP assertions.
- `supabase migration down --last 4` then `migration up`: PASS using the local
  `supabase_admin` migration role because the CLI's local `postgres` role is
  intentionally not a superuser. The four Phase 10 migrations reverted to the
  Phase 9 boundary and reapplied successfully.
- Checksums, database lint, and all 43/1,556 pgTAP checks passed again after the
  rollback/reapply cycle.
- `npm run test:migration`: PASS, 4 suites/4 tests covering apply inventory,
  checksums, concurrent migration locking, and backup/restore compatibility.
