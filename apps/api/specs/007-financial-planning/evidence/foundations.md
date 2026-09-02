# Phase 07 Foundation Evidence

## Red

- `npx supabase test db supabase/tests/029_planning_structure.test.sql supabase/tests/030_planning_rls_grants.test.sql supabase/tests/031_planning_commands_views.test.sql supabase/tests/032_planning_jobs_reconciliation.test.sql --workdir .`
  executed 206 assertions and failed at the intended missing Phase 07 tables,
  policies, functions, views, and worker-support boundaries.
- The focused Jest DTO and container suites failed to compile only because
  `src/planning/planning.dto.ts` and `src/planning/planning.module.ts` did not
  exist. The contract suite parsed all 21 paths and 35 unique operations, then
  failed because the runtime had no planning route.

## Green Foundation

- A clean `npx supabase db reset --workdir .` applied all three Phase 07
  migrations through `20260831120200_phase07_planning_access.sql`.
- pgTAP 029-032 passed: 143 structure assertions, 34 RLS/grant assertions, 17
  command/view assertions, and 12 worker/reconciliation assertions (206 total).
- `npx supabase db lint --workdir . --schema public,private,audit --level error --fail-on error`
  reported no schema errors.
- Planning DTO/event unit tests passed 31/31; planning container registration
  passed 1/1; API TypeScript typecheck passed.
- The API process imports only `PlanningModule`; the worker process imports only
  `PlanningWorkerModule`. No second queue or runtime job registry was added.
- Migration checksum generation and verification passed, and the live migration
  application test passed 1/1 after two idempotent runner invocations.

## Security Inventory

- Eleven public planning tables enable and force RLS.
- Browser roles and `service_role` have no direct planning table grants.
- `masarifi_api` has owner-filtered `SELECT` only; mutations are explicit
  fixed-search-path functions. `masarifi_worker` has worker function execution
  only, not direct table mutation.
- Admin access is a read-only function guarded by the seeded `planning.read`
  permission. No Admin mutation policy or route exists.
- Mutable roots use the shared version trigger. Allocation and savings movement
  histories reject updates and deletes.

The approved OpenAPI runtime test intentionally remains red at the missing route
boundary; story tasks own those operations and must turn them green without
claiming behavior from the foundation shell.
